"""Chile: Cámara de Diputadas y Diputados open data (SOAP-style XML GET services) -> document, vote, vote_member."""
from __future__ import annotations

import re
import xml.etree.ElementTree as ET

import pandas as pd

from ..http import Snapshot
from .base import Adapter, event_id
from .docs import DOCUMENT_COLUMNS, VOTE_COLUMNS, VOTE_MEMBER_COLUMNS, make_document
from .feeds import strip_ns
from .keywords import is_relevant, relevance

WS = "https://opendata.camara.cl/camaradiputados/WServices/WSLegislativo.asmx"
RECORD = "https://www.camara.cl/legislacion/ProyectosDeLey/tramitacion.aspx?prmID={id}&prmBOLETIN={boletin}"
FIRST_YEAR = 2008
MAX_VOTE_DETAIL_CALLS = 400
CHOICE = {"afirmativo": "yes", "a favor": "yes", "en contra": "no", "negativo": "no", "abstencion": "abstain", "abstención": "abstain",
          "dispensado": "absent", "pareo": "absent", "ausente": "absent", "no vota": "absent"}


def _find(el: ET.Element, *names: str) -> str:
    """Text of the first child whose tag contains one of `names` (case-insensitive)."""
    for n in names:
        for child in el:
            if n.lower() in child.tag.lower():
                return (child.text or "").strip()
    return ""


def _date(s: str) -> str | None:
    m = re.match(r"(\d{4}-\d{2}-\d{2})", s)
    if m:
        return m.group(1)
    m = re.match(r"(\d{2})-(\d{2})-(\d{4})", s)
    return f"{m.group(3)}-{m.group(2)}-{m.group(1)}" if m else None


def _root(snap: Snapshot, name: str) -> ET.Element | None:
    try:
        return strip_ns(ET.fromstring(snap.path(name).read_bytes().lstrip(b"\xef\xbb\xbf \r\n\t")))
    except ET.ParseError:
        snap.manifest.setdefault("unparsed", []).append(name)
        return None


