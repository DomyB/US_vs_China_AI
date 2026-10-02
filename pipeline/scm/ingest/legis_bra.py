"""Brazil: Câmara dos Deputados open data -> document (bills), vote, vote_member.

Bulk files first (one CSV per year for propositions, votes and the vote->proposition link), filtered
locally with the keyword module; member-level votes come from the API for the votes kept (a few
hundred calls at most). The API is the fallback when a bulk file is missing.
"""
from __future__ import annotations

import io
import json
import re

import pandas as pd

from ..http import FetchError, Snapshot
from .base import Adapter, event_id
from .docs import DOCUMENT_COLUMNS, VOTE_COLUMNS, VOTE_MEMBER_COLUMNS, make_document
from .keywords import is_relevant, relevance
from .util import col

BULK = "https://dadosabertos.camara.leg.br/arquivos/{kind}/csv/{kind}-{year}.csv"
API = "https://dadosabertos.camara.leg.br/api/v2"
RECORD = "https://www.camara.leg.br/proposicoesWeb/fichadetramitacao?idProposicao={id}"
FIRST_YEAR = 2008
MAX_VOTE_DETAIL_CALLS = 1500
BILL_TYPES = {"PL", "PLP", "PEC", "MPV", "PLV", "PDL", "PDC", "PRC", "PLN", "PLC", "PLS"}
HEARING_TYPES = {"REQ", "RIC", "INC", "PFC", "RCP"}
CHOICE = {"sim": "yes", "não": "no", "nao": "no", "abstenção": "abstain", "abstencao": "abstain", "obstrução": "obstruction",
          "obstrucao": "obstruction", "art. 17": "other", "artigo 17": "other", "ausente": "absent", "não votou": "absent"}


def _read_csv(path, wanted: tuple[str, ...] | None = None) -> pd.DataFrame:
    """Read a Câmara bulk CSV as strings; with `wanted`, only the columns whose name contains one of
    those names (the yearly proposition files carry long text columns we never use)."""
    raw = path.read_bytes()
    text = raw.decode("utf-8", errors="ignore") if raw[:3] != b"\xef\xbb\xbf" else raw[3:].decode("utf-8", errors="ignore")
    del raw
    first = text.split("\n", 1)[0]
    sep = ";" if first.count(";") >= first.count(",") else ","
    header = [h.strip().strip('"') for h in first.strip().split(sep)]
    usecols = [h for h in header if any(w.lower() == h.lower() or w.lower() in h.lower() for w in wanted)] if wanted else None
    kw = {"sep": sep, "dtype": str, "keep_default_na": False}
    if usecols:
        kw["usecols"] = usecols
    try:
        return pd.read_csv(io.StringIO(text), low_memory=False, **kw)
    except (pd.errors.ParserError, ValueError):
        # truncated download or stray quote: salvage what the python engine can read
        kw.pop("usecols", None)
        return pd.read_csv(io.StringIO(text), engine="python", on_bad_lines="skip", quoting=3, **kw)


def _year(s: str) -> int | None:
    m = re.search(r"(19|20)\d{2}", str(s))
    return int(m.group(0)) if m else None


def _date(s: str) -> str | None:
    m = re.match(r"(\d{4}-\d{2}-\d{2})", str(s))
    return m.group(1) if m else None


