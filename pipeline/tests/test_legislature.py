"""Legislature adapters on synthetic fixtures in each source's documented format."""
from __future__ import annotations

import json

import pytest

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


def test_hcdn_ckan_csvs(snap_factory):
    from scm.ingest.legis_arg import HCDN

    proyectos = "expediente;tipo;fecha;titulo;sumario;camara_origen;autor\n0001-D-2024;PROYECTO DE LEY;2024-03-05;Régimen de promoción del litio;Promueve la industrialización del litio;Diputados;Pérez, Juan\n0002-D-2024;PROYECTO DE LEY;2024-03-06;Día del tango;;Diputados;Gómez\n"
    votaciones = "votacion_id,fecha,titulo,resultado,afirmativos,negativos,abstenciones,ausentes,expediente\n501,2024-11-20,Litio: régimen de promoción,AFIRMATIVO,140,90,5,22,0001-D-2024\n502,2024-11-21,Tango,AFIRMATIVO,200,0,0,57,0002-D-2024\n"
    votos = "votacion_id,diputado,bloque,provincia,voto\n501,PEREZ JUAN,Unión por la Patria,Buenos Aires,AFIRMATIVO\n501,LOPEZ ANA,PRO,CABA,NEGATIVO\n502,LOPEZ ANA,PRO,CABA,AFIRMATIVO\n"
    snap = snap_factory("arg_hcdn", {"proyectos/0.csv": proyectos, "votaciones/0.csv": votaciones, "votos/0.csv": votos})
    out = HCDN().parse(snap)
    _validate(out)
    d = out["document"]
    assert len(d) == 1 and d.iloc[0]["native_id"] == "0001-D-2024" and d.iloc[0]["minerals"] == "lithium" and d.iloc[0]["author"] == "Pérez, Juan"
    v = out["vote"]
    assert len(v) == 1 and v.iloc[0]["doc_id"] == d.iloc[0]["doc_id"] and v.iloc[0]["yes"] == 140 and v.iloc[0]["absent"] == 22 and v.iloc[0]["total"] == 257
    m = out["vote_member"]
    assert len(m) == 2 and list(m["choice"]) == ["yes", "no"] and m.iloc[0]["party"] == "Unión por la Patria"


def test_uruguay_and_colombia_bills(snap_factory):
    from scm.ingest.legis_col import CamaraCO
    from scm.ingest.legis_ury import ParlamentoUY

    asuntos = "id,titulo,fecha,camara,tipo\n77,Minería de gran porte. Modificación.,12/04/2013,CRR,PROYECTO DE LEY\n78,Feriado departamental,13/04/2013,CSS,PROYECTO DE LEY\n"
    out = ParlamentoUY().parse(snap_factory("ury_parlamento", {"asuntos/0.csv": asuntos}))
    _validate(out)
    assert len(out["document"]) == 1 and out["document"].iloc[0]["date"] == "2013-04-12" and out["document"].iloc[0]["venue"] == "Parlamento (CRR)"
    page = [{"numero_camara": "123/2023C", "titulo": "Por medio de la cual se regula la explotación de cobre y se dictan otras disposiciones", "fecha_de_radicacion": "2023-08-01T00:00:00.000", "estado": "Archivado", "autor": "H.R. X", "legislatura": "2023-2024"},
            {"numero_camara": "124/2023C", "titulo": "Por la cual se honra a un municipio", "fecha_de_radicacion": "2023-08-02T00:00:00.000"}]
    out = CamaraCO().parse(snap_factory("col_camara", {"page_0.json": page}))
    _validate(out)
    d = out["document"].iloc[0]
    assert len(out["document"]) == 1 and d["native_id"] == "123/2023C" and d["minerals"] == "copper" and d["status"] == "Archivado" and d["date"] == "2023-08-01"


