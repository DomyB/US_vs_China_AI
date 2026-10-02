"""Guyana: GGMC commodities table (CSV, 1979-2024) -> production."""
from __future__ import annotations

import re

import pandas as pd

from ..http import Snapshot
from .base import Adapter, to_float
from .util import tag_mineral

UNIT_RE = re.compile(r"\(([^)]+)\)")


class GGMC(Adapter):
    source_id = "guy_ggmc"
    tables = ("production",)

    def fetch(self, snap: Snapshot) -> None:
        snap.get(self.src.url, "commodities.csv", timeout=120)

    def parse(self, snap: Snapshot) -> dict[str, pd.DataFrame]:
        path = snap.path("commodities.csv")
        lines = path.read_text(encoding="utf-8", errors="ignore").splitlines()
        hdr = next((i for i, line in enumerate(lines[:20]) if "year" in line.lower()), 0)  # preamble rows are ragged
        df = pd.read_csv(path, skiprows=hdr, dtype=str, keep_default_na=False, encoding_errors="ignore")
        snap.manifest["columns"] = list(map(str, df.columns))[:30]
        c_year = next(c for c in df.columns if "year" in str(c).lower())
        rows: list[dict] = []
        for c in df.columns:
            if c == c_year:
                continue
            label = str(c)
            mineral = tag_mineral(label.replace("Bauxite", "bauxite aluminum"))
            if mineral is None:
                continue
            unit = (UNIT_RE.search(label).group(1) if UNIT_RE.search(label) else "see source table").strip()
            for _, r in df.iterrows():
                m = re.search(r"(19|20)\d{2}", str(r[c_year]))
                qty = to_float(r[c])
                if not m or qty is None:
                    continue
                rows.append({"country": "GUY", "mineral": mineral, "measure": "production", "year": int(m.group(0)), "qty": qty, "unit": unit,
                             "value_type": "reported", "note": f"GGMC commodities table, column {label}", "source_record_url": self.src.url})
        return {"production": self.stamp(snap, pd.DataFrame(rows, columns=["country", "mineral", "measure", "year", "qty", "unit", "value_type", "note", "source_record_url"]))}
