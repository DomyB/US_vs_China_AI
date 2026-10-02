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
    """Text of the first child whose tag equals one of `names` (case-insensitive), else contains one."""
    for n in names:
        for child in el:
            if child.tag.lower() == n.lower():
                return (child.text or "").strip()
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

    def _methods(self, snap: Snapshot) -> list[str]:
        """Operation names listed on the service description page (the first live run showed the
        method name assumed from older documentation no longer exists)."""
        try:
            html = snap.get(WS, "service.html", timeout=60).read_text(encoding="utf-8", errors="ignore")
        except Exception as e:  # noqa: BLE001
            snap.manifest.setdefault("errors", []).append({"name": "service.html", "error": str(e)[:200]})
            return []
        names = list(dict.fromkeys(re.findall(r"op=([A-Za-z0-9_]+)", html)))
        snap.manifest["service_methods"] = names[:80]
        return names

    def fetch(self, snap: Snapshot) -> None:
        import datetime as dt

        methods = self._methods(snap)
        # observed (2026-10): retornarMocionesXAnno (members' bills) and retornarMensajesXAnno (executive bills)
        by_year = [m for m in methods if "xanno" in m.lower() and any(k in m.lower() for k in ("mocion", "mensaje", "proyecto"))]
        by_year = by_year or ["retornarMocionesXAnno", "retornarMensajesXAnno"]
        snap.manifest["list_methods"] = by_year
        got = 0
        for method in by_year:
            for y in range(FIRST_YEAR, dt.date.today().year + 1):
                name = f"proyectos/{y}_{method}.xml"
                try:
                    snap.get(f"{WS}/{method}", name, params={"prmAnno": y}, timeout=300, allow_statuses=(200, 500))
                except Exception as e:  # noqa: BLE001
                    snap.manifest.setdefault("errors", []).append({"name": name, "error": str(e)[:200]})
                    continue
                head = snap.path(name).read_bytes()[:300].lstrip()
                if snap.files[name]["status"] != 200 or not head.startswith(b"<?xml"):
                    snap.discard(name, f"{method}?prmAnno={y}: HTTP {snap.files.get(name, {}).get('status')} {head[:120]!r}")
                    continue
                got += 1
        snap.save()
        if got == 0:
            raise RuntimeError("chl_camara: no yearly bill list could be fetched (see list_methods and errors in the manifest)")
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
            for v in ([el for el in root.iter() if el.tag.lower().startswith("votacion") and el.tag.lower() != "votaciones"] if root is not None else []):
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
        """Bill elements from the yearly lists: any element with a boletín number and a name child
        (ProyectoLey in the old service; Mocion / Mensaje elements may wrap them in the current one)."""
        out: list[ET.Element] = []
        seen: set[str] = set()
        for name in sorted(snap.files):
            if not (name.startswith("proyectos/") and snap.has(name)):
                continue
            root = _root(snap, name)
            if root is None:
                continue
            for el in root.iter():
                tags = [c.tag.lower() for c in el]
                if any("boletin" in t for t in tags) and any(t == "nombre" or t.endswith("nombre") for t in tags):
                    bol = _find(el, "Numero_Boletin", "NumeroBoletin", "Boletin")
                    if bol and bol not in seen:
                        seen.add(bol)
                        out.append(el)
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
            for v in ([el for el in root.iter() if el.tag.lower().startswith("votacion") and el.tag.lower() != "votaciones"] if root is not None else []):
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


SENADO_WS = "https://tramitacion.senado.cl/wspublico"
SENADO_RECORD = "https://tramitacion.senado.cl/appsenado/templates/tramitacion/index.php?boletin_ini={boletin}"
MAX_SENADO_BOLETINES = 300
SENADO_CHOICE = {"si": "yes", "sí": "yes", "a favor": "yes", "no": "no", "en contra": "no", "abstencion": "abstain", "abstención": "abstain", "pareo": "absent", "pareado": "absent"}


