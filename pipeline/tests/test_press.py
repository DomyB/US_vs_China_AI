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
    csv = "GGMC Commodities Table\n,,,\nYear,Gold (oz),Bauxite (tonnes),Diamonds (carats),Manganese (tonnes)\n2023,432123,\"3,120,000\",41000,0\n2024,\"434,000\",3200000,39000,120000\n"
    out = GGMC().parse(snap_factory("guy_ggmc", {"commodities.csv": csv}))
    df = schema.validate("production", out["production"].copy())
    assert set(df["mineral"]) == {"gold", "bauxite_aluminum", "manganese"}
    gold = df[(df["mineral"] == "gold") & (df["year"] == 2024)].iloc[0]
    assert gold["qty"] == 434000 and gold["unit"] == "oz" and gold["country"] == "GUY"
