"""World Bank Commodity Price Data (Pink Sheet), monthly."""
from __future__ import annotations

import re

import pandas as pd

from ..http import Snapshot
from .base import Adapter, to_float
from .util import find_header_row

PAGE = "https://www.worldbank.org/en/research/commodity-markets"
LINK_RE = re.compile(r"https?://[^\"' ]+CMO-Historical-Data-Monthly\.xlsx", re.I)
SERIES = {  # Pink Sheet column label fragment -> mineral id
    "copper": "copper", "nickel": "nickel", "tin": "tin", "silver": "silver", "aluminum": "bauxite_aluminum",
    "iron ore": "iron_ore", "zinc": "zinc", "gold": "gold", "phosphate rock": "phosphate_potash", "potassium chloride": "phosphate_potash",
}


class PinkSheet(Adapter):
    source_id = "wb_pink_sheet"
    tables = ("price",)

    def fetch(self, snap: Snapshot) -> None:
        html = snap.get(PAGE, "page.html").read_text(encoding="utf-8", errors="ignore")
        m = LINK_RE.search(html)
        if not m:
            raise RuntimeError("Pink Sheet monthly XLSX link not found on the commodity markets page")
        snap.get(m.group(0), "CMO-Historical-Data-Monthly.xlsx")

    def parse(self, snap: Snapshot) -> dict[str, pd.DataFrame]:
        path = snap.path("CMO-Historical-Data-Monthly.xlsx")
        raw = pd.read_excel(path, sheet_name="Monthly Prices", header=None)
        h = find_header_row(raw, "copper")
        header = raw.iloc[h].tolist()
        units = raw.iloc[h + 1].tolist() if h + 1 < len(raw) else [None] * len(header)
        data = raw.iloc[h + 2:].reset_index(drop=True)
        rows: list[dict] = []
        for j, label in enumerate(header):
            if j == 0 or not isinstance(label, str):
                continue
            key = next((k for k in SERIES if label.lower().startswith(k)), None)
            if key is None:
                continue
            for _, r in data.iterrows():
                d = str(r.iloc[0])
                mm = re.match(r"(\d{4})M(\d{2})", d)
                if not mm:
                    continue
                y, mo = int(mm.group(1)), int(mm.group(2))
                if y < 2000:
                    continue
                rows.append({"mineral": SERIES[key], "series": f"World Bank Pink Sheet: {label}", "date": f"{y}-{mo:02d}-01", "year": y, "month": mo,
                             "price": to_float(r.iloc[j]), "unit": str(units[j]) if units[j] is not None else "see source", "value_type": "reported", "note": None,
                             "source_record_url": snap.files["CMO-Historical-Data-Monthly.xlsx"]["url"]})
        df = pd.DataFrame(rows, columns=["mineral", "series", "date", "year", "month", "price", "unit", "value_type", "note", "source_record_url"])
        return {"price": self.stamp(snap, df)}