class SenadoCL(Adapter):
    """Senado de Chile public web services: votes per boletín for the bills the Cámara adapter kept
    (both chambers share the boletín number). Reads the Cámara table stored by the previous run."""

    source_id = "chl_senado"
    tables = ("vote", "vote_member")
    language = "es"
    respect_robots = True
    min_interval = 1.0

    def _boletines(self) -> list[tuple[str, str, str]]:
        """(boletin, doc_id, title) from the Cámara document table, most recent first."""
        from .base import WAREHOUSE_DIR

        path = WAREHOUSE_DIR / "document" / "chl_camara.parquet"
        if not path.exists():
            return []
        df = pd.read_parquet(path).sort_values("date", ascending=False)
        return [(str(r["native_id"]), str(r["doc_id"]), str(r["title_original"])) for _, r in df.iterrows() if r["native_id"]]

    def fetch(self, snap: Snapshot) -> None:
        bols = self._boletines()
        snap.manifest["boletines_from_camara"] = len(bols)
        if not bols:
            raise RuntimeError("chl_senado: no Cámara bills stored yet (run chl_camara first)")
        snap.manifest["boletines"] = {b: {"doc_id": d, "title": t[:200]} for b, d, t in bols[:MAX_SENADO_BOLETINES]}
        for b, _, _ in bols[:MAX_SENADO_BOLETINES]:
            for form in (b, b.split("-")[0]):  # the first live run returned empty <votaciones/> for the bare number
                try:
                    snap.get(f"{SENADO_WS}/votaciones.php", f"votaciones/{b}.xml", params={"boletin": form}, timeout=120, allow_statuses=(200, 404, 500), force=True)
                except Exception as e:  # noqa: BLE001
                    snap.manifest.setdefault("errors", []).append({"name": f"votaciones/{b}", "error": str(e)[:200]})
                    break
                if b"<votacion" in snap.path(f"votaciones/{b}.xml").read_bytes()[:5000].lower().replace(b"<votaciones", b""):
                    snap.manifest.setdefault("boletin_form", "full" if "-" in form else "number")
                    break
        snap.save()

    def parse(self, snap: Snapshot) -> dict[str, pd.DataFrame]:
        info: dict[str, dict] = snap.manifest.get("boletines", {})
        votes_rows: list[dict] = []
        members: list[dict] = []
        for name in sorted(snap.files):
            if not name.startswith("votaciones/") or not snap.has(name):
                continue
            boletin = name[len("votaciones/"):-len(".xml")]
            meta = info.get(boletin) or {"doc_id": event_id("CHL", "chl_camara", boletin), "title": f"Boletín {boletin}"}
            root = _root(snap, name)
            if root is None:
                continue
            for v in [el for el in root.iter() if el.tag.lower() == "votacion"]:
                date = _date(_find(v, "FECHA", "Fecha"))
                vid = _find(v, "ID", "Id") or f"{boletin}-{_find(v, 'SESION', 'Sesion')}-{date}"
                if not date:
                    continue
                def _i(x):
                    try:
                        return int(float(x))
                    except (TypeError, ValueError):
                        return None
                yes, no, abst, pareo = (_i(_find(v, k)) for k in ("SI", "NO", "ABSTENCION", "PAREO"))
                vote_id = event_id("CHL", self.source_id, "vote", boletin, vid)
                votes_rows.append({"vote_id": vote_id, "doc_id": meta["doc_id"], "country": "CHL", "chamber": "Senado", "date": date, "year": int(date[:4]),
                                   "title_original": (_find(v, "TEMA", "Tema") or meta["title"])[:400], "result": _find(v, "RESULTADO", "Resultado") or None,
                                   "yes": yes, "no": no, "abstain": abst, "absent": pareo, "total": sum(x or 0 for x in (yes, no, abst, pareo)) if yes is not None or no is not None else None,
                                   "native_id": vid, "value_type": "reported", "source_record_url": f"{SENADO_WS}/votaciones.php?boletin={boletin.split('-')[0]}"})
                for voto in [el for el in v.iter() if el.tag.lower() == "voto"]:
                    nm = _find(voto, "PARLAMENTARIO", "Parlamentario", "NOMBRE")
                    sel = _find(voto, "SELECCION", "Seleccion", "VOTO")
                    if not nm:
                        continue
                    members.append({"vote_id": vote_id, "country": "CHL", "member_id": event_id(nm), "member_name": nm, "party": None, "region": None,
                                    "choice": SENADO_CHOICE.get(sel.strip().lower(), "other"), "choice_original": sel or "?",
                                    "source_record_url": f"{SENADO_WS}/votaciones.php?boletin={boletin.split('-')[0]}"})
        return {"vote": self.stamp(snap, pd.DataFrame(votes_rows, columns=VOTE_COLUMNS)), "vote_member": self.stamp(snap, pd.DataFrame(members, columns=VOTE_MEMBER_COLUMNS))}
