"""Exploratory legislature adapters whose services are undocumented: Paraguay SILpy open data,
Ecuador's plenary votes page, Peru's SPLEY portal service. Each records what the service answers
(index pages, first bytes) so the parser can be completed from the fixtures of the first live run."""
from __future__ import annotations

import json
import re
from html.parser import HTMLParser

import pandas as pd

from ..http import Snapshot
from .base import Adapter, event_id
from .ckan import iso_date, year_of
from .docs import DOCUMENT_COLUMNS, VOTE_COLUMNS, make_document
from .keywords import is_relevant, relevance
from .legis_col import _pick


class _Tables(HTMLParser):
    """Minimal HTML table extractor (stdlib): list of tables, each a list of rows of cell texts."""

    def __init__(self) -> None:
        super().__init__()
        self.tables: list[list[list[str]]] = []
        self._row: list[str] | None = None
        self._cell: list[str] | None = None
        self.links: list[str] = []

    def handle_starttag(self, tag, attrs):
        if tag == "table":
            self.tables.append([])
        elif tag == "tr" and self.tables:
            self._row = []
        elif tag in ("td", "th") and self._row is not None:
            self._cell = []
        elif tag == "a":
            href = dict(attrs).get("href")
            if href and self._cell is not None:
                self._cell.append(f"[{href}]")
            if href:
                self.links.append(href)

    def handle_endtag(self, tag):
        if tag in ("td", "th") and self._row is not None and self._cell is not None:
            self._row.append(" ".join(self._cell).strip())
            self._cell = None
        elif tag == "tr" and self._row is not None and self.tables:
            if self._row:
                self.tables[-1].append(self._row)
            self._row = None

    def handle_data(self, data):
        if self._cell is not None:
            self._cell.append(data.strip())


def tables_from_html(text: str) -> tuple[list[list[list[str]]], list[str]]:
    p = _Tables()
    try:
        p.feed(text)
    except Exception:  # noqa: BLE001
        pass
    return p.tables, p.links


class SILpy(Adapter):
    source_id = "pry_silpy"
    tables = ("document",)
    language = "es"
    respect_robots = True
    API = "https://datos.congreso.gov.py/opendata/api"
    ROUTES = ["/data/proyecto", "/data/proyectos", "/proyecto"]  # the API index page documents /data/proyecto

    def fetch(self, snap: Snapshot) -> None:
        try:
            snap.get(self.API, "index.html", timeout=60)
            snap.manifest["index_head"] = snap.path("index.html").read_text(encoding="utf-8", errors="ignore")[:1500]
        except Exception as e:  # noqa: BLE001
            snap.manifest.setdefault("errors", []).append({"name": "index", "error": str(e)[:200]})
        for r in self.ROUTES:
            try:
                payload = snap.get_json(self.API + r, f"route{r.replace('/', '_')}.json", timeout=300)
                snap.manifest["route_used"] = self.API + r
                snap.manifest["route_sample"] = json.dumps(payload, ensure_ascii=False)[:1200]
                # paginated? follow a few pages if the payload says so
                for page in range(2, 40):
                    if not isinstance(payload, dict) or not any(k in payload for k in ("next", "nextPage", "siguiente", "totalPages", "total_pages")):
                        break
                    payload = snap.get_json(self.API + r, f"route{r.replace('/', '_')}_p{page}.json", params={"page": page}, timeout=300)
                    if not payload or (isinstance(payload, dict) and not any(isinstance(v, list) and v for v in payload.values())):
                        break
                break
            except Exception as e:  # noqa: BLE001
                snap.manifest.setdefault("errors", []).append({"name": r, "error": str(e)[:200]})
        snap.save()

    def parse(self, snap: Snapshot) -> dict[str, pd.DataFrame]:
        docs: dict[str, dict] = {}
        for name in sorted(snap.files):
            if not name.startswith("route_") or not snap.has(name):
                continue
            try:
                payload = json.loads(snap.path(name).read_text(encoding="utf-8"))
            except json.JSONDecodeError:
                continue
            items = payload if isinstance(payload, list) else next((v for v in payload.values() if isinstance(v, list)), []) if isinstance(payload, dict) else []
            for i, d in enumerate(items):
                if not isinstance(d, dict):
                    continue
                title = _pick(d, "titulo", "t_tulo", "nombre", "descripcion", "asunto")
                text = f"{title} {_pick(d, 'resumen', 'sumario', 'tema')}"
                rel = relevance(text)
                if not title or not is_relevant(rel, "parliament", text):
                    continue
                date = iso_date(_pick(d, "fecha_ingreso", "fecha", "fechaingreso"))
                yr = year_of(date) or year_of(_pick(d, "anio", "ano", "periodo"))
                if not yr or yr < 2008:
                    continue
                native = _pick(d, "expediente", "id", "codigo", "numero") or f"{name}-{i}"
                row = make_document(source_id=self.source_id, country="PRY", doc_type="bill", date=date or f"{yr}-01-01", date_precision="day" if date else "year",
                                    title=title, language="es", venue="Congreso Nacional", url=_pick(d, "url", "link", "enlace") or self.src.url, rel=rel, native_id=native,
                                    status=_pick(d, "estado") or None, author=_pick(d, "autor", "proyectista")[:300] or None)
                docs[row["doc_id"]] = row
        return {"document": self.stamp(snap, pd.DataFrame(list(docs.values()), columns=DOCUMENT_COLUMNS))}


