"""Press adapters (RSS) and national statistics adapters on synthetic fixtures."""
from __future__ import annotations

import pytest

from scm import schema
from scm.ingest.keywords import countries_mentioned
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
    assert len(out["media_volume"]) == 1 and (docs["country"] == "BRA").all()  # a national outlet: one country, one volume row per feed
    vol = out["media_volume"].iloc[0]
    assert vol["items_total"] == 4 and vol["items_mining"] == 3 and vol["items_cn"] == 1 and vol["items_us"] == 1
    assert set(docs.columns) >= {"outlet_source_id", "venue"} and docs.iloc[0]["venue"].startswith("Folha")


REGIONAL_FEED = ('<?xml version="1.0"?><rss><channel>'
                 '<item><title>China y Argentina firman acuerdo sobre litio</title><link>http://spanish.xinhuanet.com/a.htm</link><pubDate>Thu, 01 Oct 2026 08:00:00 +0800</pubDate></item>'
                 '<item><title>Inversión china en el cobre de Chile y Perú crece</title><link>http://spanish.xinhuanet.com/b.htm</link><pubDate>Thu, 01 Oct 2026 09:00:00 +0800</pubDate></item>'
                 '<item><title>China amplía cooperación minera con América Latina</title><link>http://spanish.xinhuanet.com/c.htm</link></item>'
                 '<item><title>Xi Jinping recibe al presidente de Bolivia</title><link>http://spanish.xinhuanet.com/d.htm</link></item>'
                 '</channel></rss>')


def test_countries_mentioned_names_and_demonyms_with_accents_folded():
    assert countries_mentioned("China y Argentina firman acuerdo sobre litio") == ["ARG"]
    assert countries_mentioned("Inversión china en el cobre de Chile y Perú") == ["CHL", "PER"]  # registry order, accent folded
    assert countries_mentioned("Brasil e Peru ampliam exportações") == ["BRA", "PER"]
    assert countries_mentioned("Brazilian niobium and Guyanese gold draw US interest") == ["BRA", "GUY"]  # English demonyms
    assert countries_mentioned("Litio boliviano y cobre chileno") == ["BOL", "CHL"]
    assert countries_mentioned("Mineração no Equador e no Paraguai; o garimpo brasileiro") == ["BRA", "ECU", "PRY"]  # Portuguese forms
    assert countries_mentioned("El canciller surinamés y el uruguayo") == ["SUR", "URY"]
    assert countries_mentioned("Empresas ecuatorianas, colombianas y venezolanas") == ["COL", "ECU", "VEN"]
    assert countries_mentioned("Guianense recebe delegação") == ["GUY"]
    assert countries_mentioned("Guiana Francesa lança foguete; French Guiana launch") == []  # not Guyana
    assert countries_mentioned("China amplía cooperación minera con América Latina") == []
    assert countries_mentioned("ARGENTINAS: las empresas") == ["ARG"] and countries_mentioned("") == [] and countries_mentioned(None) == []


def test_regional_feed_files_each_headline_under_the_countries_it_names(snap_factory):
    cls = type("RSS_xinhua_es", (RSSPress,), {"source_id": "xinhua_es"})
    snap = snap_factory("xinhua_es", {"feed_0.xml": REGIONAL_FEED})
    out = cls().parse(snap)
    for k, v in out.items():
        assert len(schema.validate(k, v.copy())) == len(v)
    docs = out["document"]
    # one row per (headline, country): CHL and PER share a headline and a URL but get distinct doc ids
    assert sorted(docs["country"]) == ["ARG", "CHL", "PER"] and docs["doc_id"].is_unique
    assert set(docs[docs["country"] != "ARG"]["title_original"]) == {"Inversión china en el cobre de Chile y Perú crece"}
    assert (docs["source_id"] == "xinhua_es").all() and (docs["reliability"] == "state_media").all() and (docs["outlet_source_id"] == "xinhua_es").all()
    # a mining headline naming no country is dropped; a presidential visit naming Bolivia is not relevant
    assert "China amplía cooperación minera con América Latina" not in set(docs["title_original"]) and "BOL" not in set(docs["country"])
    vol = out["media_volume"].set_index("country")
    assert len(vol) == 12 and (vol["items_total"] == 4).all()  # one row per registered country, items_total = the feed's size
    assert vol.loc["ARG", "items_mining"] == 1 and vol.loc["CHL", "items_mining"] == 1 and vol.loc["PER", "items_mining"] == 1
    assert vol.loc["ARG", "items_cn"] == 1 and vol.loc["BOL", "items_cn"] == 1 and vol.loc["BOL", "items_mining"] == 0  # Bolivia: named, not mining
    assert vol.loc["URY", "items_mining"] == 0 and vol.loc["URY", "items_cn"] == 0 and vol.loc["URY", "items_us"] == 0
    assert vol["items_mining"].sum() == 3 < 4  # the headline naming no country counts in the feed's size only


