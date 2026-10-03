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

    CATALOG = "https://api.us.socrata.com/api/catalog/v1"

    def _dataset(self, snap: Snapshot) -> str:
        """The registry id (si2v-pbq5) turned out to be the registry's annotations table. Ask the Socrata
        catalogue for datos.gov.co datasets about mining titles whose columns name a holder and minerals."""
        try:
            cat = snap.get_json(self.CATALOG, "catalog.json", params={"domains": "www.datos.gov.co", "q": "titulos mineros", "limit": 50}, timeout=120)
        except Exception as e:  # noqa: BLE001
            snap.manifest.setdefault("errors", []).append({"name": "catalog", "error": str(e)[:200]})
            return SOCRATA
        # candidates by name (the catalogue lists municipal extracts too); the national table is the largest
        # one whose rows carry a holder and minerals
        cands = []
        for r in cat.get("results", []) if isinstance(cat, dict) else []:
            res = r.get("resource", {})
            name = str(res.get("name", "")).lower()
            if not any(k in name for k in ("titulos mineros", "títulos mineros", "titulosmin", "catastro minero", "anna")):
                continue
            if any(k in name for k in ("municipio", "departamento", "anotaciones", "rucom", "vista")):
                continue
            cands.append(res["id"])
        probes = []
        for ds in cands[:6]:
            url = f"https://www.datos.gov.co/resource/{ds}.json"
            try:
                sample = snap.get_json(url, f"probe_{ds}.json", params={"$limit": 5}, timeout=120)
                cnt = snap.get_json(url, f"count_{ds}.json", params={"$select": "count(*) as n"}, timeout=120)
            except Exception as e:  # noqa: BLE001
                snap.manifest.setdefault("errors", []).append({"name": ds, "error": str(e)[:200]})
                if "non-tabular" in str(e):
                    # a map layer (the national titles cadastre is one): Socrata exposes it only as a geospatial export
                    probes.append({"id": ds, "rows": None, "geospatial": True})
                    snap.manifest["catalog_probes"] = probes
                continue
            cols = " ".join(k.lower() for d in (sample if isinstance(sample, list) else []) for k in d)
            n = int(cnt[0].get("n", 0)) if isinstance(cnt, list) and cnt else 0
            ok = "titular" in cols and "mineral" in cols
            probes.append({"id": ds, "rows": n, "has_holder_and_minerals": ok})
            snap.manifest["catalog_probes"] = probes
        good = [p for p in probes if p.get("has_holder_and_minerals")]
        best = max(good, key=lambda p: p["rows"]) if good else None
        if best is None:
            geo = [p for p in probes if p.get("geospatial")]
            if geo:
                snap.manifest["catalog_choice"] = {"id": geo[0]["id"], "geospatial": True}
                return f"https://www.datos.gov.co/api/geospatial/{geo[0]['id']}?method=export&format=GeoJSON"
        snap.manifest["catalog_choice"] = best
        return f"https://www.datos.gov.co/resource/{best['id']}.json" if best else SOCRATA

    def fetch(self, snap: Snapshot) -> None:
        url = self._dataset(snap)
        snap.manifest["dataset_url"] = url
        if "/api/geospatial/" in url:
            try:
                snap.get(url, "export.geojson", timeout=900)  # one file with every title; properties carry the attributes
            except Exception as e:  # noqa: BLE001 - "Unexportable view" in the first live run: nothing is stored, nothing stale is kept
                snap.manifest.setdefault("errors", []).append({"name": "export.geojson", "error": str(e)[:300]})
                snap.manifest["parse_note"] = "the national titles layer cannot be exported from datos.gov.co; no concession rows stored"
                snap.save()
            return
        for page in range(MAX_PAGES):
            payload = snap.get_json(url, f"page_{page}.json", params={"$limit": PAGE, "$offset": page * PAGE, "$order": ":id"}, timeout=300)
            if not isinstance(payload, list) or len(payload) < PAGE:
                break

    def parse(self, snap: Snapshot) -> dict[str, pd.DataFrame]:
        rows: dict[str, dict] = {}
        cols_seen: set[str] = set()
        for name in sorted(snap.files):
            if not (name.startswith("page_") or name.endswith(".geojson")) or not snap.has(name):
                continue
            try:
                recs = json.loads(snap.path(name).read_text(encoding="utf-8"))
            except json.JSONDecodeError:
                snap.manifest.setdefault("unparsed", []).append(name)
                continue
            if isinstance(recs, dict) and "features" in recs:  # GeoJSON export: attributes live in properties
                recs = [f.get("properties", {}) for f in recs.get("features", [])]
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
        if cols_seen and not any("titular" in c.lower() for c in cols_seen):
            # registry annotations, not the titles cadastre: store nothing rather than mislabelled rows
            snap.manifest["parse_note"] = f"dataset has no holder column ({sorted(cols_seen)[:8]}); not the titles cadastre, nothing stored"
            snap.save()
            rows = {}
        return {"concession": self.stamp(snap, pd.DataFrame(list(rows.values()), columns=CONCESSION_COLUMNS))}
