"""USGS Mineral Commodity Summaries data release (ScienceBase): world production, reserves, prices.

The exact CSV layout is discovered at parse time: a country column plus columns
whose names contain a four-digit year and 'prod' or 'reserv'. Unknown layouts are
reported, not guessed.
"""
from __future__ import annotations

import re

import pandas as pd

from ..http import Snapshot
from ..registry import IN_SCOPE, iso3_from_name
from .base import Adapter, to_float
from .util import tag_mineral

SCIENCEBASE_ITEM = "https://www.sciencebase.gov/catalog/item/69837e43b66b01367d7ec7c7"
YEAR_RE = re.compile(r"(20\d{2})")
EDITION_RE = re.compile(r"mcs(20\d{2})", re.I)
# USGS five-letter commodity abbreviations used in MCS data-release file names.
USGS_ABBREV = {
    "lithi": "lithium", "coppe": "copper", "raree": "rare_earths", "niobi": "niobium", "graph": "graphite", "nicke": "nickel",
    "tin": "tin", "silve": "silver", "molyb": "molybdenum", "cobal": "cobalt", "manga": "manganese", "bauxi": "bauxite_aluminum",
    "alumi": "bauxite_aluminum", "urani": "uranium", "tungs": "tungsten", "zinc": "zinc", "gold": "gold", "phosp": "phosphate_potash",
    "potas": "phosphate_potash", "feore": "iron_ore", "irore": "iron_ore", "titan": "titanium", "galli": "gallium_germanium_antimony",
    "germa": "gallium_germanium_antimony", "antim": "gallium_germanium_antimony",
}


def mineral_from_filename(name: str) -> str | None:
    base = name.split("/")[-1].lower()
    for abbrev, mineral in USGS_ABBREV.items():
        if f"-{abbrev}" in base or f"_{abbrev}" in base or base.startswith(abbrev):
            return mineral
    return tag_mineral(base.replace("_", " ").replace("-", " "))


class USGSMCS(Adapter):
    source_id = "usgs_mcs"
    tables = ("production", "price")
    min_interval = 0.5

    def fetch(self, snap: Snapshot) -> None:
        item = snap.get_json(SCIENCEBASE_ITEM, "item.json", params={"format": "json"})
        files = item.get("files", []) if isinstance(item, dict) else []
        snap.manifest["file_list"] = [f.get("name") for f in files]
        snap.save()
        for f in files:
            name = str(f.get("name", ""))
            if name.lower().endswith(".csv"):
                snap.get(f["url"], f"files/{name}", timeout=600)

    def parse(self, snap: Snapshot) -> dict[str, pd.DataFrame]:
        prod_rows: list[dict] = []
        price_rows: list[dict] = []
        notes: dict[str, object] = {}
        for name, meta in snap.files.items():
            if not name.startswith("files/") or not snap.has(name):
                continue
            edition = EDITION_RE.search(name)
            data_year = int(edition.group(1)) - 1 if edition else None
            try:
                df = pd.read_csv(snap.path(name), low_memory=False, encoding_errors="ignore")
            except Exception as e:  # noqa: BLE001
                notes[name] = f"unreadable: {e}"[:200]
                continue
            cols = {str(c).lower(): c for c in df.columns}

            def find(*keys, exclude=(), cols=cols):
                for k, c in cols.items():
                    if any(key in k for key in keys) and not any(x in k for x in exclude):
                        return c
                return None

            c_country = find("country", "source")
            c_commodity = find("commodity", "mineral")
            c_year = find("year")
            c_type = find("type", "statistic", "measure", "variable", "item")
            c_value = find("value", "quantity", "amount")
            c_unit = find("unit")
            notes[name] = {"columns": list(map(str, df.columns))[:30]}
            if c_country is None or c_commodity is None:
                notes[name]["skipped"] = "no country/commodity column"
                continue
            file_mineral = mineral_from_filename(name)
            year_cols = [(c, int(YEAR_RE.search(str(c)).group(1))) for c in df.columns if YEAR_RE.search(str(c))]
            for _, r in df.iterrows():
                iso = iso3_from_name(r[c_country])
                if iso not in IN_SCOPE:
                    continue
                mineral = tag_mineral(r[c_commodity]) or file_mineral
                if mineral is None:
                    continue
                unit = str(r[c_unit]) if c_unit and pd.notna(r[c_unit]) else "see source table"
                ttext = str(r[c_type]).lower() if c_type and pd.notna(r[c_type]) else ""
                if c_year and c_value and not year_cols:
                    # long format: one row per country, commodity, year, statistic
                    ym = YEAR_RE.search(str(r[c_year]))
                    if not ym:
                        continue
                    measure = "production" if "prod" in ttext else "reserves" if "reserv" in ttext else None
                    if measure is None and "price" in ttext:
                        price_rows.append({"mineral": mineral, "series": f"USGS MCS: {r[c_type]}", "date": f"{ym.group(1)}-01-01", "year": int(ym.group(1)), "month": pd.NA, "price": to_float(r[c_value]), "unit": unit, "value_type": "reported", "note": str(r[c_commodity]), "source_record_url": meta.get("url")})
                        continue
                    if measure is None:
                        measure = "production"
                    est = "estimat" in ttext or str(r[c_year]).lower().endswith("e")
                    prod_rows.append({"country": iso, "mineral": mineral, "measure": measure, "year": int(ym.group(1)), "qty": to_float(r[c_value]), "unit": unit,
                                      "value_type": "estimated" if est else "reported", "note": f"USGS MCS {name.split('/')[-1]}: {r[c_commodity]} / {r[c_type] if c_type else ''}", "source_record_url": meta.get("url")})
                else:
                    # wide format: year columns named like Prod_t_2024 / Reserves
                    for c, year in year_cols:
                        low = str(c).lower()
                        measure = "production" if "prod" in low else "reserves" if "reserv" in low else None
                        if measure is None:
                            continue
                        prod_rows.append({"country": iso, "mineral": mineral, "measure": measure, "year": year, "qty": to_float(r[c]), "unit": unit,
                                          "value_type": "estimated" if low.endswith("e") else "reported", "note": f"USGS MCS {name.split('/')[-1]}, column {c}", "source_record_url": meta.get("url")})
                    for c in df.columns:
                        low = str(c).lower()
                        if "reserv" in low and not YEAR_RE.search(low) and data_year:
                            prod_rows.append({"country": iso, "mineral": mineral, "measure": "reserves", "year": data_year, "qty": to_float(r[c]), "unit": unit, "value_type": "reported", "note": f"USGS MCS {name.split('/')[-1]}, column {c}", "source_record_url": meta.get("url")})
        snap.manifest["parse_notes"] = notes
        snap.save()
        prod = pd.DataFrame(prod_rows, columns=["country", "mineral", "measure", "year", "qty", "unit", "value_type", "note", "source_record_url"])
        if not prod.empty:
            prod = prod.drop_duplicates(subset=["country", "mineral", "measure", "year", "note"])
        price = pd.DataFrame(price_rows, columns=["mineral", "series", "date", "year", "month", "price", "unit", "value_type", "note", "source_record_url"])
        return {"production": self.stamp(snap, prod), "price": self.stamp(snap, price)}