def test_declared_rss_index_page_is_harvested_even_when_it_ends_in_html(snap_factory, monkeypatch):
    cls = type("RSS_xinhua_es", (RSSPress,), {"source_id": "xinhua_es"})
    ad = cls()
    index_url = ad.src.api_url
    assert index_url.endswith(".html") and _looks_like_feed_url(index_url)
    feed_url = "http://spanish.xinhuanet.com/rss/iberoamerica.xml"
    snap = snap_factory("xinhua_es", {})

    def fake_get(url, name, params=None, **kw):
        p = snap.path(name)
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text('<html><body><a href="/rss/iberoamerica.xml">Iberoamérica</a></body></html>' if url == index_url else REGIONAL_FEED, encoding="utf-8")
        snap.record(name, url, status=200)
        return p

    monkeypatch.setattr(snap, "get", fake_get)
    assert ad._try_feed(snap, index_url, 0) == 1
    assert snap.has("feed_0.xml") and snap.files["feed_0.xml"]["url"] == feed_url
    assert snap.manifest["index_pages"][0] == {"url": index_url, "links": [feed_url]} and snap.manifest["feed_urls"] == [feed_url]


def _fake_get(snap, pages: dict[str, object], calls: list[str] | None = None):
    """A snap.get stand-in: `pages` maps a URL to its body (str), an Exception instance to raise, or a (body, final_url)
    pair recorded as a redirect; any other URL answers HTTP 404 as a FetchError."""
    from scm.http import FetchError

    def get(url, name, params=None, **kw):
        if calls is not None:
            calls.append(url)
        answer = pages.get(url)
        if isinstance(answer, Exception):
            raise answer
        if answer is None:
            raise FetchError(f"{snap.source_id}: HTTP 404 on GET {url}")
        body, final = answer if isinstance(answer, tuple) else (answer, None)
        p = snap.path(name)
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(body, encoding="utf-8")
        snap.record(name, url, status=200, final_url=final)
        return p

    return get


def test_connection_error_on_one_candidate_does_not_abort_discovery(snap_factory, monkeypatch):
    """sources-2: Emol's run died on one reset connection before the common paths were tried."""
    import requests

    cls = type("RSS_chl_elmercurio", (RSSPress,), {"source_id": "chl_elmercurio"})
    ad = cls()
    assert ad.src.api_url is None
    snap = snap_factory("chl_elmercurio", {})
    home = '<html><head><link rel="alternate" type="application/rss+xml" href="http://www.emol.com/todas/"></head></html>'
    calls: list[str] = []
    monkeypatch.setattr(snap, "get", _fake_get(snap, {
        ad.src.url: home,
        "http://www.emol.com/todas/": requests.exceptions.ConnectionError("HTTPConnectionPool(host='www.emol.com', port=80): Connection reset by peer"),
        ad.src.url + "/rss": FEED.replace("folha.uol.com.br", "emol.com"),
    }, calls))
    ad.fetch(snap)
    assert snap.manifest["feeds_found"] == 1 and snap.manifest["feed_urls"] == [ad.src.url + "/rss"]
    assert snap.manifest["feeds_tried"] == ["http://www.emol.com/todas/", ad.src.url + "/rss"]  # the declared link first, then the common paths
    errors = [e for e in snap.manifest["errors"] if e["name"] == "http://www.emol.com/todas/"]
    assert len(errors) == 1 and "Connection reset" in errors[0]["error"]