class CamaraCL(Adapter):
    source_id = "chl_camara"
    tables = ("document", "vote", "vote_member")
    language = "es"
    respect_robots = True
    min_interval = 1.0

    def fetch(self, snap: Snapshot) -> None:
        import datetime as dt

        for y in range(FIRST_YEAR, dt.date.today().year + 1):
            try:
                snap.get(f"{WS}/retornarProyectosLeyPorAnno", f"proyectos/{y}.xml", params={"prmAnno": y}, timeout=300)
            except Exception as e:  # noqa: BLE001
                snap.manifest.setdefault("errors", []).append({"name": f"proyectos/{y}", "error": str(e)[:200]})
        snap.save()
        kept = self._kept_projects(snap)
        snap.manifest["kept_projects"] = len(kept)
        calls = 0
        for boletin, _ in kept:
            try:
                snap.get(f"{WS}/retornarVotacionesXProyectoLey", f"votaciones/{boletin}.xml", params={"prmNumeroBoletin": boletin}, timeout=120, allow_statuses=(200, 500))
            except Exception as e:  # noqa: BLE001
                snap.manifest.setdefault("errors", []).append({"name": f"votaciones/{boletin}", "error": str(e)[:200]})
                continue
            root = _root(snap, f"votaciones/{boletin}.xml")
            for v in (root.iter("Votacion") if root is not None else []):
                vid = _find(v, "Id")
                if not vid or calls >= MAX_VOTE_DETAIL_CALLS:
                    continue
                calls += 1
                try:
                    snap.get(f"{WS}/retornarVotacionDetalle", f"detalle/{vid}.xml", params={"prmVotacionId": vid}, timeout=120, allow_statuses=(200, 500))
                except Exception as e:  # noqa: BLE001
                    snap.manifest.setdefault("errors", []).append({"name": f"detalle/{vid}", "error": str(e)[:200]})
        if calls >= MAX_VOTE_DETAIL_CALLS:
            snap.manifest["vote_detail_capped"] = True
        snap.save()

    def _projects(self, snap: Snapshot) -> list[ET.Element]:
        out: list[ET.Element] = []
        for name in sorted(snap.files):
            if name.startswith("proyectos/") and snap.has(name):
                root = _root(snap, name)
                if root is not None:
                    out += [el for el in root.iter() if el.tag.lower() == "proyectoley"]
        return out

    def _kept_projects(self, snap: Snapshot) -> list[tuple[str, ET.Element]]:
        kept = []
        for el in self._projects(snap):
            nombre = _find(el, "Nombre")
            boletin = _find(el, "Numero_Boletin", "NumeroBoletin", "Boletin")
            if boletin and is_relevant(relevance(nombre), "parliament", nombre):
                kept.append((boletin, el))
        return kept

    def parse(self, snap: Snapshot) -> dict[str, pd.DataFrame]:
        docs: dict[str, dict] = {}
        for boletin, el in self._kept_projects(snap):
            nombre = _find(el, "Nombre")
            date = _date(_find(el, "Fecha_Ingreso", "FechaIngreso", "Fecha"))
            if not date or int(date[:4]) < FIRST_YEAR:
                continue
            pid = _find(el, "Id")
            row = make_document(source_id=self.source_id, country="CHL", doc_type="bill", date=date, date_precision="day", title=f"Boletín {boletin}: {nombre}",
                                language="es", venue=f"Cámara de Diputadas y Diputados (origen: {_find(el, 'Camara_Origen', 'CamaraOrigen') or 'n/d'})",
                                url=RECORD.format(id=pid, boletin=boletin), rel=relevance(nombre), native_id=boletin, status=_find(el, "Estado") or None)
            docs[boletin] = row
        votes_rows: list[dict] = []
        members: list[dict] = []
        for boletin, row in docs.items():
            root = _root(snap, f"votaciones/{boletin}.xml") if snap.has(f"votaciones/{boletin}.xml") else None
            for v in (root.iter("Votacion") if root is not None else []):
                vid = _find(v, "Id")
                date = _date(_find(v, "Fecha"))
                if not vid or not date:
                    continue
                def _i(x):
                    try:
                        return int(float(x))
                    except (TypeError, ValueError):
                        return None
                yes, no, abst, disp = (_i(_find(v, k)) for k in ("TotalSi", "TotalNo", "TotalAbstencion", "TotalDispensado"))
                vote_id = event_id("CHL", self.source_id, "vote", vid)
                votes_rows.append({"vote_id": vote_id, "doc_id": row["doc_id"], "country": "CHL", "chamber": "Cámara de Diputadas y Diputados", "date": date, "year": int(date[:4]),
                                   "title_original": (_find(v, "Descripcion") or row["title_original"])[:400], "result": _find(v, "Resultado") or None,
                                   "yes": yes, "no": no, "abstain": abst, "absent": disp, "total": sum(x or 0 for x in (yes, no, abst, disp)) if yes is not None or no is not None else None,
                                   "native_id": vid, "value_type": "reported", "source_record_url": f"{WS}/retornarVotacionDetalle?prmVotacionId={vid}"})
                det = _root(snap, f"detalle/{vid}.xml") if snap.has(f"detalle/{vid}.xml") else None
                for voto in (det.iter("Voto") if det is not None else []):
                    dip = next((c for c in voto if c.tag.lower() == "diputado"), None)
                    opcion = next((c for c in voto if "opcion" in c.tag.lower()), None)
                    if dip is None or opcion is None:
                        continue
                    name = " ".join(x for x in (_find(dip, "Nombre"), _find(dip, "Apellido_Paterno", "ApellidoPaterno"), _find(dip, "Apellido_Materno", "ApellidoMaterno")) if x)
                    choice_orig = (opcion.text or opcion.get("Valor") or "").strip()
                    members.append({"vote_id": vote_id, "country": "CHL", "member_id": _find(dip, "Id") or event_id(name), "member_name": name, "party": None, "region": None,
                                    "choice": CHOICE.get(choice_orig.lower(), "other"), "choice_original": choice_orig or "?",
                                    "source_record_url": f"{WS}/retornarVotacionDetalle?prmVotacionId={vid}"})
        return {
            "document": self.stamp(snap, pd.DataFrame(list(docs.values()), columns=DOCUMENT_COLUMNS)),
            "vote": self.stamp(snap, pd.DataFrame(votes_rows, columns=VOTE_COLUMNS)),
            "vote_member": self.stamp(snap, pd.DataFrame(members, columns=VOTE_MEMBER_COLUMNS)),
        }
