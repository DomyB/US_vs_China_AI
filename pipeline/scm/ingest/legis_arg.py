"""Argentina: Cámara de Diputados open data (CKAN) -> document (bills), vote, vote_member.

Dataset and resource names are resolved by search and fuzzy matching, and every candidate is
recorded in the manifest, because the catalogue's names were not verifiable before the first run.
"""
from __future__ import annotations

import pandas as pd

from ..http import Snapshot
from .base import Adapter, event_id
from .ckan import iso_date, package_search, pick_resources, read_table, year_of
from .docs import DOCUMENT_COLUMNS, VOTE_COLUMNS, VOTE_MEMBER_COLUMNS, make_document
from .keywords import is_relevant, relevance
from .util import col

BASE = "https://datos.hcdn.gob.ar"
RECORD = "https://www.hcdn.gob.ar/proyectos/proyecto.jsp?exp={exp}"
FIRST_YEAR = 2008
CHOICE = {"afirmativo": "yes", "negativo": "no", "abstencion": "abstain", "abstención": "abstain", "ausente": "absent", "presidente": "other"}


class HCDN(Adapter):
    source_id = "arg_hcdn"
    tables = ("document", "vote", "vote_member")
    language = "es"
    respect_robots = True

    def fetch(self, snap: Snapshot) -> None:
        wanted = {"proyectos": ["proyectos", "expedientes"], "votaciones": ["votaciones", "votacion"], "votos": ["votos", "voto por diputado", "votos_"]}
        candidates: dict[str, list[dict]] = {}
        for key, words in wanted.items():
            pkgs = package_search(snap, BASE, f"search_{key}.json", q=words[0])
            candidates[key] = pick_resources(pkgs, words)
        snap.manifest["resource_candidates"] = {k: [{"name": r.get("name"), "url": r.get("url"), "package": r.get("_package"), "format": r["_fmt"]} for r in v[:8]] for k, v in candidates.items()}
        snap.save()
        for key, res in candidates.items():
            got = 0
            for r in res:
                if got >= (6 if key != "votos" else 4):
                    break
                url = r.get("url")
                if not url:
                    continue
                try:
                    snap.get(url, f"{key}/{got}.{r['_fmt']}", timeout=600)
                    got += 1
                except Exception as e:  # noqa: BLE001
                    snap.manifest.setdefault("errors", []).append({"name": url, "error": str(e)[:200]})
        snap.save()

    def _frames(self, snap: Snapshot, key: str) -> pd.DataFrame:
        frames = []
        for name in sorted(snap.files):
            if name.startswith(f"{key}/") and snap.has(name):
                try:
                    frames.append(read_table(snap.path(name), name.rsplit(".", 1)[-1]))
                except Exception as e:  # noqa: BLE001
                    snap.manifest.setdefault("unparsed", []).append({"name": name, "error": str(e)[:200]})
        return pd.concat(frames, ignore_index=True) if frames else pd.DataFrame()

    def parse(self, snap: Snapshot) -> dict[str, pd.DataFrame]:
        docs: dict[str, dict] = {}
        bills = self._frames(snap, "proyectos")
        if not bills.empty:
            snap.manifest["columns_proyectos"] = list(map(str, bills.columns))[:40]
            c_exp = col(bills, "expediente", "exp", "proyecto_id", "id")
            c_title = col(bills, "titulo", "título", "sumario", "descripcion")
            c_sum = col(bills, "sumario", required=False)
            c_date = col(bills, "fecha", "publicacion_fecha", "fecha_ingreso", required=False)
            c_type = col(bills, "tipo", "tipo_proyecto", required=False)
            c_cam = col(bills, "camara_origen", "camara", "origen", required=False)
            c_auth = col(bills, "autor", "firmantes", required=False)
            for _, r in bills.iterrows():
                title = str(r[c_title])
                summ = str(r[c_sum]) if c_sum and c_sum != c_title else ""
                text = f"{title} {summ}"
                rel = relevance(text)
                if not is_relevant(rel, "parliament", text):
                    continue
                date = iso_date(r[c_date]) if c_date else None
                yr = year_of(date) or year_of(r[c_exp]) or (year_of(r[c_date]) if c_date else None)
                if not yr or yr < FIRST_YEAR:
                    continue
                exp = str(r[c_exp]).strip()
                tipo = str(r[c_type]).strip() if c_type else ""
                row = make_document(source_id=self.source_id, country="ARG", doc_type="bill", date=date or f"{yr}-01-01", date_precision="day" if date else "year",
                                    title=f"{tipo + ' ' if tipo else ''}{exp}: {title}", language="es",
                                    venue=f"Cámara de Diputados ({r[c_cam]})" if c_cam and r[c_cam] else "Cámara de Diputados", url=RECORD.format(exp=exp), rel=rel,
                                    native_id=exp, summary=summ[:1000] or None, author=str(r[c_auth])[:300] if c_auth and r[c_auth] else None)
                docs[exp] = row
        votes_rows: list[dict] = []
        members: list[dict] = []
        votes = self._frames(snap, "votaciones")
        if not votes.empty:
            snap.manifest["columns_votaciones"] = list(map(str, votes.columns))[:40]
            c_vid = col(votes, "votacion_id", "id_votacion", "id")
            c_title = col(votes, "titulo", "asunto", "descripcion")
            c_date = col(votes, "fecha")
            c_res = col(votes, "resultado", required=False)
            c_yes, c_no, c_abs, c_absent = (col(votes, *names, required=False) for names in (("afirmativos", "afirmativo"), ("negativos", "negativo"), ("abstenciones", "abstencion"), ("ausentes", "ausente")))
            c_exp = col(votes, "expediente", "proyecto", required=False)
            def _i(x):
                try:
                    return int(float(str(x).replace(",", ".")))
                except (TypeError, ValueError):
                    return None
            for _, r in votes.iterrows():
                title = str(r[c_title])
                date = iso_date(r[c_date])
                if not date or int(date[:4]) < FIRST_YEAR:
                    continue
                exp = str(r[c_exp]).strip() if c_exp and r[c_exp] else ""
                rel = relevance(title)
                if exp in docs:
                    doc_id = docs[exp]["doc_id"]
                elif is_relevant(rel, "parliament", title):
                    row = make_document(source_id=self.source_id, country="ARG", doc_type="vote", date=date, date_precision="day", title=title, language="es",
                                        venue="Cámara de Diputados", url=f"{BASE}/dataset/votaciones", rel=rel, native_id=f"vot-{r[c_vid]}")
                    docs[f"vot-{r[c_vid]}"] = row
                    doc_id = row["doc_id"]
                else:
                    continue
                vote_id = event_id("ARG", self.source_id, "vote", str(r[c_vid]))
                yes, no, abst, absent = (_i(r[c]) if c else None for c in (c_yes, c_no, c_abs, c_absent))
                votes_rows.append({"vote_id": vote_id, "doc_id": doc_id, "country": "ARG", "chamber": "Cámara de Diputados", "date": date, "year": int(date[:4]), "title_original": title[:400],
                                   "result": str(r[c_res]) if c_res and r[c_res] else None, "yes": yes, "no": no, "abstain": abst, "absent": absent,
                                   "total": sum(x or 0 for x in (yes, no, abst, absent)) if yes is not None or no is not None else None, "native_id": str(r[c_vid]),
                                   "value_type": "reported", "source_record_url": f"{BASE}/dataset/votaciones"})
            kept = {v["native_id"]: v["vote_id"] for v in votes_rows}
            mv = self._frames(snap, "votos")
            if not mv.empty:
                snap.manifest["columns_votos"] = list(map(str, mv.columns))[:40]
                c_vid2 = col(mv, "votacion_id", "id_votacion")
                c_name = col(mv, "diputado", "nombre", "apellido")
                c_party = col(mv, "bloque", "partido", required=False)
                c_prov = col(mv, "provincia", "distrito", required=False)
                c_choice = col(mv, "voto")
                c_mid = col(mv, "diputado_id", "id_diputado", required=False)
                mv = mv[mv[c_vid2].astype(str).isin(kept)]
                for _, r in mv.iterrows():
                    choice_orig = str(r[c_choice])
                    members.append({"vote_id": kept[str(r[c_vid2])], "country": "ARG", "member_id": str(r[c_mid]) if c_mid and r[c_mid] else event_id(r[c_name]),
                                    "member_name": str(r[c_name]), "party": str(r[c_party]) if c_party and r[c_party] else None, "region": str(r[c_prov]) if c_prov and r[c_prov] else None,
                                    "choice": CHOICE.get(choice_orig.strip().lower(), "other"), "choice_original": choice_orig or "?", "source_record_url": f"{BASE}/dataset/votaciones"})
        return {
            "document": self.stamp(snap, pd.DataFrame(list(docs.values()), columns=DOCUMENT_COLUMNS)),
            "vote": self.stamp(snap, pd.DataFrame(votes_rows, columns=VOTE_COLUMNS)),
            "vote_member": self.stamp(snap, pd.DataFrame(members, columns=VOTE_MEMBER_COLUMNS)),
        }
