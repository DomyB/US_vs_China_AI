"""National press: one RSS adapter per registry outlet -> document (doc_type news) and media_volume.

Only headline, date, outlet and URL are stored (brief section 4). Feeds expose the most recent
items, so these adapters are incremental and run weekly; history comes from GDELT and Media Cloud.

An outlet registered with one country (a national daily) has every headline filed under that country. An
outlet registered with several (Xinhua's Spanish service, a US department's press room) covers the whole
region: a headline is filed under each country it names (`countries_mentioned`) and dropped when it names none.

Discovery: the registry `api_url` when it looks like a feed, else the feeds the home page declares, then the
common feed paths. One unreachable candidate is recorded and skipped; a reader-comments feed is never read; a
home page that was geo-redirected to a section (Infobae's US edition from a US runner) declares that section's
feeds, so they are ignored; an outlet whose every URL robots.txt forbids is an honest "skipped", not a failure.
"""
from __future__ import annotations

import re
from urllib.parse import urlsplit

import pandas as pd
import requests

from ..http import FetchError, RobotsDisallowed, Snapshot
from ..registry import sources
from .base import Adapter
from .docs import DOCUMENT_COLUMNS, MEDIA_VOLUME_COLUMNS, make_document
from .feeds import FEED_CANDIDATES, discover_feeds, normalize_url, parse_feed, today_iso
from .keywords import countries_mentioned, is_relevant, relevance

MAX_FEEDS = 3

# WordPress (and similar platforms) declare a reader-comments feed next to the article feed; it is never an outlet feed.
_COMMENT_FEED_PATH = re.compile(r"/comments?/feed/?$", re.I)
_COMMENT_FEED_QUERY = re.compile(r"(^|&)feed=comments", re.I)
_COMMENT_FEED_TITLE = re.compile(r"^\s*(comentarios\b|comments on\b|coment[aá]rios\b|kommentare\b)", re.I)
# Section feeds an RSS index page lists that are read after the news sections (opinion columns are not the outlet's news).
_OPINION_FEED_URL = re.compile(r"opini[oó]n|editorial|columnist", re.I)
_INDEX_FILE = re.compile(r"/(index|home|default)\.[a-z]+$", re.I)


def _same_site(url: str, site: str) -> bool:
    """Same registered domain (feeds.folha.uol.com.br belongs to folha.uol.com.br; wikipedia.org does not)."""
    def key(u):
        host = urlsplit(u).netloc.lower().split(":")[0]
        parts = host.split(".")
        return ".".join(parts[-3:]) if len(parts) >= 3 and parts[-2] in ("com", "co", "org", "net", "gob", "gov") else ".".join(parts[-2:])
    try:
        return key(url) == key(site) or urlsplit(url).netloc.lower().endswith("." + urlsplit(site).netloc.lower().removeprefix("www."))
    except Exception:  # noqa: BLE001
        return False


# Syndication hosts a publisher may declare in its page head (<link rel="alternate">); anchors never qualify.
SYNDICATION_HOSTS = ("feedburner.com", "feedpress.me", "feedblitz.com")


def _is_comment_feed_url(url: str) -> bool:
    """A reader-comments feed by its URL (/comments/feed/, ?feed=comments)."""
    parts = urlsplit(url)
    return bool(_COMMENT_FEED_PATH.search(parts.path) or _COMMENT_FEED_QUERY.search(parts.query))


def _declared_feed_ok(url: str, site: str) -> bool:
    """A feed the publisher declares in its own page head: same site, or hosted on a syndication service; never a comments feed."""
    if _is_comment_feed_url(url):
        return False
    host = urlsplit(url).netloc.lower().split(":")[0]
    return _same_site(url, site) or any(host == h or host.endswith("." + h) for h in SYNDICATION_HOSTS)


def _looks_like_feed_url(url: str | None) -> bool:
    if not url or not url.startswith("http"):
        return False
    low = url.lower()
    return any(k in low for k in ("rss", "feed", "atom", ".xml")) and "ayuda" not in low and "help" not in low


def _section_path(url: str) -> str:
    """The path of a page without its trailing slash and index file, for telling a section redirect from a home page."""
    return _INDEX_FILE.sub("", urlsplit(url).path.rstrip("/")).rstrip("/")


def _redirected_to_section(requested: str, final_url: str | None) -> bool:
    """True when a home-page request ended on another path (a geo-redirect to a country edition such as
    Infobae's /estados-unidos/ or Cronista's /usa/ from a US runner); scheme, host and index-file changes do not count."""
    return bool(final_url) and _section_path(final_url) != _section_path(requested)


