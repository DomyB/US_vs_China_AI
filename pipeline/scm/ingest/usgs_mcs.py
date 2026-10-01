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
            name = f.get("name", "")
            if name.lower().endswith((".csv", ".xlsx")) and ("world" in name.lower() or "salient" in name.lower() or any(k in name.lower() for k in ("lithi", "coppe", "rarees", "niobi", "graph", "nicke", "tin", "silve", "molyb"))):
                snap.get(f["url"], f"files/{name}")

    def parse(self, snap: Snapshot) -> dict[str, pd.DataFrame]:
        prod_rows: list[dict] = []
        price_rows: list[dict] = []
        unmapped: list[str] = []
        for name, meta in snap.files.items():
            if not name.startswith("files/") or not snap.has(name):
                continue
            mineral = mineral_from_filename(name)
            edition = EDITION_RE.search(name)
            data_year = int(edition.group(1)) - 1 if edition else None
            path = snap.path(name)
            try:
                df = pd.read_csv(path) if name.endswith(".csv") else pd.read_excel(path)
            except Exception:  # noqa: BLE001
                unmapped.append(name)
                continue
            cols = {c: str(c) for c in df.columns}
            country_col = next((c for c in df.columns if "country" in str(c).lower() or "source" in str(c).lower()), None)
            if country_col is None or mineral is None:
                unmapped.append(name)
                continue
            unit_col = next((c for c in df.columns if "unit" in str(c).lower()), None)
            for c, cname in cols.items():
                low = cname.lower()
                measure = "production" if "prod" in low else "reserves" if "reserv" in low else None
                if measure is None:
                    continue
                m = YEAR_RE.search(cname)
                if m:
                    year = int(m.group(1))
                elif measure == "reserves" and data_year:
                    year = data_year
                else:
                    continue
                for _, r in df.iterrows():
                    iso = iso3_from_name(r[country_col])
                    if iso not in IN_SCOPE:
                        continue
                    prod_rows.append({
                        "country": iso, "mineral": mineral, "measure": measure, "year": year, "qty": to_float(r[c]),
                        "value_type": "estimated" if cname.lower().endswith("e") and measure == "production" else "reported",
                        "unit": str(r[unit_col]) if unit_col else "see source table",
                        "note": f"USGS MCS file {name.split('/')[-1]}, column '{cname}'", "source_record_url": meta.get("url"),
                    })
            # price rows: a 'Price' column with year columns in salient-statistics tables
            price_col = next((c for c in df.columns if "price" in str(c).lower()), None)
            if price_col is not None and country_col is not None:
                for _, r in df.iterrows():
                    if "price" not in str(r[country_col]).lower():
                        continue
                    for c, cname in cols.items():
                        m = YEAR_RE.search(cname)
                        if m:
                            price_rows.append({"mineral": mineral, "series": f"USGS MCS annual average ({name.split('/')[-1]})", "date": f"{m.group(1)}-01-01", "year": int(m.group(1)), "month": pd.NA, "price": to_float(r[c]), "unit": "see source table", "value_type": "reported", "note": str(r[country_col]), "source_record_url": meta.get("url")})
        if unmapped:
            snap.manifest["unmapped_files"] = unmapped
            snap.save()
        prod = pd.DataFrame(prod_rows, columns=["country", "mineral", "measure", "year", "qty", "unit", "value_type", "note", "source_record_url"])
        price = pd.DataFrame(price_rows, columns=["mineral", "series", "date", "year", "month", "price", "unit", "value_type", "note", "source_record_url"])
        return {"production": self.stamp(snap, prod), "price": self.stamp(snap, price)}

