"""US International Development Finance Corporation active projects -> finance_event."""
from __future__ import annotations

import re

import pandas as pd

from ..http import Snapshot
from ..registry import IN_SCOPE, iso3_from_name
from .base import FINANCE_EVENT_COLUMNS, Adapter, event_id, to_float
from .util import col, sheet_names, tag_mineral

PAGES = {"page.html": "https://www.dfc.gov/our-impact/transaction-data", "active.html": "https://www.dfc.gov/what-we-do/active-projects"}
LINK_RE = re.compile(r"href=[\"']([^\"']+\.(?:xlsx|xls|csv)(?:\?[^\"']*)?)[\"']", re.I)


class DFC(Adapter):
    source_id = "dfc_projects"
    tables = ("finance_event",)

    def fetch(self, snap: Snapshot) -> None:
        links: list[str] = []
        for fname, url in PAGES.items():
            html = snap.get(url, fname).read_text(encoding="utf-8", errors="ignore")
            for u in LINK_RE.findall(html):
                if u.startswith("/"):
                    u = "https://www.dfc.gov" + u
                if "dfc.gov" in u and u not in links:
                    links.append(u)
        snap.manifest["spreadsheet_links"] = links
        snap.save()
        if not links:
            raise RuntimeError("DFC: no spreadsheet link on the transaction-data or active-projects pages (see spreadsheet_links in the manifest)")
        url = links[0]
        ext = url.split("?")[0].rsplit(".", 1)[-1].lower()
        snap.get(url, "dfc." + ("xlsx" if ext in ("xlsx", "xls") else "csv"), timeout=300)

    def parse(self, snap: Snapshot) -> dict[str, pd.DataFrame]:
        path = next(snap.path(n) for n in snap.files if n.startswith("dfc."))
        if path.suffix == ".xlsx":
            sheet = next((s for s in sheet_names(path) if "project" in s.lower() or "data" in s.lower()), 0)
            raw = pd.read_excel(path, sheet_name=sheet, header=None)
            hdr = next((i for i in range(min(15, len(raw))) if any("country" in str(v).lower() for v in raw.iloc[i].tolist())), 0)
            df = pd.read_excel(path, sheet_name=sheet, header=hdr)
        else:
            df = pd.read_csv(path)
        c_name = col(df, "Project Name", "Name")
        c_country = col(df, "Country")
        c_year = col(df, "Fiscal Year", "Year", "Board Date", "Commitment Date")
        c_amt = col(df, "Committed Amount", "Committed", "Commitment", "Amount")
        c_type = col(df, "Support Type", "Project Type", "Product", "Type", required=False)
        c_sector = col(df, "NAICS Sector", "Sector", required=False)
        c_desc = col(df, "Project Description", "Description", required=False)
        c_client = col(df, "Client", "Borrower", "Sponsor", required=False)
        c_url = col(df, "Project Profile URL", "URL", required=False)
        c_agency = col(df, "Originating Agency", required=False)
        c_number = col(df, "Project Number", required=False)
        c_currency = col(df, "Currency", required=False)
        c_sov = col(df, "Sovereign", required=False)
        rows: list[dict] = []
        for i, r in df.iterrows():
            iso = iso3_from_name(r[c_country])
            if iso not in IN_SCOPE:
                continue
            ystr = str(r[c_year])
            m = re.search(r"(19\d{2}|20\d{2})", ystr)
            if not m:
                continue
            desc = str(r[c_desc]) if c_desc and pd.notna(r[c_desc]) else ""
            agency = str(r[c_agency]) if c_agency and pd.notna(r[c_agency]) else "DFC"
            actor_from = "US International Development Finance Corporation" if "dfc" in agency.lower() else f"{agency} (predecessor of DFC)"
            record_url = str(r[c_url]) if c_url and pd.notna(r[c_url]) and str(r[c_url]).startswith("http") else snap.files[path.name]["url"]
            bits = [str(r[c_name])]
            if desc:
                bits.append(desc[:400] + ("…" if len(desc) > 400 else ""))
            if c_sov and pd.notna(r[c_sov]):
                bits.append(f"sovereign: {r[c_sov]}")
            rows.append({
                "event_id": event_id("dfc", r[c_number] if c_number and pd.notna(r[c_number]) else i, r[c_name], r[c_country], ystr, r[c_amt]), "country": iso, "date": None, "year": int(m.group(1)),
                "actor_from": actor_from, "actor_from_origin": "US",
                "actor_to": str(r[c_client]) if c_client and pd.notna(r[c_client]) else str(r[c_name]),
                "type": str(r[c_type]).lower() if c_type and pd.notna(r[c_type]) else "dfc commitment",
                "amount_usd": to_float(r[c_amt]), "currency": str(r[c_currency]) if c_currency and pd.notna(r[c_currency]) else "USD",
                "sector": str(r[c_sector]) if c_sector and pd.notna(r[c_sector]) else None,
                "mineral": tag_mineral(f"{r[c_name]} {desc} {r[c_sector] if c_sector else ''}"),
                "description": ": ".join(bits[:2]) + (f" ({bits[2]})" if len(bits) > 2 else ""), "value_type": "reported",
                "source_record_url": record_url,
            })
        return {"finance_event": self.stamp(snap, pd.DataFrame(rows, columns=FINANCE_EVENT_COLUMNS))}
