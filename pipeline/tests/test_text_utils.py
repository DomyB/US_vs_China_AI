"""Feeds, keyword filter, robots cache, XML fixture trimming and incremental loads (Phase 2b framework)."""
from __future__ import annotations

import xml.etree.ElementTree as ET

import pandas as pd

from scm import schema
from scm.fixtures import _trim_xml
from scm.ingest.feeds import discover_feeds, normalize_url, parse_feed_bytes, strip_ns
from scm.ingest.keywords import is_relevant, relevance
from scm.robots import RobotsCache

RSS2 = b'<?xml version="1.0"?><rss version="2.0"><channel><title>t</title><item><title>Litio &amp; cobre</title><link>https://www.x.com/a/?utm_source=rss</link><pubDate>Wed, 01 Oct 2026 10:00:00 GMT</pubDate><guid>g1</guid></item></channel></rss>'
ATOM = b'<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><entry><title>Minera china</title><link rel="alternate" href="https://y.com/b"/><published>2026-09-30T12:00:00Z</published><id>e1</id></entry></feed>'
RDF = b'<?xml version="1.0"?><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns="http://purl.org/rss/1.0/" xmlns:dc="http://purl.org/dc/elements/1.1/"><item rdf:about="https://z.com/c"><title>Cobre sube</title><link>https://z.com/c</link><dc:date>2026-09-29</dc:date></item></rdf:RDF>'
BROKEN = b'<rss><channel><item><title>Oro & plata</title><link>https://w.com/d</link></item></channel></rss>'


def test_parse_feed_formats():
    assert [i.title for i in parse_feed_bytes(RSS2)] == ["Litio & cobre"] and parse_feed_bytes(RSS2)[0].published == "2026-10-01"
    assert parse_feed_bytes(ATOM)[0].link == "https://y.com/b" and parse_feed_bytes(ATOM)[0].published == "2026-09-30"
    assert parse_feed_bytes(RDF)[0].published == "2026-09-29"
    assert parse_feed_bytes(BROKEN)[0].title == "Oro & plata"  # bare ampersand repaired
    assert parse_feed_bytes(b"<html>not a feed</html>") == []


def test_normalize_url_and_discovery():
    assert normalize_url("https://WWW.X.com/a/?utm_source=rss&id=3#frag") == "https://x.com/a?id=3"
    assert normalize_url("https://x.com/a/amp/") == normalize_url("https://x.com/a")
    html = '<html><head><link rel="alternate" type="application/rss+xml" href="/rss/portada"><link rel="stylesheet" href="/x.css"></head></html>'
    assert discover_feeds(html, "https://diario.test/") == ["https://diario.test/rss/portada"]


def test_strip_ns():
    root = ET.fromstring('<a xmlns="http://opendata.camara.cl/v1"><b>1</b></a>')
    assert strip_ns(root).find("b") is not None


def test_relevance_languages_and_whole_words():
    r = relevance("China invertirá en litio en Salta")
    assert r.minerals == ["lithium"] and r.mentions_cn and not r.mentions_us and is_relevant(r, "news", "")
    assert relevance("Proyecto que modifica el Código de Minería").mining
    assert relevance("Mineracao: CFEM sobe").mining  # accent-insensitive
    assert relevance("Goudwinning in Suriname").mining
    assert relevance("EUA e Brasil assinam acordo de terras raras").mentions_us
    for neg in ["Free trade", "El Oro province festival", "Mina Clavero recibe turistas", "Chinandega celebra"]:
        r = relevance(neg)
        assert not (r.minerals or r.mining or r.mentions_cn or r.mentions_us), neg


def test_is_relevant_modes():
    assert is_relevant(relevance("Estados Unidos y el acuerdo de inversiones"), "parliament", "Estados Unidos y el acuerdo de inversiones")
    assert not is_relevant(relevance("Estados Unidos y el fútbol"), "parliament", "Estados Unidos y el fútbol")
    assert not is_relevant(relevance("Minería: nuevo reglamento"), "news", "")  # news needs an actor or a tracked mineral
    assert is_relevant(relevance("Minería: China firma"), "news", "")


def test_robots_cache(monkeypatch):
    class Resp:
        def __init__(self, status, text):
            self.status_code, self.text = status, text

    class Sess:
        def get(self, url, **kw):
            if "blocked.test" in url:
                return Resp(200, "User-agent: *\nDisallow: /private/\nCrawl-delay: 7\n")
            raise OSError("down")

    import requests

    monkeypatch.setattr(requests, "RequestException", OSError)
    rc = RobotsCache(session=Sess())
    assert rc.allowed("https://blocked.test/public/a") and not rc.allowed("https://blocked.test/private/b")
    assert rc.crawl_delay("https://blocked.test/x") == 7.0
    assert rc.allowed("https://down.test/anything") and rc.unreachable


def test_trim_xml_keeps_first_children(tmp_path):
    src = tmp_path / "f.xml"
    src.write_bytes(b"<rss><channel>" + b"".join(f"<item><title>{i}</title></item>".encode() for i in range(100)) + b"</channel></rss>")
    _trim_xml(src, tmp_path / "out.xml")
    assert len(ET.parse(tmp_path / "out.xml").getroot().findall("./channel/item")) == 60
    src.write_bytes(b"<rss><item>broken & unclosed")
    _trim_xml(src, tmp_path / "out2.xml")
    assert "broken" in (tmp_path / "out2.xml").read_text()


def test_incremental_load_merges_on_key(tmp_path, snap_factory):
    from scm.ingest.press import RSSPress

    cls = type("RSS_test", (RSSPress,), {"source_id": "bra_folha"})
    feed1 = '<rss><channel><item><title>China compra nióbio</title><link>https://a.test/1</link><pubDate>Wed, 01 Oct 2026 10:00:00 GMT</pubDate></item></channel></rss>'
    feed2 = '<rss><channel><item><title>China compra nióbio</title><link>https://a.test/1?utm_source=x</link><pubDate>Thu, 02 Oct 2026 10:00:00 GMT</pubDate></item><item><title>Litio: EUA investem</title><link>https://a.test/2</link></item></channel></rss>'
    a = cls()
    snap = snap_factory("bra_folha", {"feed_0.xml": feed1})
    rows = a.load(a.parse(snap), out_dir=tmp_path)
    assert rows["document"] == 1
    snap2 = snap_factory("bra_folha_2", {"feed_0.xml": feed2})
    snap2.source_id = "bra_folha"
    rows = a.load(a.parse(snap2), out_dir=tmp_path)
    stored = pd.read_parquet(tmp_path / "document" / "bra_folha.parquet")
    assert rows["document"] == 2 and rows["document_new"] == 1
    assert stored.sort_values("date").iloc[0]["date"] == "2026-10-01"  # first-seen row kept
    schema.validate("document", stored)
