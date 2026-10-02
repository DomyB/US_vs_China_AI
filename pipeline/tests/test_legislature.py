"""Legislature adapters on synthetic fixtures in each source's documented format."""
from __future__ import annotations

import json

from scm import schema
from scm.ingest.legis_bra import CamaraBR

PROPS = ("uri;id;siglaTipo;numero;ano;codTipo;descricaoTipo;ementa;ementaDetalhada;keywords;dataApresentacao;ultimoStatus_descricaoSituacao\n"
         "u;2434343;PL;2780;2024;139;Projeto de Lei;Institui a Política Nacional de Minerais Críticos e Estratégicos;;minerais críticos, mineração;2024-07-04T15:00;Transformado em norma jurídica\n"
         "u;2434344;PL;1;2024;139;Projeto de Lei;Dispõe sobre feriados municipais;;feriados;2024-02-01T10:00;Aguardando\n"
         "u;2434345;REQ;9;2024;140;Requerimento;Requer audiência pública sobre investimentos chineses no setor de lítio;;;2024-03-02;\n")
VOTES = ("id;uri;data;dataHoraRegistro;siglaOrgao;descricao;aprovacao;votosSim;votosNao;votosOutros\n"
         "2434343-100;u;2025-03-11;2025-03-11T20:00;PLEN;Aprovado o Projeto;1;380;20;5\n"
         "2434344-7;u;2024-05-05;x;PLEN;Rejeitado;0;10;300;0\n")
LINKS = ("idVotacao;uriVotacao;data;descricao;proposicao_id;proposicao_uri;proposicao_ementa;proposicao_codTipo;proposicao_siglaTipo;proposicao_numero;proposicao_ano;proposicao_titulo\n"
         "2434343-100;u;2025-03-11;Aprovado;2434343;u;Institui a Política Nacional de Minerais Críticos;139;PL;2780;2024;PL 2780/2024\n"
         "2434344-7;u;2024-05-05;Rej;2434344;u;Dispõe sobre feriados;139;PL;1;2024;PL 1/2024\n")
VOTOS = {"dados": [{"tipoVoto": "Sim", "deputado_": {"id": 1, "nome": "A", "siglaPartido": "PT", "siglaUf": "SP"}},
                   {"tipoVoto": "Obstrução", "deputado_": {"id": 2, "nome": "B", "siglaPartido": "PL", "siglaUf": "RJ"}}]}


def _validate(out):
    for k, v in out.items():
        assert len(schema.validate(k, v.copy())) == len(v)


def test_camara_bulk_filter_votes_and_members(snap_factory):
    snap = snap_factory("bra_camara_api", {"bulk/proposicoes-2024.csv": PROPS, "bulk/votacoes-2024.csv": VOTES,
                                          "bulk/votacoesProposicoes-2024.csv": LINKS, "votos/2434343-100.json": json.dumps(VOTOS)})
    a = CamaraBR()
    assert a._kept_vote_ids(snap) == ["2434343-100"]  # the holiday bill and its vote are filtered out
    out = a.parse(snap)
    _validate(out)
    docs = out["document"].set_index("native_id")
    assert set(docs.index) == {"2434343", "2434345"}
    assert docs.loc["2434343", "doc_type"] == "bill" and docs.loc["2434345", "doc_type"] == "hearing"
    assert docs.loc["2434345", "minerals"] == "lithium" and bool(docs.loc["2434345", "mentions_cn"])
    assert docs.loc["2434343", "summary"].startswith("Institui") and docs.loc["2434343", "status"] == "Transformado em norma jurídica"
    assert docs.loc["2434343", "source_record_url"].endswith("idProposicao=2434343")
    vote = out["vote"].iloc[0]
    assert vote["doc_id"] == docs.loc["2434343", "doc_id"] and vote["result"] == "aprovado" and vote["yes"] == 380 and vote["total"] == 405
    members = out["vote_member"]
    assert list(members["choice"]) == ["yes", "obstruction"] and members.iloc[0]["party"] == "PT"
    # stable ids across runs
    assert a.parse(snap)["document"]["doc_id"].tolist() == out["document"]["doc_id"].tolist()


def test_camara_vote_on_pre_2008_bill_creates_its_document(snap_factory):
    links = LINKS.replace("2434343;u;Institui a Política Nacional de Minerais Críticos;139;PL;2780;2024", "99;u;Novo marco da mineração;139;PL;37;2011")
    votes = VOTES.replace("2434343-100", "99-1")
    links = links.replace("2434343-100", "99-1")
    snap = snap_factory("bra_camara_api", {"bulk/proposicoes-2024.csv": PROPS, "bulk/votacoes-2024.csv": votes, "bulk/votacoesProposicoes-2024.csv": links})
    out = CamaraBR().parse(snap)
    _validate(out)
    created = out["document"][out["document"]["native_id"] == "99"].iloc[0]
    assert created["date"] == "2011-01-01" and created["date_precision"] == "year"
    assert out["vote"].iloc[0]["doc_id"] == created["doc_id"]