class _ForbidAll:
    """A robots cache that forbids every URL (De Ware Tijd's robots.txt)."""

    def allowed(self, url):
        return False

    def crawl_delay(self, url):
        return None


def test_outlet_forbidden_everywhere_by_robots_is_skipped_not_failed(snap_factory, monkeypatch, tmp_path):
    """sources-3: when the home page and every candidate are robots-blocked, fetch raises RobotsDisallowed and the run
    record says skipped (base.py), instead of a RuntimeError recorded as failed."""
    from scm.http import RobotsDisallowed

    cls = type("RSS_x", (RSSPress,), {"source_id": "sur_starnieuws"})  # any single-country outlet without api_url
    ad = cls()
    snap = snap_factory("sur_starnieuws", {})
    snap.robots = _ForbidAll()
    snap.min_interval = 0
    with pytest.raises(RobotsDisallowed, match="every feed URL tried"):
        ad.fetch(snap)
    assert snap.manifest["feeds_found"] == 0 and len(snap.manifest["robots_blocked"]) == 1 + len(snap.manifest["feeds_tried"])
    # end to end: Adapter.run records the honest status
    snap2 = snap_factory("sur_starnieuws_run", {})
    snap2.robots = _ForbidAll()
    snap2.min_interval = 0
    monkeypatch.setattr(cls, "snapshot", lambda self, base: snap2)
    rec = ad.run(raw_base=tmp_path / "raw", out_dir=tmp_path / "wh")
    assert rec["status"] == "skipped" and rec["error"].startswith("robots.txt disallows")


def test_several_feeds_make_one_media_volume_row_counting_distinct_items(snap_factory):
    """sources-5: an outlet declaring several feeds produced one media_volume row per feed with the same key; the
    warehouse kept the first (El Espectador: items_total 0 although 30 headlines were read)."""
    cls = type("RSS_col_elespectador", (RSSPress,), {"source_id": "col_elespectador"})
    feed_a = ('<?xml version="1.0"?><rss><channel><title>EL ESPECTADOR</title>'
              '<item><title>China compra cobre colombiano</title><link>https://www.elespectador.com/economia/a?utm_source=rss</link></item>'
              '<item><title>Clima en Bogotá</title><link>https://www.elespectador.com/bogota/b</link></item>'
              '</channel></rss>')
    feed_b = ('<?xml version="1.0"?><rss><channel><title>El Espectador - Discover</title>'
              '<item><title>China compra cobre colombiano</title><link>https://www.elespectador.com/economia/a</link></item>'
              '<item><title>EE. UU. y el litio</title><link>https://www.elespectador.com/mundo/c</link></item>'
              '<item><title>Fútbol: resultados</title><link>https://www.elespectador.com/deportes/d</link></item>'
              '</channel></rss>')
    snap = snap_factory("col_elespectador", {"feed_0.xml": feed_a, "feed_1.xml": feed_b})
    snap.manifest["feed_urls"] = ["https://www.elespectador.com/feed/", "https://www.elespectador.com/arc/outboundfeeds/discover/"]
    out = cls().parse(snap)
    vol = out["media_volume"]
    assert len(vol) == 1  # one row per outlet, country and run, not per feed
    row = vol.iloc[0]
    assert row["items_total"] == 4 and row["items_cn"] == 1 and row["items_us"] == 1  # the shared item counted once (URL normalised)
    assert row["source_record_url"] == "https://www.elespectador.com/feed/"
    assert len(out["document"]) == 2 and out["document"]["doc_id"].is_unique
    # the warehouse merge then holds exactly one row for the key
    assert len(vol.drop_duplicates(subset=schema.KEY_COLUMNS["media_volume"])) == 1


