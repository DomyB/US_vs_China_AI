"""Guyana: GGMC "Guyana mineral production declared" table (CSV, 1979-2024) -> production.

The sheet has a three-row header: a MINERALS row (forward-filled across company columns), a
COMPANY row (gold is split by producer with a GRAND TOTAL) and a YEAR row that carries the unit
of each column (OZs, KGs, Metric Cts, TONNES, x1000 TONNES). Only the grand-total gold column and
the single-column minerals are kept, so nothing is double counted.
"""
from __future__ import annotations

import csv
import re

import pandas as pd

from ..http import Snapshot
from .base import Adapter, to_float
from .util import tag_mineral

PROD_COLUMNS = ["country", "mineral", "measure", "year", "qty", "unit", "value_type", "note", "source_record_url"]


class GGMC(Adapter):
    source_id = "guy_ggmc"
    tables = ("production",)

    def fetch(self, snap: Snapshot) -> None:
        snap.get(self.src.url, "commodities.csv", timeout=120)

    def parse(self, snap: Snapshot) -> dict[str, pd.DataFrame]:
        rows_raw = list(csv.reader(snap.path("commodities.csv").open(encoding="utf-8", errors="ignore")))
        def find_row(word: str) -> list[str] | None:
            return next((r for r in rows_raw[:30] if r and str(r[0]).strip().upper().startswith(word)), None)
        minerals_row, company_row, year_row = find_row("MINERALS"), find_row("COMPANY"), find_row("YEAR")
        if minerals_row is None or year_row is None:
            snap.manifest["parse_note"] = "header rows MINERALS/YEAR not found"
            return {"production": self.stamp(snap, pd.DataFrame(columns=PROD_COLUMNS))}
        width = max(len(minerals_row), len(year_row))
        minerals_row += [""] * (width - len(minerals_row))
        year_row += [""] * (width - len(year_row))
        company_row = (company_row or []) + [""] * (width - len(company_row or []))
        # forward-fill the mineral label across its company columns
        labels: list[str] = []
        current = ""
        for v in minerals_row:
            current = v.strip() or current
            labels.append(current)
        columns: list[tuple[int, str, str]] = []  # (index, mineral_id, unit)
        for i in range(1, width):
            label, company, unit = labels[i], company_row[i].strip().upper(), year_row[i].strip()
            mineral = tag_mineral(label.replace("BAUXITE", "bauxite aluminum").title())
            if mineral is None or not unit:
                continue
            many_companies = sum(1 for j in range(1, width) if labels[j] == label and year_row[j].strip()) > 1
            if many_companies and "TOTAL" not in company:
                continue  # per-company gold columns
            if many_companies and unit.upper().startswith("KG"):
                continue  # keep ounces once, not the kilogram duplicate
            columns.append((i, mineral, unit))
        snap.manifest["columns_used"] = [{"index": i, "mineral": m, "unit": u} for i, m, u in columns]
        start = rows_raw.index(year_row) + 1
        out: list[dict] = []
        for r in rows_raw[start:]:
            if not r or not re.match(r"\s*(19|20)\d{2}", str(r[0])):
                continue
            year = int(re.match(r"\s*((?:19|20)\d{2})", str(r[0])).group(1))
            for i, mineral, unit in columns:
                qty = to_float(r[i]) if i < len(r) else None
                if qty is None:
                    continue
                out.append({"country": "GUY", "mineral": mineral, "measure": "production", "year": year, "qty": qty, "unit": unit, "value_type": "reported",
                            "note": f"GGMC declared production, column {labels[i]} {company_row[i].strip()}".strip(), "source_record_url": self.src.url})
        return {"production": self.stamp(snap, pd.DataFrame(out, columns=PROD_COLUMNS))}
