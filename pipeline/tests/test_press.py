"""Press adapters (RSS) and national statistics adapters on synthetic fixtures."""
from __future__ import annotations

from scm import schema
from scm.ingest.national_guy import GGMC
from scm.ingest.press import RSSPress, _looks_like_feed_url, make_rss_adapters

FEED = ('<?xml version="1.0"?><rss><channel>'
        '<item><title>China amplia compras de nióbio brasileiro</title><link>https://www1.folha.uol.com.br/mercado/2026/10/x.shtml?utm_source=rss</link><pubDate>Thu, 01 Oct 2026 08:00:00 -0300</pubDate></item>'
        '<item><title>Time vence clássico</title><link>https://www1.folha.uol.com.br/esporte/y.shtml</link><pubDate>Thu, 01 Oct 2026 09:00:00 -0300</pubDate></item>'
        '<item><title>Mineração em Minas: CFEM recorde</title><link>https://www1.folha.uol.com.br/z.shtml</link></item>'
        '<item><title>EUA e lítio: acordo</title><link>https://www1.folha.uol.com.br/w.shtml</link></item>'
        '</channel></rss>')


def test_rss_press_headlines_only(snap_factory):
    cls = type("RSS_bra_folha", (RSSPress,), {"source_id": "bra_folha"})
    snap = snap_factory("bra_folha", {"feed_0.xml": FEED})
    out = cls().parse(snap)
    for k, v in out.items():
        assert len(schema.validate(k, v.copy())) == len(v)
    docs = out["document"]
    assert set(docs["title_original"]) == {"China amplia compras de nióbio brasileiro", "EUA e lítio: acordo"}  # sport dropped; CFEM has no actor/mineral
    assert docs["summary"].isna().all() and (docs["doc_type"] == "news").all() and (docs["language"] == "pt").all()
    assert docs.set_index("title_original").loc["China amplia compras de nióbio brasileiro", "url_norm"] == "https://www1.folha.uol.com.br/mercado/2026/10/x.shtml"
    undated = docs.set_index("title_original").loc["EUA e lítio: acordo"]
    assert undated["date_precision"] == "seen"
    vol = out["media_volume"].iloc[0]
    assert vol["items_total"] == 4 and vol["items_mining"] == 3 and vol["items_cn"] == 1 and vol["items_us"] == 1
    assert set(docs.columns) >= {"outlet_source_id", "venue"} and docs.iloc[0]["venue"].startswith("Folha")


def test_rss_adapters_come_from_registry():
    ids = [a.source_id for a in make_rss_adapters()]
    assert "bra_folha" in ids and "arg_clarin" in ids and len(ids) >= 20
    assert _looks_like_feed_url("https://www.clarin.com/rss/lo-ultimo/") and not _looks_like_feed_url("https://servicios.lanacion.com.ar/herramientas/rss/ayuda")


def test_ggmc_commodities_table(snap_factory):
    csv = ("GUYANA MINERAL PRODUCTION DECLARED ,,,,,,,,,\n,,,,,,,,,\n"
           "MINERALS,GOLD,,,,DIAMONDS,STONE,BAUXITE,MANGANESE,\n"
           "COMPANY,OMAI,,GRAND TOTAL,,-,-,-,-,\n"
           "YEAR,OZs,KGs,OZs,KGs,Metric Cts,TONNES,x1000 TONNES,TONNES,\n"
           '2023, -   , -   ," 432,123.00 ", 13440.1 ," 41,000 ", 100,"3,120.0 ", -,\n'
           '2024, -   , -   ," 434,000.00 ", 13500.0 ," 39,000 ", 100,"3,200.0 ", 120000,\n')
    out = GGMC().parse(snap_factory("guy_ggmc", {"commodities.csv": csv}))
    df = schema.validate("production", out["production"].copy())
    assert set(df["mineral"]) == {"gold", "bauxite_aluminum", "manganese"}
    gold = df[(df["mineral"] == "gold") & (df["year"] == 2024)]
    assert len(gold) == 1 and gold.iloc[0]["qty"] == 434000 and gold.iloc[0]["unit"] == "OZs"  # grand total in ounces only, no per-company or kg duplicates
    assert df[(df["mineral"] == "bauxite_aluminum") & (df["year"] == 2023)].iloc[0]["unit"] == "x1000 TONNES"
    assert len(df[df["mineral"] == "manganese"]) == 1