def test_comment_feeds_are_never_harvested(snap_factory, monkeypatch):
    """sources-6: WordPress declares /comments/feed/ next to /feed/; reader comments (and their spam) must not count."""
    from scm.ingest.feeds import discover_feeds
    from scm.ingest.press import _declared_feed_ok, _is_comment_feed_url

    head = ('<html><head>'
            '<link rel="alternate" type="application/rss+xml" title="IDL &raquo; Feed" href="https://www.idl-reporteros.pe/feed/" />'
            '<link rel="alternate" type="application/rss+xml" title="IDL &raquo; Feed de los comentarios" href="https://www.idl-reporteros.pe/comments/feed/" />'
            '</head></html>')
    site = "https://www.idl-reporteros.pe"
    declared = [u for u in discover_feeds(head, site) if _declared_feed_ok(u, site)]
    assert declared == ["https://www.idl-reporteros.pe/feed/"]
    assert _is_comment_feed_url("https://x.test/comment/feed") and _is_comment_feed_url("https://x.test/?feed=comments-rss2")  # WordPress query form
    assert _is_comment_feed_url("https://x.test/?feed=comments") and not _is_comment_feed_url("https://x.test/feed/")
    # a feed reached by any path whose channel title says it is comments is discarded
    cls = type("RSS_per_idl_reporteros", (RSSPress,), {"source_id": "per_idl_reporteros"})
    ad = cls()
    snap = snap_factory("per_idl_reporteros", {})
    comments = ('<?xml version="1.0"?><rss><channel><title>\n\tComentarios en IDL\t</title>'
                '<item><title>Comentario en El shock sanitario por binance register</title><link>https://www.idl-reporteros.pe/x/#comment-1</link></item></channel></rss>')
    monkeypatch.setattr(snap, "get", _fake_get(snap, {"https://www.idl-reporteros.pe/other.xml": comments, "https://www.idl-reporteros.pe/comments/feed/": comments}))
    assert ad._try_feed(snap, "https://www.idl-reporteros.pe/other.xml", 0) == 0 and not snap.has("feed_0.xml")
    assert ad._try_feed(snap, "https://www.idl-reporteros.pe/comments/feed/", 0) == 0 and not snap.has("feed_0.xml")
    assert "feed_urls" not in snap.manifest and any("reader-comments" in e["error"] for e in snap.manifest["errors"])


def test_geo_redirected_home_page_declares_no_feeds(snap_factory, monkeypatch):
    """sources-7: Infobae's home page is geo-redirected to /estados-unidos/ from a US runner; the feed declared there is
    the US-edition category feed and must not be read as Argentine news; the common paths are tried instead."""
    cls = type("RSS_arg_infobae", (RSSPress,), {"source_id": "arg_infobae"})
    ad = cls()
    api = ad.src.api_url
    home = '<html><head><link rel="alternate" type="application/rss+xml" href="https://www.infobae.com/arc/outboundfeeds/rss/category/estados-unidos/"></head></html>'
    general = FEED.replace("folha.uol.com.br", "infobae.com")
    snap = snap_factory("arg_infobae", {})
    calls: list[str] = []
    monkeypatch.setattr(snap, "get", _fake_get(snap, {
        ad.src.url: (home, "https://www.infobae.com/estados-unidos/"),
        "https://www.infobae.com/arc/outboundfeeds/rss/category/estados-unidos/": general,
        "https://www.infobae.com/rss": general,  # the first common path answers
    }, calls))
    ad.fetch(snap)
    assert snap.manifest["home_redirected"] == "https://www.infobae.com/estados-unidos/"
    assert snap.manifest["feeds_declared_on_redirect"] == ["https://www.infobae.com/arc/outboundfeeds/rss/category/estados-unidos/"]
    assert snap.manifest["discovered_feeds"] == [] and "category/estados-unidos" not in " ".join(calls)
    assert snap.manifest["feed_urls"] == ["https://www.infobae.com/rss"] and calls[0] == api  # the registry feed is tried first (404 here)
    # a redirect that only adds an index file or a trailing slash is not a section
    from scm.ingest.press import _redirected_to_section
    assert not _redirected_to_section("http://spanish.xinhuanet.com", "http://spanish.xinhuanet.com/index.htm")
    assert not _redirected_to_section("https://www.site.test", "https://www.site.test/") and not _redirected_to_section("https://www.site.test", None)
    assert _redirected_to_section("https://www.cronista.com", "https://www.cronista.com/usa/")