class CamaraBR(Adapter):
    source_id = "bra_camara_api"
    tables = ("document", "vote", "vote_member")
    language = "pt"
    min_interval = 0.6

    def fetch(self, snap: Snapshot) -> None:
        import datetime as dt

        years = range(FIRST_YEAR, dt.date.today().year + 1)
        for kind in ("proposicoes", "votacoes", "votacoesProposicoes"):
            for y in years:
                try:
                    snap.get(BULK.format(kind=kind, year=y), f"bulk/{kind}-{y}.csv", timeout=600)
                except FetchError as e:
                    snap.manifest.setdefault("errors", []).append({"name": f"{kind}-{y}", "error": str(e)[:200]})
        snap.save()
        # member-level votes only for the votes we keep (cheap: a few hundred calls)
        kept_votes = self._kept_vote_ids(snap)
        snap.manifest["kept_votes"] = len(kept_votes)
        for i, vid in enumerate(kept_votes):
            if i >= MAX_VOTE_DETAIL_CALLS:
                snap.manifest["vote_detail_capped"] = True
                break
            try:
                snap.get_json(f"{API}/votacoes/{vid}/votos", f"votos/{vid}.json", headers={"Accept": "application/json"})
            except Exception as e:  # noqa: BLE001
                snap.manifest.setdefault("errors", []).append({"name": f"votos/{vid}", "error": str(e)[:200]})
        snap.save()

    # ---- selection shared by fetch and parse
    BILL_COLUMNS = ("id", "siglaTipo", "numero", "ano", "ementa", "ementaDetalhada", "keywords", "dataApresentacao", "ultimoStatus_descricaoSituacao", "descricaoSituacao")

    def _bills(self, snap: Snapshot) -> pd.DataFrame:
        """Relevant propositions only; each yearly file is filtered as it is read (the full corpus is
        hundreds of thousands of rows of long text and does not fit comfortably in a runner's memory)."""
        if getattr(self, "_bills_cache", None) is not None:
            return self._bills_cache
        kept_frames = []
        for name in sorted(snap.files):
            if not (name.startswith("bulk/proposicoes-") and snap.has(name)):
                continue
            df = _read_csv(snap.path(name), self.BILL_COLUMNS)
            if col(df, "id", required=False) is None or col(df, "ementa", required=False) is None:
                continue
            c_ementa = col(df, "ementa")
            c_kw = col(df, "keywords", required=False)
            c_det = col(df, "ementaDetalhada", required=False)
            text = df[c_ementa].fillna("") + " " + (df[c_kw].fillna("") if c_kw else "") + " " + (df[c_det].fillna("") if c_det else "")
            rels = [relevance(t) for t in text]
            keep = [is_relevant(r, "parliament", t) for r, t in zip(rels, text, strict=True)]
            part = df[keep].copy()
            part["_rel"] = [r for r, k in zip(rels, keep, strict=True) if k]
            kept_frames.append(part)
            del df, text, rels
        self._bills_cache = pd.concat(kept_frames, ignore_index=True) if kept_frames else pd.DataFrame()
        return self._bills_cache

    def _vote_links(self, snap: Snapshot) -> pd.DataFrame:
        frames = [_read_csv(snap.path(n)) for n in sorted(snap.files) if n.startswith("bulk/votacoesProposicoes-") and snap.has(n)]
        return pd.concat(frames, ignore_index=True) if frames else pd.DataFrame()

    def _votes(self, snap: Snapshot) -> pd.DataFrame:
        frames = [_read_csv(snap.path(n)) for n in sorted(snap.files) if n.startswith("bulk/votacoes-") and snap.has(n)]
        return pd.concat(frames, ignore_index=True) if frames else pd.DataFrame()

    def _kept_vote_ids(self, snap: Snapshot) -> list[str]:
        bills = self._bills(snap)
        links = self._vote_links(snap)
        if bills.empty or links.empty:
            return []
        c_pid = col(links, "proposicao_id", "idProposicao")
        c_vid = col(links, "idVotacao", "id")
        bill_ids = set(bills[col(bills, "id")].astype(str))
        kept = links[links[c_pid].astype(str).isin(bill_ids)]
        # votes on propositions outside the kept set but whose vote text is itself relevant
        c_ementa = col(links, "proposicao_ementa", required=False)
        if c_ementa:
            extra = links[[is_relevant(relevance(t), "parliament", t) for t in links[c_ementa].fillna("")]]
            kept = pd.concat([kept, extra]).drop_duplicates(subset=[c_vid])
        c_date = col(links, "data", required=False)
        if c_date:  # most recent votes first, so a call cap drops the oldest member-level detail
            kept = kept.sort_values(c_date, ascending=False)
        return list(dict.fromkeys(kept[c_vid].astype(str)))

    def parse(self, snap: Snapshot) -> dict[str, pd.DataFrame]:
        bills = self._bills(snap)
        docs: dict[str, dict] = {}
        if not bills.empty:
            c_id, c_tipo, c_num, c_ano, c_ementa = col(bills, "id"), col(bills, "siglaTipo"), col(bills, "numero"), col(bills, "ano"), col(bills, "ementa")
            c_date = col(bills, "dataApresentacao", required=False)
            c_status = col(bills, "ultimoStatus_descricaoSituacao", "descricaoSituacao", required=False)
            for _, r in bills.iterrows():
                date = _date(r[c_date]) if c_date else None
                prec = "day" if date else "year"
                date = date or f"{_year(r[c_ano]) or _year(r[c_date] if c_date else '') or FIRST_YEAR}-01-01"
                if int(date[:4]) < FIRST_YEAR:
                    continue
                tipo = str(r[c_tipo]).strip()
                doc_type = "bill" if tipo in BILL_TYPES else "hearing" if tipo in HEARING_TYPES else "bill"
                title = f"{tipo} {r[c_num]}/{r[c_ano]}: {r[c_ementa]}"
                row = make_document(source_id=self.source_id, country="BRA", doc_type=doc_type, date=date, date_precision=prec, title=title,
                                    language="pt", venue="Câmara dos Deputados", url=RECORD.format(id=r[c_id]), rel=r["_rel"],
                                    native_id=str(r[c_id]), summary=str(r[c_ementa])[:1000] or None,
                                    status=str(r[c_status]) if c_status and r[c_status] else None)
                docs[row["doc_id"]] = row
        votes_rows: list[dict] = []
        members: list[dict] = []
        votes, links = self._votes(snap), self._vote_links(snap)
        if not votes.empty and not links.empty:
            kept_ids = set(self._kept_vote_ids(snap))
            c_vid, c_pid = col(links, "idVotacao", "id"), col(links, "proposicao_id", "idProposicao")
            link_by_vote = {str(r[c_vid]): r for _, r in links.iterrows() if str(r[c_vid]) in kept_ids}
            vc_id, vc_date, vc_desc = col(votes, "id"), col(votes, "data"), col(votes, "descricao", required=False)
            vc_apr, vc_sim, vc_nao, vc_out = (col(votes, c, required=False) for c in ("aprovacao", "votosSim", "votosNao", "votosOutros"))
            vc_org = col(votes, "siglaOrgao", required=False)
            for _, v in votes.iterrows():
                vid = str(v[vc_id])
                if vid not in link_by_vote:
                    continue
                link = link_by_vote[vid]
                date = _date(v[vc_date])
                if not date or int(date[:4]) < FIRST_YEAR:
                    continue
                pid = str(link[c_pid])
                doc_id = event_id("BRA", self.source_id, pid)
                if doc_id not in docs:
                    # proposition presented before 2008 (or filtered out) but voted in scope: add it from the link row
                    ementa = str(link.get(col(links, "proposicao_ementa", required=False) or "", ""))
                    tipo, num, ano = (str(link.get(col(links, c, required=False) or "", "")) for c in ("proposicao_siglaTipo", "proposicao_numero", "proposicao_ano"))
                    yr = _year(ano) or int(date[:4])
                    docs[doc_id] = make_document(source_id=self.source_id, country="BRA", doc_type="bill", date=f"{max(yr, 1990)}-01-01", date_precision="year",
                                                 title=f"{tipo} {num}/{ano}: {ementa}", language="pt", venue="Câmara dos Deputados",
                                                 url=RECORD.format(id=pid), rel=relevance(ementa), native_id=pid, summary=ementa[:1000] or None)
                def _int(x):
                    try:
                        return int(float(x))
                    except (TypeError, ValueError):
                        return None
                yes, no, outros = (_int(v[c]) if c else None for c in (vc_sim, vc_nao, vc_out))
                total = (yes or 0) + (no or 0) + (outros or 0) if yes is not None or no is not None else None
                apr = str(v[vc_apr]) if vc_apr else ""
                result = "aprovado" if apr in ("1", "1.0", "True") else "rejeitado" if apr in ("0", "0.0", "False") else None
                vote_id = event_id("BRA", self.source_id, "vote", vid)
                votes_rows.append({"vote_id": vote_id, "doc_id": doc_id, "country": "BRA", "chamber": f"Câmara dos Deputados ({v[vc_org]})" if vc_org and v[vc_org] else "Câmara dos Deputados",
                                   "date": date, "year": int(date[:4]), "title_original": (str(v[vc_desc]) if vc_desc else "")[:400] or docs[doc_id]["title_original"],
                                   "result": result, "yes": yes, "no": no, "abstain": None, "absent": None, "total": total, "native_id": vid,
                                   "value_type": "reported", "source_record_url": f"{API}/votacoes/{vid}"})
                if snap.has(f"votos/{vid}.json"):
                    import json

                    payload = json.loads(snap.path(f"votos/{vid}.json").read_text(encoding="utf-8"))
                    for m in payload.get("dados", []) if isinstance(payload, dict) else []:
                        dep = m.get("deputado_", {}) or {}
                        choice_orig = str(m.get("tipoVoto", ""))
                        members.append({"vote_id": vote_id, "country": "BRA", "member_id": str(dep.get("id") or event_id(dep.get("nome"))),
                                        "member_name": str(dep.get("nome", "")), "party": dep.get("siglaPartido"), "region": dep.get("siglaUf"),
                                        "choice": CHOICE.get(choice_orig.strip().lower(), "other"), "choice_original": choice_orig,
                                        "source_record_url": f"{API}/votacoes/{vid}/votos"})
        return {
            "document": self.stamp(snap, pd.DataFrame(list(docs.values()), columns=DOCUMENT_COLUMNS)),
            "vote": self.stamp(snap, pd.DataFrame(votes_rows, columns=VOTE_COLUMNS)),
            "vote_member": self.stamp(snap, pd.DataFrame(members, columns=VOTE_MEMBER_COLUMNS)),
        }