def _feed_title(snap: Snapshot, name: str) -> str:
    """The channel / feed title (the first <title> in the first 2 KB), CDATA unwrapped."""
    head = snap.path(name).open("rb").read(2048).decode("utf-8", errors="ignore")
    m = re.search(r"<title[^>]*>(.*?)</title>", head, re.I | re.S)
    if not m:
        return ""
    title = re.sub(r"^\s*<!\[CDATA\[(.*?)\]\]>\s*$", r"\1", m.group(1), flags=re.S)
    return re.sub(r"\s+", " ", title).strip()


class RSSPress(Adapter):
    tables = ("document", "media_volume")
    incremental = True
    respect_robots = True
    min_interval = 2.0

    def _is_feed(self, snap: Snapshot, name: str) -> bool:
        head = snap.path(name).open("rb").read(600).lstrip().lower()
        return any(k in head for k in (b"<rss", b"<feed", b"<rdf:rdf", b"<?xml"))

    def fetch(self, snap: Snapshot) -> None:
        tried: list[str] = []  # feed candidates
        asked: list[str] = []  # every URL this run requested (robots.txt accounting)
        got = 0
        if _looks_like_feed_url(self.src.api_url):
            tried.append(self.src.api_url)
            asked.append(self.src.api_url)
            got += self._try_feed(snap, self.src.api_url, got)
        if got == 0:
            # discover from the homepage, then common paths
            discovered: list[str] = []
            asked.append(self.src.url)
            try:
                html = snap.get(self.src.url, "home.html", timeout=60).read_text(encoding="utf-8", errors="ignore")
                declared = [u for u in discover_feeds(html, self.src.url) if _declared_feed_ok(u, self.src.url)]
                final = (snap.files.get("home.html") or {}).get("final_url")
                if _redirected_to_section(self.src.url, final):
                    # the page that answered is a section (a country edition chosen for the runner's address), so the
                    # feeds it declares are section feeds: only the common paths of the registry URL are tried
                    snap.manifest["home_redirected"] = final
                    snap.manifest["feeds_declared_on_redirect"] = declared[:20]
                else:
                    discovered = declared
            except Exception as e:  # noqa: BLE001
                snap.manifest.setdefault("errors", []).append({"name": "home.html", "error": str(e)[:200]})
            base = self.src.url.rstrip("/")
            for url in dict.fromkeys(discovered + [base + p for p in FEED_CANDIDATES]):
                if got >= MAX_FEEDS or (got and url not in discovered):
                    break
                tried.append(url)
                asked.append(url)
                got += self._try_feed(snap, url, got)
            snap.manifest["discovered_feeds"] = discovered[:20]
        snap.manifest["feeds_tried"] = tried[:40]
        snap.manifest["feeds_found"] = got
        snap.save()
        if got == 0:
            blocked = set(snap.manifest.get("robots_blocked", []))
            if asked and all(u in blocked for u in asked):
                # the publisher forbids automated clients everywhere we looked: recorded as "skipped" by Adapter.run
                raise RobotsDisallowed(f"{self.source_id}: robots.txt disallows every feed URL tried ({len(asked)} URLs)")
            raise RuntimeError(f"{self.source_id}: no RSS/Atom feed found (tried {len(tried)} URLs); set api_url to the feed in the registry")

    def _try_feed(self, snap: Snapshot, url: str, got: int, harvest: bool = True) -> int:
        """Fetch `url` as feed_{got}.xml and return the number of feeds stored: 1 for a feed; 0 when it is not one
        (unreachable, forbidden by robots.txt, not a feed, a reader-comments feed); for an HTML page where a feed was
        expected, often the publisher's RSS index, the number of section feeds harvested from its links (up to
        MAX_FEEDS in total, news sections before opinion ones, comment feeds never), harvested once (`harvest`)."""
        name = f"feed_{got}.xml"
        if _is_comment_feed_url(url):
            snap.manifest.setdefault("errors", []).append({"name": url, "error": f"{url}: reader-comments feed, not read"})
            return 0
        try:
            snap.get(url, name, timeout=60, headers={"Accept": "application/rss+xml, application/atom+xml, application/xml, text/xml, */*"})
        except (FetchError, RobotsDisallowed, requests.RequestException) as e:
            # one unreachable candidate (a reset connection, a 404, a robots block) is recorded; discovery goes on
            snap.manifest.setdefault("errors", []).append({"name": url, "error": str(e)[:200]})
            return 0
        if not self._is_feed(snap, name):
            # (a page the registry declares as api_url is harvested even when it ends in .html, e.g. Xinhua's rss.html)
            if harvest and snap.has(name) and (url == self.src.api_url or not url.endswith(".html")):
                html = snap.path(name).read_text(encoding="utf-8", errors="ignore")
                links = [u for u in discover_feeds(html, url, anchors=True) if u != url and _same_site(u, self.src.url) and not _is_comment_feed_url(u)][:12]
                snap.manifest.setdefault("index_pages", []).append({"url": url, "links": links})
                snap.discard(name, f"{url}: HTML index, {len(links)} feed-like links")
                n = 0
                for u in sorted(links, key=lambda u: bool(_OPINION_FEED_URL.search(urlsplit(u).path))):  # stable: news sections first
                    if got + n >= MAX_FEEDS:
                        break
                    n += self._try_feed(snap, u, got + n, harvest=False)
                return n
            snap.discard(name, f"{url}: not a feed; starts with {snap.path(name).open('rb').read(80)!r}" if snap.has(name) else f"{url}: empty")
            return 0
        title = _feed_title(snap, name)
        if _COMMENT_FEED_TITLE.search(title):
            snap.discard(name, f"{url}: reader-comments feed ({title[:60]!r}), not read")
            return 0
        snap.manifest.setdefault("feed_urls", []).append(url)
        return 1

    def parse(self, snap: Snapshot) -> dict[str, pd.DataFrame]:
        countries = list(self.src.countries)
        regional = len(countries) > 1  # a regional outlet: headlines are filed by the countries they name
        lang = self.src.language if self.src.language in ("es", "pt", "en", "nl") else "multi"
        rows: dict[str, dict] = {}
        volume: list[dict] = []
        period = snap.retrieved_at()[:10] or today_iso()
        feeds = [n for n in sorted(snap.files) if n.startswith("feed_") and snap.has(n)]
        # One count per outlet and run across every feed read (an outlet may declare several): an item seen in
        # two feeds is counted once, by its normalised URL
        tot = 0
        counts = {iso: {"items_mining": 0, "items_cn": 0, "items_us": 0} for iso in countries}
        seen: set[str] = set()
        for name in feeds:
            for it in parse_feed(snap.path(name)):
                try:
                    key = normalize_url(it.link)
                except ValueError:
                    key = it.link.strip()
                if key in seen:
                    continue
                seen.add(key)
                rel = relevance(it.title)
                tot += 1
                # a national outlet files everything under its country; a regional one under each country the
                # headline names (none named: counted in the feed's size only, no document row)
                targets = [c for c in countries_mentioned(it.title) if c in counts] if regional else countries
                for iso in targets:
                    counts[iso]["items_mining"] += rel.mining or bool(rel.minerals)
                    counts[iso]["items_cn"] += rel.mentions_cn
                    counts[iso]["items_us"] += rel.mentions_us
                if not targets or not is_relevant(rel, "news", it.title):
                    continue
                date = it.published or period
                prec = "day" if it.published else "seen"
                if int(date[:4]) < 1990:
                    continue
                for iso in targets:  # one document row per country (make_document keys the id on the country)
                    row = make_document(source_id=self.source_id, country=iso, doc_type="news", date=date, date_precision=prec, title=it.title,
                                        language=lang, venue=self.src.name, url=it.link, rel=rel, outlet_source_id=self.source_id)
                    rows.setdefault(row["doc_id"], row)
        if feeds:
            # One media_volume row per country and run (the warehouse key is source, country, period). `items_total`
            # is always what the outlet published (distinct items across its feeds); for a national outlet the three
            # other counts cover all of it, for a regional outlet they are restricted to the headlines naming that
            # country, so items_mining / items_total reads as the share of the outlet's output that is about mining
            # in that country (a zero row says the feeds were read and nothing named the country).
            first_url = (snap.manifest.get("feed_urls") or [snap.files[feeds[0]]["url"]])[0]
            for iso in countries:
                volume.append({"country": iso, "period": period, "items_total": tot, "items_mining": int(counts[iso]["items_mining"]),
                               "items_cn": int(counts[iso]["items_cn"]), "items_us": int(counts[iso]["items_us"]), "source_record_url": first_url})
        return {
            "document": self.stamp(snap, pd.DataFrame(list(rows.values()), columns=DOCUMENT_COLUMNS)),
            "media_volume": self.stamp(snap, pd.DataFrame(volume, columns=MEDIA_VOLUME_COLUMNS)),
        }


def make_rss_adapters() -> list[type[Adapter]]:
    """One adapter class per press outlet in the registry whose access is `rss` and that names its countries (a
    regional outlet lists all twelve). An outlet whose robots.txt forbids automated clients is registered with
    access `html` (De Ware Tijd), so no adapter is generated for it."""
    out: list[type[Adapter]] = []
    for sid, s in sorted(sources().items()):
        if s.category == "press" and s.access == "rss" and s.countries:
            out.append(type(f"RSS_{sid}", (RSSPress,), {"source_id": sid}))
    return out