def test_index_page_harvest_prefers_news_sections_and_reads_several(snap_factory, monkeypatch):
    """sources-8: El Tiempo's RSS index lists the Opinión feeds first; the harvest read the first link only."""
    cls = type("RSS_col_eltiempo", (RSSPress,), {"source_id": "col_eltiempo"})
    ad = cls()
    index = ('<html><body><a href="/rss/opinion.xml">Opinión</a><a href="/rss/opinion_editorial.xml">Editorial</a>'
             '<a href="/rss/colombia.xml">Colombia</a><a href="/rss/comments/feed/">x</a><a href="/rss/mundo.xml">Mundo</a>'
             '<a href="/rss/bogota.xml">Bogotá</a></body></html>')
    feed = lambda t: f'<?xml version="1.0"?><rss><channel><title>{t}</title><item><title>{t}: nota</title><link>https://www.eltiempo.com/{t}/1</link></item></channel></rss>'  # noqa: E731
    snap = snap_factory("col_eltiempo", {})
    pages = {"https://www.eltiempo.com/rss": index, **{f"https://www.eltiempo.com/rss/{s}.xml": feed(s) for s in ("opinion", "opinion_editorial", "colombia", "mundo", "bogota")}}
    monkeypatch.setattr(snap, "get", _fake_get(snap, pages))
    assert ad._try_feed(snap, "https://www.eltiempo.com/rss", 0) == 3
    assert snap.manifest["feed_urls"] == [f"https://www.eltiempo.com/rss/{s}.xml" for s in ("colombia", "mundo", "bogota")]  # news first, opinion last, comments never
    assert "https://www.eltiempo.com/rss/comments/feed/" not in snap.manifest["index_pages"][0]["links"]
    assert all(snap.has(f"feed_{i}.xml") for i in range(3)) and not snap.has("feed_3.xml")


def test_bcrp_falls_back_to_the_committed_series_when_metadata_is_a_challenge_page(snap_factory, monkeypatch):
    """sources-1: the metadata endpoint answers an Incapsula page; the adapter must not fail on it."""
    import json
    from pathlib import Path

    from scm.ingest.national_per import API, BCRP, METADATA, SERIES_FALLBACK, fallback_series

    challenge = (Path(__file__).parent / "fixtures" / "per_bcrp_api" / "metadata.csv").read_text(encoding="utf-8")
    assert "_Incapsula_Resource" in challenge and SERIES_FALLBACK.exists()
    fallback = fallback_series()
    assert len(fallback) == 60 and fallback[0][0] == "PM05146AA"
    snap = snap_factory("per_bcrp_api", {})
    asked: list[str] = []

    def fake_get(url, name, params=None, **kw):
        asked.append(url)
        p = snap.path(name)
        if url == METADATA:
            p.write_text(challenge, encoding="utf-8")
        else:
            codes = url.split(f"{API}/", 1)[1].split("/json/")[0].split("-")
            p.write_text(json.dumps({"config": {"series": [{"name": f"Producción minera - Cobre {c} (miles de toneladas)"} for c in codes]},
                                     "periods": [{"name": "2024", "values": ["1" for _ in codes]}]}), encoding="utf-8")
        snap.record(name, url, status=200)
        return p

    monkeypatch.setattr(snap, "get", fake_get)
    a = BCRP()
    a.fetch(snap)
    assert snap.manifest["series_source"] == "fallback" and [tuple(c) for c in snap.manifest["series_selected"]] == fallback
    assert not snap.has("metadata.csv") and any("Incapsula" in e["error"] for e in snap.manifest["errors"])
    assert asked[0] == METADATA and len(asked) == 1 + 6 and all(u.startswith(API + "/") for u in asked[1:])  # 60 codes, ten per request
    df = schema.validate("production", a.parse(snap)["production"].copy())
    assert len(df) == 60 and (df["mineral"] == "copper").all()
    # and the raw selection on the challenge page no longer raises
    snap2 = snap_factory("per_bcrp_api_2", {"metadata.csv": challenge})
    assert a._select_codes(snap2) == []
    # a 403 on the metadata endpoint falls back the same way
    from scm.http import FetchError
    snap3 = snap_factory("per_bcrp_api_3", {})

    def refused(url, name, params=None, **kw):
        if url == METADATA:
            raise FetchError("per_bcrp_api: HTTP 403 on GET " + url)
        return fake_get(url, name, params, **kw)

    monkeypatch.setattr(snap3, "get", refused)
    a.fetch(snap3)
    assert snap3.manifest["series_source"] == "fallback" and len(snap3.manifest["series_selected"]) == 60


