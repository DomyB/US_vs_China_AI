"""Colombia: ANM AnnA Minería cadastre on datos.gov.co (Socrata) -> concession."""
from __future__ import annotations

import json

import pandas as pd

from ..http import Snapshot
from .base import Adapter, event_id, to_float
from .ckan import iso_date, year_of
from .legis_col import _pick
from .util import tag_mineral

SOCRATA = "https://www.datos.gov.co/resource/si2v-pbq5.json"
PAGE = 5000
MAX_PAGES = 40
CONCESSION_COLUMNS = ["concession_id", "country", "title", "holder", "minerals", "mineral", "status", "granted_date", "granted_year", "expires_year",
                      "area_ha", "lat", "lon", "native_id", "value_type", "source_record_url"]


class ANMAnna(Adapter):
    source_id = "col_anm_anna"
    tables = ("concession",)
    language = "es"

    def fetch(self, snap: Snapshot) -> None:
        for page in range(MAX_PAGES):
            payload = snap.get_json(SOCRATA, f"page_{page}.json", params={"$limit": PAGE, "$offset": page * PAGE, "$order": ":id"}, timeout=300)
            if not isinstance(payload, list) or len(payload) < PAGE:
                break

    def parse(self, snap: Snapshot) -> dict[str, pd.DataFrame]:
        rows: dict[str, dict] = {}
        cols_seen: set[str] = set()
        for name in sorted(snap.files):
            if not name.startswith("page_") or not snap.has(name):
                continue
            try:
                recs = json.loads(snap.path(name).read_text(encoding="utf-8"))
            except json.JSONDecodeError:
                snap.manifest.setdefault("unparsed", []).append(name)
                continue
            for i, d in enumerate(recs if isinstance(recs, list) else []):
                cols_seen.update(d.keys())
                native = _pick(d, "codigo_expediente", "c_digo_expediente", "expediente", "codigo", "id") or f"{name}-{i}"
                minerals_text = _pick(d, "minerales", "mineral", "sustancia")
                holder = _pick(d, "titular", "nombre_titular", "beneficiario")
                status = _pick(d, "estado", "etapa")
                granted = iso_date(_pick(d, "fecha_inscripcion", "fecha_de_inscripcion", "fecha_otorgamiento", "fecha_contrato", "fecha"))
                expires = year_of(_pick(d, "fecha_terminacion", "fecha_vencimiento", "fecha_fin"))
                area = to_float(_pick(d, "area_ha", "area_hectareas", "hectareas", "area"))
                lat = to_float(_pick(d, "latitud", "lat"))
                lon = to_float(_pick(d, "longitud", "lon"))
                modality = _pick(d, "modalidad", "tipo_titulo", "clase")
                title = f"{modality + ' ' if modality else 'Título minero '}{native}" + (f": {minerals_text[:120]}" if minerals_text else "")
                rows[native] = {"concession_id": event_id("COL", self.source_id, native), "country": "COL", "title": title[:300], "holder": holder[:300] or None,
                                "minerals": minerals_text[:300] or None, "mineral": tag_mineral(minerals_text), "status": status or None, "granted_date": granted,
                                "granted_year": year_of(granted) if granted else year_of(_pick(d, "fecha_inscripcion", "fecha_de_inscripcion", "fecha_otorgamiento", "fecha_contrato")),
                                "expires_year": expires, "area_ha": area, "lat": lat, "lon": lon, "native_id": native, "value_type": "reported",
                                "source_record_url": f"{SOCRATA}?codigo_expediente={native}" if native and not native.startswith("page_") else SOCRATA}
        snap.manifest["columns_seen"] = sorted(cols_seen)[:60]
        snap.save()
        return {"concession": self.stamp(snap, pd.DataFrame(list(rows.values()), columns=CONCESSION_COLUMNS))}
