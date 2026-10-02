"""Brazil: Câmara dos Deputados open data -> document (bills), vote, vote_member.

Bulk files first (one CSV per year for propositions, votes and the vote->proposition link), filtered
locally with the keyword module; member-level votes come from the API for the votes kept (a few
hundred calls at most). The API is the fallback when a bulk file is missing.
"""
from __future__ import annotations

import io
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
MAX_VOTE_DETAIL_CALLS = 400
BILL_TYPES = {"PL", "PLP", "PEC", "MPV", "PLV", "PDL", "PDC", "PRC", "PLN", "PLC", "PLS"}
HEARING_TYPES = {"REQ", "RIC", "INC", "PFC", "RCP"}
CHOICE = {"sim": "yes", "não": "no", "nao": "no", "abstenção": "abstain", "abstencao": "abstain", "obstrução": "obstruction",
          "obstrucao": "obstruction", "art. 17": "other", "artigo 17": "other", "ausente": "absent", "não votou": "absent"}


def _read_csv(path) -> pd.DataFrame:
    raw = path.read_bytes()
    text = raw.decode("utf-8", errors="ignore") if raw[:3] != b"\xef\xbb\xbf" else raw[3:].decode("utf-8", errors="ignore")
    first = text.split("\n", 1)[0]
    sep = ";" if first.count(";") >= first.count(",") else ","
    return pd.read_csv(io.StringIO(text), sep=sep, dtype=str, keep_default_na=False, low_memory=False)


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
    def _bills(self, snap: Snapshot) -> pd.DataFrame:
        frames = []
        for name in sorted(snap.files):
            if name.startswith("bulk/proposicoes-") and snap.has(name):
                df = _read_csv(snap.path(name))
                if "id" in df.columns or col(df, "id", required=False):
                    frames.append(df)
        if not frames:
            return pd.DataFrame()
        df = pd.concat(frames, ignore_index=True)
        c_ementa = col(df, "ementa")
        c_kw = col(df, "keywords", required=False)
        c_det = col(df, "ementaDetalhada", required=False)
        text = df[c_ementa].fillna("") + " " + (df[c_kw].fillna("") if c_kw else "") + " " + (df[c_det].fillna("") if c_det else "")
        rels = [relevance(t) for t in text]
        keep = [is_relevant(r, "parliament", t) for r, t in zip(rels, text, strict=True)]
        df = df[keep].copy()
        df["_rel"] = [r for r, k in zip(rels, keep, strict=True) if k]
        return df

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
        return sorted(set(kept[c_vid].astype(str)))

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