def test_bcrp_without_a_fallback_file_names_the_challenge(snap_factory, monkeypatch):
    from pathlib import Path

    from scm.http import FetchError
    from scm.ingest import national_per

    monkeypatch.setattr(national_per, "SERIES_FALLBACK", Path("/nonexistent/bcrp_series.json"))
    snap = snap_factory("per_bcrp_api", {})
    monkeypatch.setattr(snap, "get", _fake_get(snap, {national_per.METADATA: "<!DOCTYPE html><html><body>challenge</body></html>"}))
    with pytest.raises(FetchError, match="Incapsula challenge"):
        national_per.BCRP().fetch(snap)


def test_declared_feed_may_live_on_a_syndication_host():
    from scm.ingest.press import _declared_feed_ok, _same_site

    site = "https://www.biobiochile.cl"
    assert _declared_feed_ok("https://feeds.feedburner.com/radiobiobio/NNeJ", site)  # declared in the page head
    assert _declared_feed_ok("https://www.biobiochile.cl/rss/portada", site)
    assert not _declared_feed_ok("https://es.wikipedia.org/w/index.php?feed=atom", site)
    assert not _same_site("https://feeds.feedburner.com/radiobiobio/NNeJ", site)  # anchors stay same-site only


def test_rss_adapters_come_from_registry():
    ids = [a.source_id for a in make_rss_adapters()]
    assert "bra_folha" in ids and "arg_clarin" in ids and len(ids) >= 20
    # the regional outlets: Chinese state media and the US official press rooms, each registered with the twelve countries
    regional = {"xinhua_es", "peoples_daily_es", "cgtn_es", "us_state_press", "us_treasury_press", "ustr_press", "dfc_press"}
    assert regional <= set(ids)
    from scm.registry import IN_SCOPE, sources
    assert all(list(sources()[sid].countries) == IN_SCOPE for sid in regional)
    assert all(sources()[sid].reliability == "official" for sid in regional if sid.startswith(("us_", "ustr", "dfc")))
    assert all(sources()[sid].reliability == "state_media" for sid in ("xinhua_es", "peoples_daily_es", "cgtn_es"))
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


def test_ecuador_cadastre_arcgis(snap_factory):
    from scm.ingest.national_ecu import ECUCadastre

    page = {"features": [{"attributes": {"OBJECTID": 1, "codigo": "500123", "nombre": "LA ESPERANZA", "titular": "EXPLORCOBRES S.A.", "mineral": "METALICO - COBRE", "estado": "INSCRITA",
                                          "fecha_otorgamiento": 1420070400000, "hectareas": "4998.5"}}]}
    out = ECUCadastre().parse(snap_factory("ecu_cadastre", {"page_0.json": page}))
    df = schema.validate("concession", out["concession"].copy())
    c = df.iloc[0]
    assert c["native_id"] == "500123" and c["mineral"] == "copper" and c["granted_date"] == "2015-01-01" and c["area_ha"] == 4998.5 and c["holder"] == "EXPLORCOBRES S.A."


def test_bcrp_series_selection_and_parse(snap_factory):
    from scm.ingest.national_per import BCRP

    meta = ("Código de serie,Grupo de serie,Nombre de serie,Frecuencia\n"
            "PM05267AA,Producción minera metálica (miles de TMF),Cobre,Anual\n"
            "PM05268AA,Producción minera metálica (miles de TMF),Oro (miles de onzas troy),Anual\n"
            "PN01234MM,Producción minera metálica,Cobre,Mensual\n"
            "PM00001AA,PBI por sectores,Agropecuario,Anual\n")
    payload = {"config": {"title": "x", "series": [{"name": "Producción minera metálica - Cobre (miles de TMF)", "dec": "0"}, {"name": "Producción minera metálica - Oro (miles de onzas troy)", "dec": "0"}]},
               "periods": [{"name": "2023", "values": ["2,754", "3,300"]}, {"name": "2024", "values": ["2,736", "n.d."]}]}
    snap = snap_factory("per_bcrp_api", {"metadata.csv": meta, "series_0.json": payload})
    a = BCRP()
    assert [c for c, _ in a._select_codes(snap)] == ["PM05267AA", "PM05268AA"]
    df = schema.validate("production", a.parse(snap)["production"].copy())
    assert len(df) == 3 and df[(df["mineral"] == "copper") & (df["year"] == 2023)].iloc[0]["qty"] == 2754 and set(df["mineral"]) == {"copper", "gold"}


