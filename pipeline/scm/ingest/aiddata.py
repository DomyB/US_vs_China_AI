"""AidData Global Chinese Development Finance Dataset v3.0 -> finance_event."""
from __future__ import annotations

import re

import pandas as pd

from ..http import Snapshot
from ..registry import IN_SCOPE, iso3_from_name
from .base import Adapter, event_id, to_float
from .util import col, read_any, sheet_names, tag_mineral

PAGE = "https://www.aiddata.org/data/aiddatas-global-chinese-development-finance-dataset-version-3-0"
LINK_RE = re.compile(r"https?://[^\"' ]+(?:GCDF|Global_Chinese_Development_Finance)[^\"' ]*\.(?:xlsx|zip|csv)", re.I)


class AidData(Adapter):
    source_id = "aiddata_gcdf"
    tables = ("finance_event",)

    def fetch(self, snap: Snapshot) -> None:
        html = snap.get(PAGE, "page.html").read_text(encoding="utf-8", errors="ignore")
        m = LINK_RE.search(html)
        if not m:
            raise RuntimeError("GCDF 3.0 download link not found on the AidData page")
        url = m.group(0)
        snap.get(url, "gcdf." + url.rsplit(".", 1)[-1].lower())

    def parse(self, snap: Snapshot) -> dict[str, pd.DataFrame]:
        path = next(snap.path(n) for n in snap.files if n.startswith("gcdf."))
        if path.suffix == ".zip":
            import zipfile

            with zipfile.ZipFile(path) as z:
                inner = next(n for n in z.namelist() if n.lower().endswith((".xlsx", ".csv")))
                z.extract(inner, snap.dir / "unzipped")
                path = snap.dir / "unzipped" / inner
        sheet = next((s for s in sheet_names(path) if "gcdf" in s.lower() or "data" in s.lower()), 0) if path.suffix == ".xlsx" else None
        df = read_any(path, sheet=sheet)
        c_id = col(df, "AidData Record ID", "record id")
        c_rec = col(df, "Recipient")
        c_year = col(df, "Commitment Year")
        c_title = col(df, "Title")
        c_desc = col(df, "Description", required=False)
        c_sector = col(df, "Sector Name", "Sector")
        c_flow = col(df, "Flow Type", required=False)
        c_fund = col(df, "Funding Agencies", "Funder", required=False)
        c_recv = col(df, "Receiving Agencies", "Implementing Agencies", required=False)
        c_amt = col(df, "Amount (Nominal USD)", "Amount (Constant USD 2021)", "Amount")
        c_date = col(df, "Commitment Date", required=False)
        c_url = col(df, "Source URLs", required=False)
        c_agg = col(df, "Recommended For Aggregates", required=False)
        rows: list[dict] = []
        for _, r in df.iterrows():
            iso = iso3_from_name(r[c_rec])
            if iso not in IN_SCOPE:
                continue
            year = to_float(r[c_year])
            if year is None:
                continue
            title = str(r[c_title])
            desc = str(r[c_desc]) if c_desc else ""
            text = f"{title} {desc} {r[c_sector]}"
            rows.append({
                "event_id": event_id("aiddata", r[c_id]), "country": iso, "date": str(r[c_date])[:10] if c_date and pd.notna(r[c_date]) else None,
                "year": int(year), "actor_from": str(r[c_fund]) if c_fund and pd.notna(r[c_fund]) else "Chinese official-sector funder",
                "actor_from_origin": "CN", "actor_to": str(r[c_recv]) if c_recv and pd.notna(r[c_recv]) else None,
                "type": str(r[c_flow]).lower() if c_flow and pd.notna(r[c_flow]) else "official finance",
                "amount_usd": to_float(r[c_amt]), "currency": "USD", "sector": str(r[c_sector]), "mineral": tag_mineral(text),
                "description": (title + (": " + desc[:400] + ("…" if len(desc) > 400 else "") if desc and desc != "nan" else "")),
                "value_type": "reported", "source_record_url": (str(r[c_url]).split(";")[0].strip() if c_url and pd.notna(r[c_url]) else None),
                "confidence": "documented" if (c_agg is None or str(r[c_agg]).lower().startswith("y")) else "strongly_indicated",
            })
        out = pd.DataFrame(rows)
        return {"finance_event": self.stamp(snap, out)}
