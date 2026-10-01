"""Export-Import Bank of the United States authorizations (data.gov CSV) -> finance_event."""
from __future__ import annotations

import pandas as pd

from ..http import Snapshot
from ..registry import IN_SCOPE, iso3_from_name
from .base import Adapter, event_id, to_float
from .util import col, tag_mineral

# data.gov has served its CKAN API under both prefixes over time; try each.
API_BASES = ["https://catalog.data.gov/api/3/action", "https://catalog.data.gov/api/action"]
PACKAGE_IDS = ["authorizations-from-10-01-2006-thru-12-31-2022", "authorizations-from-10-01-2006-thru-9-30-2025"]


class EXIM(Adapter):
    source_id = "exim_authorizations"
    tables = ("finance_event",)

    def fetch(self, snap: Snapshot) -> None:
        resources: list[dict] = []
        for base in API_BASES:
            for pid in PACKAGE_IDS:
                try:
                    pkg = snap.get_json(f"{base}/package_show", f"package_{pid[:40]}.json", params={"id": pid})
                    resources = pkg.get("result", {}).get("resources", []) if isinstance(pkg, dict) else []
                    if resources:
                        break
                except Exception as e:  # noqa: BLE001 - try the next id / base, then search
                    snap.manifest.setdefault("errors", []).append({"name": f"{base}/package_show?id={pid}", "error": str(e)[:200]})
                    continue
            if resources:
                break
            try:
                res = snap.get_json(f"{base}/package_search", "search.json", params={"q": "exim authorizations", "fq": "organization:exim-gov", "rows": 20})
                pkgs = res.get("result", {}).get("results", []) if isinstance(res, dict) else []
                pkgs = [p for p in pkgs if "authorization" in str(p.get("title", "")).lower()]
                pkgs.sort(key=lambda p: str(p.get("metadata_modified", "")), reverse=True)
                if pkgs:
                    resources = pkgs[0].get("resources", [])
                    snap.manifest["package_title"] = pkgs[0].get("title")
                    break
            except Exception as e:  # noqa: BLE001
                snap.manifest.setdefault("errors", []).append({"name": f"{base}/package_search", "error": str(e)[:200]})
        snap.save()
        csvs = [r for r in resources if str(r.get("format", "")).lower() == "csv" or str(r.get("url", "")).lower().endswith(".csv")]
        if not csvs:
            raise RuntimeError("no CSV resource found for EXIM authorizations on data.gov")
        snap.get(csvs[0]["url"], "exim.csv")

    def parse(self, snap: Snapshot) -> dict[str, pd.DataFrame]:
        df = pd.read_csv(snap.path("exim.csv"), low_memory=False, encoding_errors="ignore")
        c_country = col(df, "Primary Export Market", "Country", "Market")
        c_year = col(df, "Fiscal Year", "Authorization Date", "Date")
        c_amt = col(df, "Approved Amount", "Authorized Amount", "Amount", "Disbursed")
        c_prod = col(df, "Primary Export Product", "Product", "Program", required=False)
        c_borrower = col(df, "Primary Borrower", "Borrower", "Obligor", required=False)
        c_exporter = col(df, "Primary Exporter", "Exporter", required=False)
        c_program = col(df, "Program", "Deal Type", required=False)
        rows: list[dict] = []
        for i, r in df.iterrows():
            iso = iso3_from_name(r[c_country])
            if iso not in IN_SCOPE:
                continue
            ystr = str(r[c_year])
            yr = next((int(tok) for tok in ystr.replace("/", "-").split("-") if tok.isdigit() and len(tok) == 4), None)
            if yr is None:
                continue
            prod = str(r[c_prod]) if c_prod and pd.notna(r[c_prod]) else ""
            rows.append({
                "event_id": event_id("exim", ystr, r[c_country], r[c_amt], r[c_borrower] if c_borrower else "", i), "country": iso, "date": None, "year": yr,
                "actor_from": "Export-Import Bank of the United States", "actor_from_origin": "US",
                "actor_to": str(r[c_borrower]) if c_borrower and pd.notna(r[c_borrower]) else None,
                "type": (str(r[c_program]).lower() if c_program and pd.notna(r[c_program]) else "exim authorization"),
                "amount_usd": to_float(r[c_amt]), "currency": "USD", "sector": prod or None, "mineral": tag_mineral(prod),
                "description": f"EXIM authorization: {prod or 'product not stated'}" + (f"; exporter {r[c_exporter]}" if c_exporter and pd.notna(r[c_exporter]) else ""),
                "value_type": "reported", "source_record_url": snap.files["exim.csv"]["url"],
            })
        return {"finance_event": self.stamp(snap, pd.DataFrame(rows))}