def test_cochilco_sheet_heuristics(snap_factory, tmp_path):
    from scm.ingest.national_chl import Cochilco

    def write(path):
        import pandas as pd

        with pd.ExcelWriter(path) as w:
            pd.DataFrame([["Producción Mundial de Cobre de Mina por País (miles de toneladas métricas de cobre fino)", None, None, None],
                          [None, None, None, None], ["País", "2022", "2023", "2024"], ["Chile", "5331", "5252", "5510"], ["Perú", "2439", "2754", "2736"]]).to_excel(w, sheet_name="Prod Mina Mundo", header=False, index=False)
            pd.DataFrame([["Precio del cobre"], ["2022", "3.99"]]).to_excel(w, sheet_name="Precios", header=False, index=False)
    out = Cochilco().parse(snap_factory("chl_cochilco", {"anuario_0.xlsx": write}))
    df = schema.validate("production", out["production"].copy())
    assert len(df) == 3 and set(df["year"]) == {2022, 2023, 2024} and (df["mineral"] == "copper").all() and df[df["year"] == 2024].iloc[0]["qty"] == 5510
    assert "Chile" in df.iloc[0]["note"]


def test_gdelt_diagnostics_are_recorded_and_not_kept(snap_factory, monkeypatch):
    import json
    from datetime import date

    from scm.ingest.gdelt import DIAGNOSTIC_QUERIES, GDELTDoc

    snap = snap_factory("gdelt", {})
    seen = []

    def fake_get(url, name, params=None, **kw):
        seen.append(params["query"])
        p = snap.path(name)
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(json.dumps({"articles": [{"url": "https://x"}]}) if "spanish" in params["query"] else "{}")
        snap.files[name] = {"url": url}
        return p

    monkeypatch.setattr(snap, "get", fake_get)
    GDELTDoc()._diagnostics(snap, date(2026, 10, 3))
    d = snap.manifest["diagnostics"]
    assert len(d) == len(DIAGNOSTIC_QUERIES) == len(seen)
    assert d["es_english_term"].startswith("1 articles") and d["pt_english_term"].startswith("0 articles (2 bytes)")
    assert not any(n.startswith("diagnostics/") for n in snap.files) and not snap.path("diagnostics/es_english_term.json").exists()
    assert "errors" not in snap.manifest or not snap.manifest["errors"]


def test_gdelt_plan_windows_newest_first_round_robin_with_ledger_rules():
    from datetime import date

    import pandas as pd

    from scm.ingest.gdelt import MAX_RECORDS, plan_windows

    today = date(2026, 10, 9)
    prev = pd.DataFrame([
        # Spanish-term era (empty answer): planned again
        {"country": "ARG", "period": "2025-01-01", "items_total": 0, "source_record_url": "https://api.gdeltproject.org/api/v2/doc/doc?query=litio+China"},
        # current terms, genuinely empty: done
        {"country": "BRA", "period": "2025-01-01", "items_total": 0, "source_record_url": "https://api.gdeltproject.org/api/v2/doc/doc?query=lithium+China"},
        # current terms, capped: split into two halves
        {"country": "BRA", "period": "2024-12-16", "items_total": MAX_RECORDS, "source_record_url": "https://api.gdeltproject.org/api/v2/doc/doc?query=lithium+China"},
    ])
    plan, left = plan_windows(prev, today, budget=6, only=["ARG", "BRA"])
    recent = [w for w in plan if w[3]]
    hist = [w for w in plan if not w[3]]
    assert recent and all(w[2] >= today - pd.Timedelta(days=35).to_pytimedelta() for w in recent)
    # round-robin: ARG, BRA, ARG, BRA …; newest first
    assert [w[0] for w in hist[:4]] == ["ARG", "BRA", "ARG", "BRA"]
    assert hist[0][1] > hist[2][1]
    starts = {(w[0], w[1].isoformat()) for w in hist}
    all_plan, _ = plan_windows(prev, today, budget=10_000, only=["ARG", "BRA"])
    all_hist = {(w[0], w[1].isoformat(), w[2].isoformat()) for w in all_plan if not w[3]}
    assert ("ARG", "2025-01-01", "2025-01-15") in all_hist  # Spanish-era window comes back
    assert not any(k[:2] == ("BRA", "2025-01-01") for k in all_hist)  # empty with the current terms stays done
    assert ("BRA", "2024-12-24", "2024-12-31") in all_hist and ("BRA", "2024-12-16", "2024-12-23") in all_hist  # the capped window is split
    assert left > 0 and len(starts) == len(hist)