def test_uruguay_catalogue_search_discovers_the_organisation(snap_factory, monkeypatch):
    from scm.ingest.legis_ury import ParlamentoUY

    snap = snap_factory("ury_parlamento", {})
    calls = []
    pkg = {"id": "p1", "name": "asuntos-entrados", "organization": {"name": "poder-legislativo"},
           "resources": [{"name": "Asuntos entrados 2008-2026", "format": "CSV", "url": "https://catalogodatos.gub.uy/x/asuntos.csv"}]}

    def fake_get_json(url, name, params=None, **kw):
        calls.append((url.rsplit("/", 1)[-1], params))
        if url.endswith("organization_list"):
            return {"result": [{"name": "poder-legislativo", "title": "Poder Legislativo", "package_count": 3}, {"name": "mgap", "title": "Ministerio de Ganadería"}]}
        if params.get("fq") == "organization:poder-legislativo":
            return {"result": {"results": [pkg]}}
        return {"result": {"results": [pkg, {"id": "p2", "name": "otro", "resources": []}]}}

    monkeypatch.setattr(snap, "get_json", fake_get_json)
    monkeypatch.setattr(snap, "get", lambda url, name, **kw: (_ for _ in ()).throw(RuntimeError("HTTP 403")))
    with pytest.raises(RuntimeError, match="no bill dataset|403"):
        ParlamentoUY().fetch(snap)
    assert [o["name"] for o in snap.manifest["organizations"]] == ["poder-legislativo"]
    assert [c[0] for c in calls] == ["organization_list"] + ["package_search"] * 6  # per organisation, OR query, four plain words
    assert [p["name"] for p in snap.manifest["packages_seen"]] == ["asuntos-entrados", "otro"]  # deduplicated across searches
    assert snap.manifest["resource_candidates"][0]["url"].endswith("asuntos.csv")


def test_chile_senado_votes_from_camara_bills(snap_factory, tmp_path, monkeypatch):
    from scm.ingest import legis_chl
    from scm.ingest.legis_chl import SenadoCL

    xml = ('<?xml version="1.0"?><votaciones><votacion><ID>555</ID><SESION>12</SESION><FECHA>2024-05-07</FECHA><TEMA>Proyecto sobre litio, en general</TEMA>'
           '<QUORUM>Simple</QUORUM><SI>30</SI><NO>5</NO><ABSTENCION>2</ABSTENCION><PAREO>1</PAREO><DETALLE_VOTACION>'
           '<VOTO><PARLAMENTARIO>Senadora A</PARLAMENTARIO><SELECCION>Si</SELECCION></VOTO><VOTO><PARLAMENTARIO>Senador B</PARLAMENTARIO><SELECCION>Pareo</SELECCION></VOTO>'
           '</DETALLE_VOTACION></votacion></votaciones>')
    snap = snap_factory("chl_senado", {"votaciones/15123-08.xml": xml})
    snap.manifest["boletines"] = {"15123-08": {"doc_id": "docX", "title": "Boletín 15123-08: litio"}}
    out = SenadoCL().parse(snap)
    _validate(out)
    v = out["vote"].iloc[0]
    assert v["doc_id"] == "docX" and v["yes"] == 30 and v["absent"] == 1 and v["total"] == 38 and v["chamber"] == "Senado"
    assert list(out["vote_member"]["choice"]) == ["yes", "absent"]
    monkeypatch.setattr(legis_chl, "WAREHOUSE_DIR", tmp_path, raising=False)


def test_ecuador_votes_from_html_table(snap_factory):
    from scm.ingest.legis_misc import AsambleaEC, tables_from_html

    html = ('<html><body><table><tr><th>Fecha</th><th>Tema</th><th>Afirmativos</th><th>Negativos</th><th>Abstenciones</th><th>Resultado</th></tr>'
            '<tr><td>12/03/2024</td><td><a href="/votaciones/901">Ley Orgánica de Minería, reforma sobre regalías</a></td><td>98</td><td>20</td><td>7</td><td>Aprobado</td></tr>'
            '<tr><td>13/03/2024</td><td>Resolución sobre feriados</td><td>100</td><td>1</td><td>0</td><td>Aprobado</td></tr></table></body></html>')
    tables, links = tables_from_html(html)
    assert len(tables) == 1 and len(tables[0]) == 3 and links == ["/votaciones/901"]
    out = AsambleaEC().parse(snap_factory("ecu_asamblea", {"votaciones_0.html": html}))
    _validate(out)
    d = out["document"].iloc[0]
    assert d["doc_type"] == "vote" and d["date"] == "2024-03-12" and d["source_record_url"].endswith("/votaciones/901")
    v = out["vote"].iloc[0]
    assert v["doc_id"] == d["doc_id"] and v["yes"] == 98 and v["abstain"] == 7 and v["result"] == "Aprobado"