class AsambleaEC(Adapter):
    source_id = "ecu_asamblea"
    tables = ("document", "vote")
    language = "es"
    respect_robots = True
    MAX_PAGES = 30

    def _discover_api(self, snap: Snapshot, html: str) -> list[str]:
        """The page is a single-page app: fetch its main script bundle and record every URL-like string
        that mentions votes or an API, so the data endpoint can be called directly next time."""
        from urllib.parse import urljoin

        scripts = [urljoin(self.src.api_url, s) for s in re.findall(r'src="([^"]*main[^"]*\.js)"', html)]
        found: list[str] = []
        for i, s in enumerate(scripts[:2]):
            try:
                js = snap.get(s, f"bundle_{i}.js", timeout=120).read_text(encoding="utf-8", errors="ignore")
            except Exception as e:  # noqa: BLE001
                snap.manifest.setdefault("errors", []).append({"name": s, "error": str(e)[:200]})
                continue
            found += [u for u in re.findall(r'["\'](https?://[^"\'\s]{8,160}|/[a-zA-Z0-9_./-]*(?:api|votac|servic)[a-zA-Z0-9_./-]*)["\']', js) if "google" not in u and "w3.org" not in u]
            snap.discard(f"bundle_{i}.js", "script bundle inspected for API URLs (not kept)")
        found = list(dict.fromkeys(found))
        snap.manifest["api_candidates"] = [u for u in found if "votac" in u.lower() or "api" in u.lower()][:40]
        return snap.manifest["api_candidates"]

    def fetch(self, snap: Snapshot) -> None:
        base = self.src.api_url
        for page in range(self.MAX_PAGES):
            name = f"votaciones_{page}.html"
            try:
                text = snap.get(base, name, params={"page": page} if page else None, timeout=120).read_text(encoding="utf-8", errors="ignore")
            except Exception as e:  # noqa: BLE001
                snap.manifest.setdefault("errors", []).append({"name": name, "error": str(e)[:200]})
                break
            tables, _ = tables_from_html(text)
            if page == 0:
                snap.manifest["page_head"] = re.sub(r"\s+", " ", text[:1200])
                snap.manifest["tables_found"] = len(tables)
                if not tables:
                    from urllib.parse import urljoin

                    for j, u in enumerate(self._discover_api(snap, text)[:8]):
                        url = u if u.startswith("http") else urljoin(base, u)
                        try:
                            snap.get(url, f"api_{j}.json", timeout=60, allow_statuses=(200, 401, 403, 404, 405))
                            head = snap.path(f"api_{j}.json").read_bytes()[:300]
                            snap.manifest.setdefault("api_probe", []).append({"url": url, "status": snap.files[f"api_{j}.json"]["status"], "head": head.decode("utf-8", "ignore")})
                        except Exception as e:  # noqa: BLE001
                            snap.manifest.setdefault("errors", []).append({"name": url, "error": str(e)[:200]})
            if not tables or not any(len(t) > 1 for t in tables):
                break
        snap.save()

    def parse(self, snap: Snapshot) -> dict[str, pd.DataFrame]:
        docs: dict[str, dict] = {}
        votes: list[dict] = []
        for name in sorted(snap.files):
            if not name.startswith("votaciones_") or not snap.has(name):
                continue
            tables, _ = tables_from_html(snap.path(name).read_text(encoding="utf-8", errors="ignore"))
            for t in tables:
                if len(t) < 2:
                    continue
                header = [c.lower() for c in t[0]]
                def idx(*words, header=header):
                    return next((i for i, h in enumerate(header) if any(w in h for w in words)), None)
                i_date, i_title, i_res = idx("fecha"), idx("tema", "asunto", "moci", "descrip", "título", "titulo"), idx("resultado", "estado")
                i_yes, i_no, i_abs, i_blank = idx("afirm", "favor", "sí", "si"), idx("negat", "contra"), idx("absten"), idx("blanco", "ausente")
                if i_title is None or i_date is None:
                    continue
                for r in t[1:]:
                    if len(r) <= max(i_title, i_date):
                        continue
                    title = re.sub(r"\[[^\]]*\]", "", r[i_title]).strip()
                    date = iso_date(r[i_date]) or (f"{year_of(r[i_date])}-01-01" if year_of(r[i_date]) else None)
                    rel = relevance(title)
                    if not title or not date or not is_relevant(rel, "parliament", title):
                        continue
                    link = next((m.group(1) for m in re.finditer(r"\[([^\]]+)\]", r[i_title])), None)
                    url = link if link and link.startswith("http") else (self.src.api_url.rstrip("/") + "/" + link.lstrip("/") if link else self.src.api_url)
                    doc = make_document(source_id=self.source_id, country="ECU", doc_type="vote", date=date, date_precision="day" if iso_date(r[i_date]) else "year",
                                        title=title, language="es", venue="Asamblea Nacional (Pleno)", url=url, rel=rel, native_id=f"{date}-{event_id(title)}")
                    docs[doc["doc_id"]] = doc
                    def _i(k, r=r):
                        try:
                            return int(re.sub(r"\D", "", r[k])) if k is not None and k < len(r) and re.search(r"\d", r[k]) else None
                        except ValueError:
                            return None
                    yes, no, abst, blank = _i(i_yes), _i(i_no), _i(i_abs), _i(i_blank)
                    votes.append({"vote_id": event_id("ECU", self.source_id, "vote", doc["doc_id"]), "doc_id": doc["doc_id"], "country": "ECU", "chamber": "Asamblea Nacional",
                                  "date": date, "year": int(date[:4]), "title_original": title[:400], "result": r[i_res] if i_res is not None and i_res < len(r) else None,
                                  "yes": yes, "no": no, "abstain": abst, "absent": blank, "total": sum(x or 0 for x in (yes, no, abst, blank)) if yes is not None or no is not None else None,
                                  "native_id": None, "value_type": "reported", "source_record_url": url})
        return {"document": self.stamp(snap, pd.DataFrame(list(docs.values()), columns=DOCUMENT_COLUMNS)), "vote": self.stamp(snap, pd.DataFrame(votes, columns=VOTE_COLUMNS))}


