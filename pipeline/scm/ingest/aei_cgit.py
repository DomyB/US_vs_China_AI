"""AEI / Heritage China Global Investment Tracker -> deal_event (investment and construction)."""
from __future__ import annotations

import pandas as pd

from ..http import Snapshot
from ..registry import IN_SCOPE, iso3_from_name
from .base import Adapter, event_id, fetch_manual, to_float
from .util import col, sheet_names, tag_mineral

PAGE = "https://www.aei.org/china-global-investment-tracker/"


class CGIT(Adapter):
    source_id = "aei_cgit"
    tables = ("deal_event",)

    requires_env = ("CGIT_FILE_URL",)

    def fetch(self, snap: Snapshot) -> None:
        """aei.org sits behind a Cloudflare browser challenge that returns 403 to any automated client,
        so the tracker cannot be fetched from a runner. CGIT_FILE_URL points to a copy the project owner
        downloaded by hand (the file is free for public use with citation)."""
        import os

        fetch_manual(snap, os.environ["CGIT_FILE_URL"], "cgit.xlsx", PAGE, timeout=300)

    def parse(self, snap: Snapshot) -> dict[str, pd.DataFrame]:
        path = snap.path("cgit.xlsx")
        rows: list[dict] = []
        for sheet in sheet_names(path):
            low = sheet.lower()
            kind = "investment" if "invest" in low or "dataset 1" in low else "construction" if "construct" in low or "dataset 2" in low else None
            if kind is None:
                continue
            raw = pd.read_excel(path, sheet_name=sheet, header=None)
            hdr = next((i for i in range(min(15, len(raw))) if any("investor" in str(v).lower() or "contractor" in str(v).lower() for v in raw.iloc[i].tolist())), None)
            if hdr is None:
                continue
            df = pd.read_excel(path, sheet_name=sheet, header=hdr)
            c_year = col(df, "Year")
            c_month = col(df, "Month", required=False)
            c_inv = col(df, "Investor", "Contractor")
            c_amt = col(df, "Quantity in Millions", "Quantity")
            c_party = col(df, "Transaction Party", "Partner", required=False)
            c_sector = col(df, "Sector")
            c_sub = col(df, "Subsector", required=False)
            c_country = col(df, "Country")
            c_share = col(df, "Share Size", required=False)
            for i, r in df.iterrows():
                iso = iso3_from_name(r[c_country])
                if iso not in IN_SCOPE:
                    continue
                year = to_float(r[c_year])
                if year is None:
                    continue
                month = int(to_float(r[c_month]) or 0) if c_month else 0
                amount = to_float(r[c_amt])
                desc_bits = [f"{kind} by {r[c_inv]}", f"sector {r[c_sector]}"]
                if c_sub and pd.notna(r[c_sub]):
                    desc_bits.append(f"subsector {r[c_sub]}")
                if c_party and pd.notna(r[c_party]):
                    desc_bits.append(f"with {r[c_party]}")
                if c_share and pd.notna(r[c_share]):
                    desc_bits.append(f"share {r[c_share]}")
                rows.append({
                    "event_id": event_id("cgit", kind, r[c_year], month, r[c_inv], r[c_country], amount, r[c_sector], i),
                    "country": iso, "date": f"{int(year)}-{month:02d}-01" if month else None, "year": int(year), "type": kind,
                    "actors": "; ".join(str(x) for x in [r[c_inv], r[c_party] if c_party else None] if x is not None and str(x) != "nan"),
                    "actor_origin": "CN", "amount_usd": amount * 1e6 if amount is not None else None,
                    "mineral": tag_mineral(f"{r[c_sector]} {r[c_sub] if c_sub else ''} {r[c_party] if c_party else ''}"),
                    "project": None, "description": "; ".join(desc_bits), "value_type": "reported",
                    "source_record_url": snap.files["cgit.xlsx"]["url"],
                })
        out = pd.DataFrame(rows)
        return {"deal_event": self.stamp(snap, out, confidence="strongly_indicated")}