def test_spley_and_silpy_payloads(snap_factory):
    from scm.ingest.legis_misc import SPLEY, SILpy

    spley = {"data": {"proyectos": [{"pleyId": 12, "pleyNum": "01234/2023-CR", "titulo": "Ley que declara de interés nacional la exploración de litio en Puno", "fecPresentacion": "2023-05-04T00:00:00", "desEstado": "En comisión", "perParId": 2021, "autores": "Congresista X"},
                                    {"pleyId": 13, "pleyNum": "01235/2023-CR", "titulo": "Ley del día del ceviche", "fecPresentacion": "2023-05-05T00:00:00", "perParId": 2021}]}}
    out = SPLEY().parse(snap_factory("per_congreso_spley", {"lista_2021_litio.json": spley}))
    _validate(out)
    d = out["document"].iloc[0]
    assert len(out["document"]) == 1 and d["native_id"] == "01234/2023-CR" and d["minerals"] == "lithium" and "/expediente/2021/12" in d["source_record_url"]
    silpy = [{"expediente": "S-2211", "titulo": "Que regula la minería metálica en el Paraguay", "fecha_ingreso": "2019-08-01", "estado": "En trámite"},
             {"expediente": "S-2212", "titulo": "Que declara área silvestre", "fecha_ingreso": "2019-08-02"}]
    out = SILpy().parse(snap_factory("pry_silpy", {"route__proyectos.json": silpy}))
    _validate(out)
    assert len(out["document"]) == 1 and out["document"].iloc[0]["native_id"] == "S-2211" and out["document"].iloc[0]["venue"] == "Congreso Nacional"


def test_hcdn_real_column_names(snap_factory):
    """Columns as the HCDN catalogue serves them (October 2026): votes name the expediente only in the title."""
    from scm.ingest.legis_arg import HCDN

    proyectos = ("PROYECTO_ID,TITULO,PUBLICACION_FECHA,PUBLICACION_ID,CAMARA_ORIGEN,EXP_DIPUTADOS,EXP_SENADO,TIPO,AUTOR\n"
                 'HCDN1,"REGIMEN DE PROMOCION DE LA INDUSTRIALIZACION DEL LITIO.",2018-03-01T00:00:00,HCDN136TP1,Diputados,958-D-2018,,LEY,"PEREZ, JUAN"\n'
                 'HCDN2,"DECLARAR DE INTERES EL FESTIVAL DEL TANGO.",2018-03-02T00:00:00,HCDN136TP2,Diputados,959-D-2018,,RESOLUCION,"GOMEZ, ANA"\n')
    votaciones = ("sesion_id,acta_id,nroperiodo,tipo_periodo,reunion,sesion,tipo_sesion,numero,fecha,hora,base_mayoria,tipo_mayoria,titulo,resultado,presidente_nombre,persona_id,votos_afirmativos,votos_negativos,abstenciones,ausentes\n"
                  "HCDN136R02,3761,136,Ordinario,2,2,Tablas,3,2018-03-21,17:02,Votos Emitidos,Dos tercios,Pedido de Incorporación del Expediente 958-D-2018. Votación.,NEGATIVO,MONZÓ Emilio,,96,108,4,48\n"
                  "HCDN136R04,3779,136,Ordinario,4,3,Especial,11,2018-04-25,14:23,Legisladores Presentes,Dos tercios,Habilitar el Tratamiento del Expediente 959-D-2018. Votación.,NEGATIVO,MONZÓ Emilio,,127,101,0,28\n")
    votos = ("acta_id,acta_detalle_id,diputado_nombre,persona_id,bloque,distrito_nombre,voto\n"
             "3761,1085826,ABDALA DE MATARAZZO Norma Amanda, ,Frente Cívico por Santiago,Santiago del Estero,AFIRMATIVO\n"
             "3779,1091475,YEDLIN Pablo Raúl, ,Justicialista por Tucumán,Tucumán,AFIRMATIVO\n")
    out = HCDN().parse(snap_factory("arg_hcdn", {"proyectos/0.csv": proyectos, "votaciones/0.csv": votaciones, "votos/0.csv": votos}))
    _validate(out)
    d = out["document"]
    assert len(d) == 1 and d.iloc[0]["native_id"] == "958-D-2018" and d.iloc[0]["author"] == "PEREZ, JUAN"
    v = out["vote"]
    assert len(v) == 1 and v.iloc[0]["doc_id"] == d.iloc[0]["doc_id"] and v.iloc[0]["yes"] == 96 and v.iloc[0]["absent"] == 48 and v.iloc[0]["result"] == "NEGATIVO"
    m = out["vote_member"]
    assert len(m) == 1 and m.iloc[0]["choice"] == "yes" and m.iloc[0]["region"] == "Santiago del Estero" and m.iloc[0]["party"].startswith("Frente")