class SPLEY(Adapter):
    source_id = "per_congreso_spley"
    tables = ("document",)
    language = "es"
    BASES = ["https://wb2server.congreso.gob.pe/spley-portal-service", "https://api.congreso.gob.pe/spley-portal-service"]
    TERMS = ["minería", "minero", "litio", "cobre", "China", "Estados Unidos"]
    PERIODS = [2021, 2026, 2016, 2011, 2006]  # perParId values seen in the portal: start year of each parliamentary period

    def fetch(self, snap: Snapshot) -> None:
        got = False
        for base in self.BASES:
            for per in self.PERIODS:
                for term in self.TERMS:
                    name = f"lista_{per}_{term}.json"
                    body = {"perParId": per, "palabras": term, "pageSize": 100, "rowStart": 0}
                    try:
                        snap.post_json(f"{base}/proyecto-ley/lista-con-filtro", name, body, headers={"Content-Type": "application/json", "Accept": "application/json"}, timeout=120)
                        got = True
                    except Exception as e:  # noqa: BLE001
                        snap.manifest.setdefault("errors", []).append({"name": f"{base} {name}", "error": str(e)[:200]})
                        if "TLS" in str(e) or "SSL" in str(e) or "Max retries" in str(e):
                            break
                if snap.manifest.get("errors") and not got:
                    break
            if got:
                snap.manifest["base_used"] = base
                break
        snap.save()
        if not got:
            raise RuntimeError("per_congreso_spley: the SPLEY service answered no request (see errors); Peru's bills stay missing")

    def parse(self, snap: Snapshot) -> dict[str, pd.DataFrame]:
        docs: dict[str, dict] = {}
        for name in sorted(snap.files):
            if not name.startswith("lista_") or not snap.has(name):
                continue
            try:
                payload = json.loads(snap.path(name).read_text(encoding="utf-8"))
            except json.JSONDecodeError:
                continue
            items = payload.get("data", {}).get("proyectos", []) if isinstance(payload, dict) and isinstance(payload.get("data"), dict) else payload.get("data", []) if isinstance(payload, dict) else payload
            if isinstance(items, dict):
                items = next((v for v in items.values() if isinstance(v, list)), [])
            for i, d in enumerate(items if isinstance(items, list) else []):
                if not isinstance(d, dict):
                    continue
                title = _pick(d, "titulo", "desEstado", "sumilla", "nombre")
                summ = _pick(d, "sumilla", "resumen")
                text = f"{title} {summ}"
                rel = relevance(text)
                if not title or not is_relevant(rel, "parliament", text):
                    continue
                date = iso_date(_pick(d, "fecPresentacion", "fecha_presentacion", "fecha"))
                yr = year_of(date) or year_of(_pick(d, "anio", "perParId"))
                if not yr or yr < 2008:
                    continue
                native = _pick(d, "pleyNum", "numero", "id", "pleyId") or f"{name}-{i}"
                row = make_document(source_id=self.source_id, country="PER", doc_type="bill", date=date or f"{yr}-01-01", date_precision="day" if date else "year",
                                    title=f"{native}: {title}" if native and not native.startswith("lista_") else title, language="es", venue="Congreso de la República",
                                    url=f"https://wb2server.congreso.gob.pe/spley-portal/#/expediente/{_pick(d, 'perParId') or '2021'}/{_pick(d, 'pleyId', 'id')}", rel=rel,
                                    native_id=native, summary=summ[:1000] or None, status=_pick(d, "desEstado", "estado") or None, author=_pick(d, "autores", "autor")[:300] or None)
                docs[row["doc_id"]] = row
        return {"document": self.stamp(snap, pd.DataFrame(list(docs.values()), columns=DOCUMENT_COLUMNS))}