def test_gdelt_outlet_matching_and_windows(snap_factory, monkeypatch):
    from scm.ingest.gdelt import GDELTDoc, outlet_domains, windows

    payload = {"articles": [
        {"url": "https://www1.folha.uol.com.br/mercado/2025/03/x.shtml", "title": "China amplia compras de nióbio brasileiro", "seendate": "20250312T101500Z", "domain": "folha.uol.com.br", "language": "Portuguese", "sourcecountry": "Brazil"},
        {"url": "https://www.unknown-blog.com/a", "title": "Lítio e China", "seendate": "20250313T000000Z", "domain": "unknown-blog.com", "language": "Portuguese", "sourcecountry": "Brazil"},
        {"url": "https://valor.globo.com/y", "title": "Bolsa fecha em alta", "seendate": "20250314T000000Z", "domain": "valor.globo.com", "language": "Portuguese", "sourcecountry": "Brazil"},
        {"url": "https://valor.globo.com/z", "title": "EUA e Brasil negociam terras raras", "seendate": "20250315T000000Z", "domain": "valor.globo.com", "language": "Portuguese", "sourcecountry": "Brazil"},
    ]}
    snap = snap_factory("gdelt", {"BRA/2025-03-01_pt.json": payload})
    out = GDELTDoc().parse(snap)
    for k, v in out.items():
        assert len(schema.validate(k, v.copy())) == len(v)
    docs = out["document"].sort_values("date")
    assert len(docs) == 2 and list(docs["outlet_source_id"]) == ["bra_folha", "bra_valor"]
    assert (docs["date_precision"] == "seen").all() and docs.iloc[0]["date"] == "2025-03-12"
    assert docs.iloc[0]["reliability"] == "independent_academic" and docs.iloc[0]["source_id"] == "gdelt" and docs.iloc[0]["venue"].startswith("Folha")
    assert snap.manifest["unmatched_domains"] == {"unknown-blog.com": 1}
    vol = out["media_volume"].iloc[0]
    assert vol["period"] == "2025-03-01" and vol["items_total"] == 4 and vol["items_cn"] == 2
    assert outlet_domains()["valor.globo.com"] == "bra_valor"
    from datetime import date
    w = windows("BRA", date(2017, 2, 10))
    assert w[0] == (date(2017, 1, 1), date(2017, 1, 15)) and w[1] == (date(2017, 1, 16), date(2017, 1, 31)) and w[-1] == (date(2017, 2, 1), date(2017, 2, 10))
    assert windows("URY", date(2017, 3, 5))[1] == (date(2017, 2, 1), date(2017, 2, 28))


def test_anm_anna_concessions(snap_factory):
    from scm.ingest.national_col import ANMAnna

    page = [{"codigo_expediente": "ABC-123", "titular": "Minera X S.A.S.", "minerales": "COBRE\\ORO", "estado": "Titulo vigente", "modalidad": "Contrato de concesión (L 685)",
             "fecha_inscripcion": "2015-06-30T00:00:00.000", "fecha_terminacion": "2045-06-30T00:00:00.000", "area_ha": "1200.5", "latitud": "4.5", "longitud": "-74.1"},
            {"codigo_expediente": "DEF-9", "titular": "Y", "minerales": "MATERIALES DE CONSTRUCCION", "estado": "Titulo vigente"}]
    out = ANMAnna().parse(snap_factory("col_anm_anna", {"page_0.json": page}))
    df = schema.validate("concession", out["concession"].copy())
    assert len(df) == 2
    a = df.set_index("native_id").loc["ABC-123"]
    assert a["mineral"] == "copper" and a["granted_year"] == 2015 and a["expires_year"] == 2045 and a["area_ha"] == 1200.5 and a["holder"] == "Minera X S.A.S."
    assert df.set_index("native_id").loc["DEF-9"]["mineral"] is None or df.set_index("native_id").loc["DEF-9"]["mineral"] != df.set_index("native_id").loc["DEF-9"]["mineral"]
