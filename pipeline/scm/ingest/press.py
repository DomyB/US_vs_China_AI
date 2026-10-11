"""National press: one RSS adapter per registry outlet -> document (doc_type news) and media_volume.

Only headline, date, outlet and URL are stored (brief section 4). Feeds expose the most recent
items, so these adapters are incremental and run weekly; history comes from GDELT and Media Cloud.

An outlet registered with one country (a national daily) has every headline filed under that country. An
outlet registered with several (Xinhua's Spanish service, a US department's press room) covers the whole
region: a headline is filed under each country it names (`countries_mentioned`) and dropped when it names none.
"""
from __future__ import annotations

from urllib.parse import urlsplit

import pandas as pd

from ..http import FetchError, RobotsDisallowed, Snapshot
from ..registry import sources
from .base import Adapter
from .docs import DOCUMENT_COLUMNS, MEDIA_VOLUME_COLUMNS, make_document
from .feeds import FEED_CANDIDATES, discover_feeds, parse_feed, today_iso
from .keywords import countries_mentioned, is_relevant, relevance

MAX_FEEDS = 3


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


def _declared_feed_ok(url: str, site: str) -> bool:
    """A feed the publisher declares in its own page head: same site, or hosted on a syndication service."""
    host = urlsplit(url).netloc.lower().split(":")[0]
    return _same_site(url, site) or any(host == h or host.endswith("." + h) for h in SYNDICATION_HOSTS)


def _looks_like_feed_url(url: str | None) -> bool:
    if not url or not url.startswith("http"):
        return False
    low = url.lower()
    return any(k in low for k in ("rss", "feed", "atom", ".xml")) and "ayuda" not in low and "help" not in low


class RSSPress(Adapter):
    tables = ("document", "media_volume")
    incremental = True
    respect_robots = True
    min_interval = 2.0

    def _is_feed(self, snap: Snapshot, name: str) -> bool:
        head = snap.path(name).open("rb").read(600).lstrip().lower()
        return any(k in head for k in (b"<rss", b"<feed", b"<rdf:rdf", b"<?xml"))

    def fetch(self, snap: Snapshot) -> None:
        tried: list[str] = []
        candidates: list[str] = []
        if _looks_like_feed_url(self.src.api_url):
            candidates.append(self.src.api_url)
        got = 0
        for url in list(candidates):
            tried.append(url)
            if self._try_feed(snap, url, f"feed_{got}.xml"):
                got += 1
        if got == 0:
            # discover from the homepage, then common paths
            discovered: list[str] = []
            try:
                html = snap.get(self.src.url, "home.html", timeout=60).read_text(encoding="utf-8", errors="ignore")
                discovered = [u for u in discover_feeds(html, self.src.url) if _declared_feed_ok(u, self.src.url)]
            except Exception as e:  # noqa: BLE001
                snap.manifest.setdefault("errors", []).append({"name": "home.html", "error": str(e)[:200]})
            base = self.src.url.rstrip("/")
            for url in dict.fromkeys(discovered + [base + p for p in FEED_CANDIDATES]):
                if got >= MAX_FEEDS or (got and url not in discovered):
                    break
                tried.append(url)
                if self._try_feed(snap, url, f"feed_{got}.xml"):
                    got += 1
            snap.manifest["discovered_feeds"] = discovered[:20]
        snap.manifest["feeds_tried"] = tried[:40]
        snap.manifest["feeds_found"] = got
        snap.save()
        if got == 0:
            raise RuntimeError(f"{self.source_id}: no RSS/Atom feed found (tried {len(tried)} URLs); set api_url to the feed in the registry")

    def _try_feed(self, snap: Snapshot, url: str, name: str) -> bool:
        try:
            snap.get(url, name, timeout=60, headers={"Accept": "application/rss+xml, application/atom+xml, application/xml, text/xml, */*"})
        except (FetchError, RobotsDisallowed) as e:
            snap.manifest.setdefault("errors", []).append({"name": url, "error": str(e)[:200]})
            return False
        if not self._is_feed(snap, name):
            # an HTML page where a feed was expected is often the publisher's RSS index: harvest its links once
            # (a page the registry declares as api_url is harvested even when it ends in .html, e.g. Xinhua's rss.html)
            if snap.has(name) and (url == self.src.api_url or not url.endswith(".html")) and "index_" not in name:
                html = snap.path(name).read_text(encoding="utf-8", errors="ignore")
                links = [u for u in discover_feeds(html, url, anchors=True) if u != url and _same_site(u, self.src.url)][:12]
                snap.manifest.setdefault("index_pages", []).append({"url": url, "links": links})
                snap.discard(name, f"{url}: HTML index, {len(links)} feed-like links")
                for i, u in enumerate(links):
                    if self._try_feed(snap, u, name if i == 0 else f"index_{name}"):
                        if i and snap.has(f"index_{name}"):
                            snap.path(name).write_bytes(snap.path(f"index_{name}").read_bytes())
                            snap.files[name] = snap.files.pop(f"index_{name}")
                            snap.save()
                        return True
                return False
            snap.discard(name, f"{url}: not a feed; starts with {snap.path(name).open('rb').read(80)!r}" if snap.has(name) else f"{url}: empty")
            return False
        snap.manifest.setdefault("feed_urls", []).append(url)
        return True

    def parse(self, snap: Snapshot) -> dict[str, pd.DataFrame]:
        countries = list(self.src.countries)
        regional = len(countries) > 1  # a regional outlet: headlines are filed by the countries they name
        lang = self.src.language if self.src.language in ("es", "pt", "en", "nl") else "multi"
        rows: dict[str, dict] = {}
        volume: list[dict] = []
        period = snap.retrieved_at()[:10] or today_iso()
        for name in sorted(snap.files):
            if not name.startswith("feed_") or not snap.has(name):
                continue
            items = parse_feed(snap.path(name))
            tot = 0
            counts = {iso: {"items_mining": 0, "items_cn": 0, "items_us": 0} for iso in countries}
            for it in items:
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
            # One media_volume row per country. `items_total` is always the feed's size (what the outlet published);
            # for a national outlet the three other counts cover the whole feed, for a regional outlet they are
            # restricted to the headlines naming that country, so items_mining / items_total reads as the share
            # of the outlet's output that is about mining in that country (a zero row says the feed was read and
            # nothing named the country).
            for iso in countries:
                volume.append({"country": iso, "period": period, "items_total": tot, "items_mining": int(counts[iso]["items_mining"]),
                               "items_cn": int(counts[iso]["items_cn"]), "items_us": int(counts[iso]["items_us"]), "source_record_url": snap.files[name]["url"]})
        return {
            "document": self.stamp(snap, pd.DataFrame(list(rows.values()), columns=DOCUMENT_COLUMNS)),
            "media_volume": self.stamp(snap, pd.DataFrame(volume, columns=MEDIA_VOLUME_COLUMNS)),
        }


def make_rss_adapters() -> list[type[Adapter]]:
    """One adapter class per press outlet in the registry whose access is `rss`."""
    out: list[type[Adapter]] = []
    for sid, s in sorted(sources().items()):
        if s.category == "press" and s.access == "rss" and s.countries:
            out.append(type(f"RSS_{sid}", (RSSPress,), {"source_id": sid}))
    return out
