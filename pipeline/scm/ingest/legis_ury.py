"""Uruguay: Parlamento datasets on catalogodatos.gub.uy (CKAN) -> document (bills). No roll-call dataset."""
from __future__ import annotations

import os

import pandas as pd

from ..http import Snapshot
from ..paths import REPO_ROOT
from .base import Adapter, fetch_manual
from .ckan import iso_date, package_search, pick_resources, read_table, year_of
from .docs import DOCUMENT_COLUMNS, make_document
from .keywords import is_relevant, relevance
from .util import col

BASE = "https://catalogodatos.gub.uy"
FIRST_YEAR = 2008
MANUAL_FILES = ["data/manual/ury_asuntos.csv", "data/manual/ury_asuntos.json"]  # open data; redistributable


class ParlamentoUY(Adapter):
    source_id = "ury_parlamento"
    tables = ("document",)
    language = "es"

    def fetch(self, snap: Snapshot) -> None:
        pkgs = package_search(snap, BASE, "search.json", fq="organization:parlamento-uruguayo")
        res = pick_resources(pkgs, ["asuntos entrados", "asuntos-entrados", "proyectos entrados", "proyecto", "asunto"])
        res.sort(key=lambda r: ("asuntos-entrados" not in str(r.get("url", "")) and "proyecto" not in str(r.get("name", "")).lower(), r.get("name", "")))
        snap.manifest["resource_candidates"] = [{"name": r.get("name"), "url": r.get("url"), "package": r.get("_package"), "format": r["_fmt"]} for r in res[:12]]
        got = 0
        for r in res:
            if got >= 6 or not r.get("url"):
                continue
            try:
                snap.get(r["url"], f"asuntos/{got}.{r['_fmt']}", timeout=600)
                got += 1
            except Exception as e:  # noqa: BLE001
                snap.manifest.setdefault("errors", []).append({"name": r["url"], "error": str(e)[:200]})
        snap.save()
        if got == 0:
            manual = os.environ.get("URY_PARLAMENTO_FILE") or next((p for p in MANUAL_FILES if (REPO_ROOT / p).exists()), None)
            if manual:
                ext = "json" if manual.split("?")[0].lower().endswith(".json") else "csv"
                fetch_manual(snap, manual, f"asuntos/manual.{ext}", self.src.url)
                snap.manifest["resource_used"] = {"url": manual, "via": "URY_PARLAMENTO_FILE or data/manual"}
                snap.save()
                return
            raise RuntimeError("ury_parlamento: parlamento.gub.uy answers HTTP 403 to automated clients for its open-data exports; "
                               "download 'asuntos entrados' in a browser and commit it as data/manual/ury_asuntos.csv (or set URY_PARLAMENTO_FILE)")

    def parse(self, snap: Snapshot) -> dict[str, pd.DataFrame]:
        docs: dict[str, dict] = {}
        for name in sorted(snap.files):
            if not name.startswith("asuntos/") or not snap.has(name):
                continue
            try:
                if name.endswith(".json"):
                    import json

                    payload = json.loads(snap.path(name).read_text(encoding="utf-8"))
                    items = payload if isinstance(payload, list) else next((v for v in payload.values() if isinstance(v, list)), []) if isinstance(payload, dict) else []
                    df = pd.DataFrame(items).astype(str)
                else:
                    df = read_table(snap.path(name), name.rsplit(".", 1)[-1])
            except Exception as e:  # noqa: BLE001
                snap.manifest.setdefault("unparsed", []).append({"name": name, "error": str(e)[:200]})
                continue
            snap.manifest.setdefault("columns", {})[name] = list(map(str, df.columns))[:40]
            c_title = col(df, "titulo", "título", "asunto", "descripcion", "caratula", required=False)
            if c_title is None:
                continue
            c_id = col(df, "id", "asunto_id", "numero", "codigo", required=False)
            c_date = col(df, "fecha", "fecha_entrada", "fecha_ingreso", required=False)
            c_cam = col(df, "camara", "cuerpo", required=False)
            c_type = col(df, "tipo", required=False)
            for i, r in df.iterrows():
                title = str(r[c_title]).strip()
                rel = relevance(title)
                if not title or not is_relevant(rel, "parliament", title):
                    continue
                date = iso_date(r[c_date]) if c_date else None
                yr = year_of(date) or (year_of(r[c_date]) if c_date else None)
                if not yr or yr < FIRST_YEAR:
                    continue
                native = str(r[c_id]).strip() if c_id and r[c_id] else f"{name}-{i}"
                row = make_document(source_id=self.source_id, country="URY", doc_type="bill", date=date or f"{yr}-01-01", date_precision="day" if date else "year",
                                    title=f"{str(r[c_type]).strip() + ' ' if c_type and r[c_type] else ''}{title}", language="es",
                                    venue=f"Parlamento ({r[c_cam]})" if c_cam and r[c_cam] else "Parlamento del Uruguay", url=snap.files[name]["url"], rel=rel, native_id=native)
                docs[row["doc_id"]] = row
        return {"document": self.stamp(snap, pd.DataFrame(list(docs.values()), columns=DOCUMENT_COLUMNS))}
