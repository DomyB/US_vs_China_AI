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
        offset = 0
        page = 0
        while page < 200:
            payload = snap.get_json(ITEMS, f"items_{page}.json", params={"f": "json", "limit": 1000, "offset": offset})
            feats = payload.get("features", []) if isinstance(payload, dict) else []
            if not feats:
                break
            offset += len(feats)
            page += 1
            if payload.get("numberMatched") and offset >= int(payload["numberMatched"]):
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
                country = next((p[k] for k in p if "country" in k.lower()), None)
                iso = iso3_from_name(country)
                if iso not in IN_SCOPE:
                    continue
                commodity = next((p[k] for k in p if "commodity" in k.lower() or "mineral" in k.lower()), None)
                mineral = tag_mineral(commodity)
                year = next((p[k] for k in p if k.lower() in ("year", "yr", "date")), None)
                qty = next((p[k] for k in p if "quantity" in k.lower() or "value" in k.lower() or "production" in k.lower()), None)
                unit = next((p[k] for k in p if "unit" in k.lower()), "see source")
                stat = str(next((p[k] for k in p if "statistic" in k.lower() or "type" in k.lower()), "production")).lower()
                if mineral is None or year is None:
                    unmapped += 1
                    continue
                rows.append({"country": iso, "mineral": mineral, "measure": "production" if "prod" in stat else "reserves" if "reserv" in stat else "production",
                             "year": int(str(year)[:4]), "qty": to_float(qty), "unit": str(unit), "value_type": "reported",
                             "note": f"BGS {commodity} ({stat})", "source_record_url": meta.get("url")})
        snap.manifest["unmapped_features"] = unmapped
        snap.save()
        df = pd.DataFrame(rows, columns=["country", "mineral", "measure", "year", "qty", "unit", "value_type", "note", "source_record_url"])
        return {"production": self.stamp(snap, df)}
