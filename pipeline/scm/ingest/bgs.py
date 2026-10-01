"""British Geological Survey World Mineral Statistics via the OGC API (beta) -> production cross-check."""
from __future__ import annotations

import json

import pandas as pd

from ..http import Snapshot
from ..registry import IN_SCOPE, iso3_from_name
from .base import Adapter, to_float
from .util import tag_mineral

ITEMS = "https://ogcapi.bgs.ac.uk/collections/world-mineral-statistics/items"


class BGS(Adapter):
    source_id = "bgs_wms"
    tables = ("production",)
    min_interval = 1.0

    def fetch(self, snap: Snapshot) -> None:
        for iso in IN_SCOPE:
            offset, page = 0, 0
            while page < 40:
                payload = snap.get_json(ITEMS, f"items_{iso}_{page}.json", params={"f": "json", "limit": 1000, "offset": offset, "country_iso3_code": iso})
                feats = payload.get("features", []) if isinstance(payload, dict) else []
                if not feats:
                    break
                offset += len(feats)
                page += 1
                matched = payload.get("numberMatched")
                if matched is not None and offset >= int(matched):
                    break

    def parse(self, snap: Snapshot) -> dict[str, pd.DataFrame]:
        rows: list[dict] = []
        unmapped = 0
        for name, meta in snap.files.items():
            if not name.startswith("items_") or not snap.has(name):
                continue
            payload = json.loads(snap.path(name).read_text())
            for f in payload.get("features", []):
                p = f.get("properties", {})
                iso = p.get("country_iso3_code") or iso3_from_name(p.get("country_trans"))
                if iso not in IN_SCOPE:
                    continue
                commodity = p.get("erml_commodity") or p.get("bgs_commodity_trans") or p.get("erml_group")
                mineral = tag_mineral(f"{p.get('erml_group', '')} {commodity}")
                year = str(p.get("year") or "")[:4]
                stat = str(p.get("bgs_statistic_type_trans") or "production").lower()
                if mineral is None or not year.isdigit() or int(year) < 2000:
                    unmapped += 1
                    continue
                measure = "production" if "prod" in stat else "reserves" if "reserv" in stat else None
                if measure is None:
                    continue  # imports/exports statistics are covered by Comtrade
                precision = p.get("data_precision_description")
                rows.append({"country": iso, "mineral": mineral, "measure": measure, "year": int(year), "qty": to_float(p.get("quantity")),
                             "unit": str(p.get("units") or "see source"), "value_type": "estimated" if precision and "estimat" in str(precision).lower() else "reported",
                             "note": f"BGS: {commodity}" + (f" ({precision})" if precision and precision != "Normal Value" else ""), "source_record_url": meta.get("url")})
        snap.manifest["unmapped_features"] = unmapped
        snap.save()
        df = pd.DataFrame(rows, columns=["country", "mineral", "measure", "year", "qty", "unit", "value_type", "note", "source_record_url"])
        return {"production": self.stamp(snap, df)}