SENADO = "https://legis.senado.leg.br/dadosabertos"
SENADO_RECORD = "https://www25.senado.leg.br/web/atividade/materias/-/materia/{codigo}"
SENADO_TERMS = ["mineração", "minerais", "lítio", "nióbio", "terras raras", "cobre", "China", "Estados Unidos"]
MAX_SENADO_VOTE_CALLS = 300


def _walk(obj, want: set[str]):
    """Yield every dict (anywhere in a JSON tree) that has all the keys in `want`."""
    if isinstance(obj, dict):
        if want <= set(obj):
            yield obj
        for v in obj.values():
            yield from _walk(v, want)
    elif isinstance(obj, list):
        for v in obj:
            yield from _walk(v, want)


def _pick(d: dict, *names: str, default=None):
    low = {k.lower(): v for k, v in d.items()}
    for n in names:
        if n.lower() in low and low[n.lower()] not in (None, ""):
            return low[n.lower()]
    return default


class SenadoBR(Adapter):
    """Senado Federal open data: matters per year (or per keyword when the yearly list fails), then
    votes per matter kept. Both the classic and the renamed routes are tried and recorded."""

    source_id = "bra_senado_api"
    tables = ("document", "vote", "vote_member")
    language = "pt"
    min_interval = 1.0
    headers = {"Accept": "application/json"}

    def fetch(self, snap: Snapshot) -> None:
        import datetime as dt

        tried: list[str] = []
        for y in range(FIRST_YEAR, dt.date.today().year + 1):
            # keyword searches first: small responses. The whole-year list (every matter of the year, with
            # full detail) is only a fallback, and it is parsed one file at a time.
            ok = False
            for term in SENADO_TERMS:
                url = f"{SENADO}/materia/pesquisa/lista"
                tried.append(url + "?palavraChave")
                try:
                    payload = snap.get_json(url, f"materias/{y}_{term}.json", params={"ano": y, "palavraChave": term}, headers=self.headers, timeout=300)
                except Exception as e:  # noqa: BLE001
                    snap.manifest.setdefault("errors", []).append({"name": f"materias/{y}_{term}", "error": str(e)[:200]})
                    break
                if any(True for _ in _walk(payload, {"Ementa"})) or any(True for _ in _walk(payload, {"ementa"})):
                    ok = True
                    snap.manifest["materias_route"] = url + "?palavraChave"
                else:
                    snap.discard(f"materias/{y}_{term}.json", "no matters in payload")
                del payload
            if not ok:
                for url, params in ((f"{SENADO}/materia/pesquisa/lista", {"ano": y}), (f"{SENADO}/materia/tramitando", {"ano": y}),
                                    (f"{SENADO}/processo", {"ano": y})):
                    tried.append(url)
                    try:
                        snap.get(url, f"materias/{y}.json", params=params, headers=self.headers, timeout=300)
                    except Exception as e:  # noqa: BLE001
                        snap.manifest.setdefault("errors", []).append({"name": f"materias/{y} {url}", "error": str(e)[:200]})
                        continue
                    if snap.path(f"materias/{y}.json").stat().st_size > 2_000:
                        snap.manifest["materias_route"] = url
                        break
                    snap.discard(f"materias/{y}.json", f"{url}: empty payload")
        snap.manifest["endpoints_tried"] = sorted(set(tried))
        snap.save()
        kept = self._kept_matters(snap)
        snap.manifest["kept_matters"] = len(kept)
        for i, codigo in enumerate(kept):
            if i >= MAX_SENADO_VOTE_CALLS:
                snap.manifest["vote_calls_capped"] = True
                break
            try:
                snap.get_json(f"{SENADO}/materia/votacoes/{codigo}", f"votacoes/{codigo}.json", headers=self.headers, timeout=120, allow_statuses=(200, 404))
            except Exception as e:  # noqa: BLE001
                snap.manifest.setdefault("errors", []).append({"name": f"votacoes/{codigo}", "error": str(e)[:200]})
        snap.save()

    def _matters(self, snap: Snapshot) -> dict[str, dict]:
        out: dict[str, dict] = {}
        for name in sorted(snap.files):
            if not name.startswith("materias/") or not snap.has(name):
                continue
            try:
                payload = json.loads(snap.path(name).read_text(encoding="utf-8"))
            except json.JSONDecodeError:
                continue
            for d in list(_walk(payload, {"Ementa"})) + list(_walk(payload, {"ementa"})):
                codigo = str(_pick(d, "Codigo", "CodigoMateria", "codigoMateria", "id", default="")).strip()
                text = f"{_pick(d, 'Ementa', 'ementa', default='')} {_pick(d, 'IndexacaoMateria', 'indexacao', default='')}"
                if codigo and is_relevant(relevance(text), "parliament", text):
                    out[codigo] = d  # only relevant matters are kept in memory
            del payload
        return out

    def _kept_matters(self, snap: Snapshot) -> list[str]:
        matters = self._matters(snap)
        # most recent first, so the vote-call budget covers the matters most likely to have reached the floor recently
        return sorted(matters, key=lambda c: (str(_pick(matters[c], "Ano", "AnoMateria", "ano", default="")), c), reverse=True)

    def parse(self, snap: Snapshot) -> dict[str, pd.DataFrame]:
        docs: dict[str, dict] = {}
        matters = self._matters(snap)
        for codigo in self._kept_matters(snap):
            d = matters[codigo]
            ementa = str(_pick(d, "Ementa", "ementa", default=""))
            sigla = str(_pick(d, "Sigla", "SiglaSubtipoMateria", "siglaSubtipoMateria", "sigla", default=""))
            numero = str(_pick(d, "Numero", "NumeroMateria", "numero", default=""))
            ano = str(_pick(d, "Ano", "AnoMateria", "ano", default=""))
            ident = str(_pick(d, "DescricaoIdentificacao", "DescricaoIdentificacaoMateria", "identificacao", default=f"{sigla} {numero}/{ano}".strip()))
            date = _date(_pick(d, "Data", "DataApresentacao", "dataApresentacao", default="")) or (f"{_year(ano)}-01-01" if _year(ano) else None)
            if not date or int(date[:4]) < FIRST_YEAR:
                continue
            prec = "day" if _date(_pick(d, "Data", "DataApresentacao", "dataApresentacao", default="")) else "year"
            autor = _pick(d, "Autor", "NomeAutor", "autor")
            situacao = _pick(d, "Situacao", "DescricaoSituacao", "situacao")
            text = f"{ementa} {_pick(d, 'IndexacaoMateria', 'indexacao', default='')}"
            row = make_document(source_id=self.source_id, country="BRA", doc_type="bill", date=date, date_precision=prec, title=f"{ident}: {ementa}", language="pt",
                                venue="Senado Federal", url=SENADO_RECORD.format(codigo=codigo), rel=relevance(text), native_id=codigo, summary=ementa[:1000] or None,
                                author=str(autor) if autor else None, status=str(situacao) if situacao else None)
            docs[codigo] = row
        votes_rows: list[dict] = []
        members: list[dict] = []
        for codigo, row in docs.items():
            name = f"votacoes/{codigo}.json"
            if not snap.has(name):
                continue
            try:
                payload = json.loads(snap.path(name).read_text(encoding="utf-8"))
            except json.JSONDecodeError:
                continue
            for i, v in enumerate(list(_walk(payload, {"DescricaoVotacao"})) + list(_walk(payload, {"descricaoVotacao"}))):
                sess = _pick(v, "SessaoPlenaria", "sessaoPlenaria", default={}) or {}
                date = _date(_pick(v, "DataSessao", "dataSessao", default="") or _pick(sess, "DataSessao", "dataSessao", default=""))
                if not date:
                    continue
                def _i(x):
                    try:
                        return int(float(x))
                    except (TypeError, ValueError):
                        return None
                yes, no, abst = (_i(_pick(v, k1, k2)) for k1, k2 in (("TotalVotosSim", "totalVotosSim"), ("TotalVotosNao", "totalVotosNao"), ("TotalVotosAbstencao", "totalVotosAbstencao")))
                vid_native = str(_pick(v, "CodigoSessaoVotacao", "codigoSessaoVotacao", "SequencialSessao", default=f"{codigo}-{i}"))
                vote_id = event_id("BRA", self.source_id, "vote", codigo, vid_native)
                votes_rows.append({"vote_id": vote_id, "doc_id": row["doc_id"], "country": "BRA", "chamber": "Senado Federal", "date": date, "year": int(date[:4]),
                                   "title_original": str(_pick(v, "DescricaoVotacao", "descricaoVotacao", default=""))[:400] or row["title_original"],
                                   "result": _pick(v, "DescricaoResultado", "Resultado", "descricaoResultado", "resultado"), "yes": yes, "no": no, "abstain": abst, "absent": None,
                                   "total": (yes or 0) + (no or 0) + (abst or 0) if yes is not None or no is not None else None, "native_id": vid_native,
                                   "value_type": "reported", "source_record_url": f"{SENADO}/materia/votacoes/{codigo}"})
                for vp in list(_walk(v, {"NomeParlamentar"})) + list(_walk(v, {"nomeParlamentar"})):
                    choice_orig = str(_pick(vp, "DescricaoVoto", "Voto", "SiglaDescricaoVoto", "descricaoVoto", "voto", default=""))
                    low = choice_orig.strip().lower()
                    choice = "yes" if low.startswith("sim") else "no" if low.startswith(("não", "nao")) else "abstain" if "absten" in low else "absent" if ("ausente" in low or "não votou" in low or "nao votou" in low) else "other"
                    members.append({"vote_id": vote_id, "country": "BRA", "member_id": str(_pick(vp, "CodigoParlamentar", "codigoParlamentar", default=event_id(_pick(vp, "NomeParlamentar", "nomeParlamentar")))),
                                    "member_name": str(_pick(vp, "NomeParlamentar", "nomeParlamentar", default="")), "party": _pick(vp, "SiglaPartido", "siglaPartido"),
                                    "region": _pick(vp, "SiglaUF", "siglaUF", "SiglaUf"), "choice": choice, "choice_original": choice_orig or "?",
                                    "source_record_url": f"{SENADO}/materia/votacoes/{codigo}"})
        return {
            "document": self.stamp(snap, pd.DataFrame(list(docs.values()), columns=DOCUMENT_COLUMNS)),
            "vote": self.stamp(snap, pd.DataFrame(votes_rows, columns=VOTE_COLUMNS)),
            "vote_member": self.stamp(snap, pd.DataFrame(members, columns=VOTE_MEMBER_COLUMNS)),
        }
