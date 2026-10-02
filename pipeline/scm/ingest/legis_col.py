"""Colombia: Cámara de Representantes bills on datos.gov.co (Socrata) -> document (bills). Votes are PDF only;
the Senado answers 403 to automated clients and is never fetched."""
from __future__ import annotations

import json

import pandas as pd

from ..http import Snapshot
from .base import Adapter
from .ckan import iso_date, year_of
from .docs import DOCUMENT_COLUMNS, make_document
from .keywords import is_relevant, relevance

SOCRATA = "https://www.datos.gov.co/resource/kcxp-nxum.json"
PAGE = 5000
MAX_PAGES = 20
FIRST_YEAR = 2008


def _pick(d: dict, *words: str) -> str:
    low = {k.lower(): v for k, v in d.items()}
    for w in words:
        for k, v in low.items():
            if w in k and v not in (None, ""):
                return str(v)
    return ""


class CamaraCO(Adapter):
    source_id = "col_camara"
    tables = ("document",)
    language = "es"

    def fetch(self, snap: Snapshot) -> None:
        for page in range(MAX_PAGES):
            payload = snap.get_json(SOCRATA, f"page_{page}.json", params={"$limit": PAGE, "$offset": page * PAGE, "$order": ":id"}, timeout=300)
            if not isinstance(payload, list) or len(payload) < PAGE:
                break

    def parse(self, snap: Snapshot) -> dict[str, pd.DataFrame]:
        docs: dict[str, dict] = {}
        cols_seen: set[str] = set()
        for name in sorted(snap.files):
            if not name.startswith("page_") or not snap.has(name):
                continue
            try:
                rows = json.loads(snap.path(name).read_text(encoding="utf-8"))
            except json.JSONDecodeError:
                snap.manifest.setdefault("unparsed", []).append(name)
                continue
            for i, d in enumerate(rows if isinstance(rows, list) else []):
                cols_seen.update(d.keys())
                title = _pick(d, "titulo", "t_tulo", "nombre", "asunto")
                text = f"{title} {_pick(d, 'tema', 'resumen', 'objeto')}"
                rel = relevance(text)
                if not title or not is_relevant(rel, "parliament", text):
                    continue
                date = iso_date(_pick(d, "fecha_de_radicacion", "fecha_radicacion", "fecha"))
                yr = year_of(date) or year_of(_pick(d, "legislatura", "a_o", "anio", "ano"))
                if not yr or yr < FIRST_YEAR:
                    continue
                numero = _pick(d, "numero_camara", "n_mero_c_mara", "numero", "n_mero")
                native = numero or f"{name}-{i}"
                url = _pick(d, "url", "enlace", "link") or self.src.url
                row = make_document(source_id=self.source_id, country="COL", doc_type="bill", date=date or f"{yr}-01-01", date_precision="day" if date else "year",
                                    title=f"{numero + ': ' if numero else ''}{title}", language="es", venue="Cámara de Representantes", url=url, rel=rel, native_id=native,
                                    summary=_pick(d, "resumen", "objeto")[:1000] or None, status=_pick(d, "estado") or None, author=_pick(d, "autor")[:300] or None)
                docs[row["doc_id"]] = row
        snap.manifest["columns_seen"] = sorted(cols_seen)[:60]
        snap.save()
        return {"document": self.stamp(snap, pd.DataFrame(list(docs.values()), columns=DOCUMENT_COLUMNS))}
