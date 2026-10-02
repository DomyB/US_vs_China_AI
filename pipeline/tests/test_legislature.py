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


SENADO_LIST = {"PesquisaBasicaMateria": {"Materias": {"Materia": [
    {"Codigo": "165432", "Sigla": "PL", "Numero": "2780", "Ano": "2024", "DescricaoIdentificacao": "PL 2780/2024", "Ementa": "Institui a Política Nacional de Minerais Críticos e Estratégicos", "Autor": "Câmara dos Deputados", "Data": "2024-07-10", "Situacao": "Transformada em norma jurídica"},
    {"Codigo": "165433", "Sigla": "PL", "Numero": "7", "Ano": "2024", "DescricaoIdentificacao": "PL 7/2024", "Ementa": "Altera o calendário escolar", "Autor": "Senador X", "Data": "2024-02-10"},
]}}}
SENADO_VOTES = {"VotacaoMateria": {"Materia": {"Votacoes": {"Votacao": [{"CodigoSessaoVotacao": "9001", "SessaoPlenaria": {"DataSessao": "2026-02-12"}, "DescricaoVotacao": "Votação nominal do PL 2780/2024",
    "DescricaoResultado": "Aprovado", "TotalVotosSim": "58", "TotalVotosNao": "3", "TotalVotosAbstencao": "1",
    "Votos": {"VotoParlamentar": [{"CodigoParlamentar": "5", "NomeParlamentar": "Senadora A", "SiglaPartido": "MDB", "SiglaUF": "GO", "DescricaoVoto": "Sim"},
                                  {"CodigoParlamentar": "6", "NomeParlamentar": "Senador B", "SiglaPartido": "PT", "SiglaUF": "BA", "DescricaoVoto": "Não"}]}}]}}}}


def test_senado_matters_votes_members(snap_factory):
    from scm.ingest.legis_bra import SenadoBR

    snap = snap_factory("bra_senado_api", {"materias/2024.json": SENADO_LIST, "votacoes/165432.json": SENADO_VOTES})
    a = SenadoBR()
    assert a._kept_matters(snap) == ["165432"]
    out = a.parse(snap)
    _validate(out)
    d = out["document"].iloc[0]
    assert d["native_id"] == "165432" and d["title_original"].startswith("PL 2780/2024:") and d["author"] == "Câmara dos Deputados" and d["status"].startswith("Transformada")
    assert d["source_record_url"].endswith("/materia/165432") and d["venue"] == "Senado Federal"
    v = out["vote"].iloc[0]
    assert v["doc_id"] == d["doc_id"] and v["date"] == "2026-02-12" and v["yes"] == 58 and v["abstain"] == 1 and v["result"] == "Aprovado"
    assert list(out["vote_member"]["choice"]) == ["yes", "no"] and out["vote_member"].iloc[0]["region"] == "GO"


CHL_PROJECTS = '''<?xml version="1.0"?><ProyectosLeyColeccion xmlns="http://opendata.camara.cl/camaradiputados/v1">
<ProyectoLey><Id>1001</Id><Numero_Boletin>15123-08</Numero_Boletin><Nombre>Modifica el Código de Minería en materia de concesiones de litio</Nombre><Fecha_Ingreso>2022-06-14T00:00:00</Fecha_Ingreso><Camara_Origen>Cámara de Diputados</Camara_Origen><Estado>En tramitación</Estado></ProyectoLey>
<ProyectoLey><Id>1002</Id><Numero_Boletin>15124-04</Numero_Boletin><Nombre>Declara feriado regional</Nombre><Fecha_Ingreso>2022-06-15T00:00:00</Fecha_Ingreso><Camara_Origen>Senado</Camara_Origen><Estado>Publicado</Estado></ProyectoLey>
</ProyectosLeyColeccion>'''
CHL_VOTES = '''<?xml version="1.0"?><VotacionesColeccion xmlns="http://opendata.camara.cl/camaradiputados/v1"><Votacion><Id>77</Id><Fecha>2023-03-08T00:00:00</Fecha><Descripcion>Votación en general</Descripcion><Resultado>Aprobado</Resultado><TotalSi>120</TotalSi><TotalNo>10</TotalNo><TotalAbstencion>5</TotalAbstencion><TotalDispensado>2</TotalDispensado></Votacion></VotacionesColeccion>'''
CHL_DETAIL = '''<?xml version="1.0"?><Votacion xmlns="http://opendata.camara.cl/camaradiputados/v1"><Id>77</Id><Votos>
<Voto><Diputado><Id>31</Id><Nombre>Ana</Nombre><Apellido_Paterno>Pérez</Apellido_Paterno><Apellido_Materno>Soto</Apellido_Materno></Diputado><OpcionVoto Valor="1">Afirmativo</OpcionVoto></Voto>
<Voto><Diputado><Id>32</Id><Nombre>Luis</Nombre><Apellido_Paterno>Rojas</Apellido_Paterno></Diputado><OpcionVoto Valor="3">Abstencion</OpcionVoto></Voto>
</Votos></Votacion>'''


def test_chile_camara_soap_xml(snap_factory):
    from scm.ingest.legis_chl import CamaraCL

    snap = snap_factory("chl_camara", {"proyectos/2022.xml": CHL_PROJECTS, "votaciones/15123-08.xml": CHL_VOTES, "detalle/77.xml": CHL_DETAIL})
    a = CamaraCL()
    assert [b for b, _ in a._kept_projects(snap)] == ["15123-08"]
    out = a.parse(snap)
    _validate(out)
    d = out["document"].iloc[0]
    assert d["native_id"] == "15123-08" and d["minerals"] == "lithium" and d["date"] == "2022-06-14" and "prmBOLETIN=15123-08" in d["source_record_url"]
    v = out["vote"].iloc[0]
    assert v["yes"] == 120 and v["absent"] == 2 and v["total"] == 137 and v["result"] == "Aprobado" and v["doc_id"] == d["doc_id"]
    m = out["vote_member"]
    assert list(m["choice"]) == ["yes", "abstain"] and m.iloc[0]["member_name"] == "Ana Pérez Soto"
