"""US International Development Finance Corporation active projects -> finance_event."""
from __future__ import annotations

import re

import pandas as pd

from ..http import Snapshot
from ..registry import IN_SCOPE, iso3_from_name
from .base import Adapter, event_id, to_float
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
        c_amt = col(df, "Committed Amount", "Commitment", "Amount")
        c_type = col(df, "Project Type", "Product", "Type", required=False)
        c_sector = col(df, "Sector", required=False)
        c_desc = col(df, "Project Description", "Description", required=False)
        c_client = col(df, "Client", "Borrower", "Sponsor", required=False)
        rows: list[dict] = []
        for i, r in df.iterrows():
            iso = iso3_from_name(r[c_country])
            if iso not in IN_SCOPE:
                continue
            ystr = str(r[c_year])
            m = re.search(r"(20\d{2})", ystr)
            if not m:
                continue
            desc = str(r[c_desc]) if c_desc and pd.notna(r[c_desc]) else ""
            rows.append({
                "event_id": event_id("dfc", r[c_name], r[c_country], ystr, r[c_amt], i), "country": iso, "date": None, "year": int(m.group(1)),
                "actor_from": "US International Development Finance Corporation", "actor_from_origin": "US",
                "actor_to": str(r[c_client]) if c_client and pd.notna(r[c_client]) else str(r[c_name]),
                "type": str(r[c_type]).lower() if c_type and pd.notna(r[c_type]) else "dfc commitment",
                "amount_usd": to_float(r[c_amt]), "currency": "USD", "sector": str(r[c_sector]) if c_sector else None,
                "mineral": tag_mineral(f"{r[c_name]} {desc} {r[c_sector] if c_sector else ''}"),
                "description": f"{r[c_name]}" + (f": {desc[:400]}" if desc else ""), "value_type": "reported",
                "source_record_url": snap.files[path.name]["url"],
            })
        return {"finance_event": self.stamp(snap, pd.DataFrame(rows))}
