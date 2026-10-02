"""Ecuador: Catastro Minero Nacional (ArcGIS REST MapServer layer) -> concession."""
from __future__ import annotations

import json
import re

import pandas as pd

from ..http import Snapshot
from .base import Adapter, event_id, to_float
from .ckan import iso_date, year_of
from .legis_col import _pick
from .national_col import CONCESSION_COLUMNS
from .util import tag_mineral

PAGE = 1000
MAX_PAGES = 40


class ECUCadastre(Adapter):
    source_id = "ecu_cadastre"
    tables = ("concession",)
    language = "es"

    def fetch(self, snap: Snapshot) -> None:
        layer = self.src.url.rstrip("/")
        # the layer may have moved with the regulator's reorganisation: record the service catalogue first
        root = re.sub(r"/rest/services/.*$", "/rest/services", layer)
        try:
            snap.get_json(root, "catalogue.json", params={"f": "json"}, timeout=60)
        except Exception as e:  # noqa: BLE001
            snap.manifest.setdefault("errors", []).append({"name": "catalogue", "error": str(e)[:200]})
        try:
            snap.get_json(layer, "layer.json", params={"f": "json"}, timeout=60)
        except Exception as e:  # noqa: BLE001
            snap.manifest.setdefault("errors", []).append({"name": "layer", "error": str(e)[:200]})
        for page in range(MAX_PAGES):
            payload = snap.get_json(f"{layer}/query", f"page_{page}.json", params={"where": "1=1", "outFields": "*", "f": "json", "returnGeometry": "false",
                                                                                   "resultOffset": page * PAGE, "resultRecordCount": PAGE}, timeout=300)
            feats = payload.get("features", []) if isinstance(payload, dict) else []
            if isinstance(payload, dict) and "error" in payload:
                snap.manifest.setdefault("errors", []).append({"name": f"page_{page}", "error": json.dumps(payload["error"])[:300]})
                break
            if len(feats) < PAGE:
                break

    def parse(self, snap: Snapshot) -> dict[str, pd.DataFrame]:
        rows: dict[str, dict] = {}
        fields: set[str] = set()
        for name in sorted(snap.files):
            if not name.startswith("page_") or not snap.has(name):
                continue
            try:
                payload = json.loads(snap.path(name).read_text(encoding="utf-8"))
            except json.JSONDecodeError:
                continue
            for i, f in enumerate(payload.get("features", []) if isinstance(payload, dict) else []):
                a = f.get("attributes", {}) or {}
                fields.update(a.keys())
                native = _pick(a, "codigo", "cod_", "objectid") or f"{name}-{i}"
                minerals_text = _pick(a, "mineral", "sustancia", "tipo_miner", "material")
                holder = _pick(a, "titular", "concesiona", "nombre_tit", "propietari")
                nombre = _pick(a, "nombre", "denominaci", "area_minera")
                status = _pick(a, "estado", "situacion", "fase")
                granted_raw = _pick(a, "fecha_otor", "fecha_insc", "fecha_regi", "fecha")
                granted = iso_date(granted_raw)
                if granted is None and granted_raw.strip().lstrip("-").isdigit():  # ArcGIS epoch milliseconds
                    from datetime import UTC, datetime

                    granted = datetime.fromtimestamp(int(granted_raw) / 1000, tz=UTC).date().isoformat()
                area = to_float(_pick(a, "hectareas", "area_ha", "superficie", "area"))
                rows[native] = {"concession_id": event_id("ECU", self.source_id, native), "country": "ECU", "title": (f"{nombre} ({native})" if nombre else f"Concesión {native}")[:300],
                                "holder": holder[:300] or None, "minerals": minerals_text[:300] or None, "mineral": tag_mineral(minerals_text), "status": status or None,
                                "granted_date": granted, "granted_year": year_of(granted), "expires_year": year_of(_pick(a, "fecha_venc", "fecha_term", "vigencia")),
                                "area_ha": area, "lat": to_float(_pick(a, "latitud", "lat")), "lon": to_float(_pick(a, "longitud", "lon")), "native_id": native,
                                "value_type": "reported", "source_record_url": f"{self.src.url}/query?where=1%3D1&outFields=*&f=json"}
        snap.manifest["fields_seen"] = sorted(fields)[:60]
        snap.save()
        return {"concession": self.stamp(snap, pd.DataFrame(list(rows.values()), columns=CONCESSION_COLUMNS))}