def test_gdelt_plan_windows_backlog_first_puts_the_history_before_the_recent_windows():
    from datetime import date

    from scm.ingest.gdelt import plan_windows

    today = date(2026, 10, 9)
    default, left = plan_windows(None, today, budget=6, only=["ARG", "BRA"])
    first, left2 = plan_windows(None, today, budget=6, only=["ARG", "BRA"], backlog_first=True)
    assert left == left2 and sorted(default) == sorted(first) and default != first
    assert default[0][3] is True and first[0][3] is False  # recent first by default, history first on request
    assert [w for w in first if not w[3]] == [w for w in default if not w[3]]  # the history keeps its order
    assert first[-1][3] is True


def test_gdelt_total_throttle_cap_stops_the_run_without_a_pause(snap_factory, monkeypatch):
    import time

    from scm.ingest.gdelt import GDELTDoc

    snap = snap_factory("gdelt", {})
    snap.manifest["errors"] = []
    snap.manifest["throttled"] = GDELTDoc.MAX_THROTTLES_TOTAL - 1

    def throttled(*a, **k):
        raise RuntimeError("gdelt: HTTP 429 on GET …")

    monkeypatch.setattr(snap, "get", throttled)
    slept = []
    monkeypatch.setattr(time, "sleep", lambda s: slept.append(s))
    ad = GDELTDoc()
    ad._deadline = time.monotonic() + 10_000
    assert ad._get_window(snap, "ARG/2025-01-01_es.json", {"query": "x"}) is False
    assert slept == [] and snap.manifest["throttled"] == GDELTDoc.MAX_THROTTLES_TOTAL and snap.manifest["errors"]
    # the run itself stops before asking for another window
    monkeypatch.setenv("GDELT_BACKFILL_WINDOWS", "5")
    monkeypatch.setattr(GDELTDoc, "previous_table", lambda self, table: None)
    monkeypatch.setattr(GDELTDoc, "_diagnostics", lambda self, snap, today: None)
    asked = []
    monkeypatch.setattr(snap, "get", lambda *a, **k: asked.append(a))
    ad.fetch(snap)
    assert asked == [] and snap.manifest["stopped"].startswith(f"{GDELTDoc.MAX_THROTTLES_TOTAL} throttle responses")


def test_gdelt_session_does_not_retry_429_by_itself():
    from scm.http import make_session
    from scm.ingest.gdelt import GDELTDoc

    assert 429 not in GDELTDoc.retry_statuses
    s = make_session(retry_statuses=GDELTDoc.retry_statuses)
    assert set(s.get_adapter("https://").max_retries.status_forcelist) == {500, 502, 503, 504}


def test_gdelt_throttle_pause_respects_the_deadline(snap_factory, monkeypatch):
    import time

    from scm.ingest.gdelt import GDELTDoc

    snap = snap_factory("gdelt", {})
    snap.manifest["errors"] = []

    def throttled(*a, **k):
        raise RuntimeError("gdelt: HTTP 429 on GET …")

    monkeypatch.setattr(snap, "get", throttled)
    slept = []
    monkeypatch.setattr(time, "sleep", lambda s: slept.append(s))
    ad = GDELTDoc()
    ad._deadline = time.monotonic() + 1  # no room for a 45 s pause
    assert ad._get_window(snap, "ARG/2025-01-01_es.json", {"query": "x"}) is False
    assert slept == [] and snap.manifest["stopped"].startswith("time budget exhausted") and snap.manifest["throttled"] == 1
