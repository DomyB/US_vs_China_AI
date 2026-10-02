"""National press: one RSS adapter per registry outlet -> document (doc_type news) and media_volume.

Only headline, date, outlet and URL are stored (brief section 4). Feeds expose the most recent
items, so these adapters are incremental and run weekly; history comes from GDELT.
"""
from __future__ import annotations

import pandas as pd

from ..http import FetchError, Snapshot
from ..registry import sources
from .base import Adapter
from .docs import DOCUMENT_COLUMNS, MEDIA_VOLUME_COLUMNS, make_document
from .feeds import FEED_CANDIDATES, discover_feeds, parse_feed, today_iso
from .keywords import is_relevant, relevance

MAX_FEEDS = 3


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
                discovered = discover_feeds(html, self.src.url)
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
        except FetchError as e:
            snap.manifest.setdefault("errors", []).append({"name": url, "error": str(e)[:200]})
            return False
        if not self._is_feed(snap, name):
            # an HTML page where a feed was expected is often the publisher's RSS index: harvest its links once
            if snap.has(name) and not url.endswith(".html") and "index_" not in name:
                html = snap.path(name).read_text(encoding="utf-8", errors="ignore")
                links = [u for u in discover_feeds(html, url, anchors=True) if u != url][:12]
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
        country = self.src.countries[0]
        lang = self.src.language if self.src.language in ("es", "pt", "en", "nl") else "multi"
        rows: dict[str, dict] = {}
        volume: list[dict] = []
        period = snap.retrieved_at()[:10] or today_iso()
        for name in sorted(snap.files):
            if not name.startswith("feed_") or not snap.has(name):
                continue
            items = parse_feed(snap.path(name))
            tot = mining = cn = us = 0
            for it in items:
                rel = relevance(it.title)
                tot += 1
                mining += rel.mining or bool(rel.minerals)
                cn += rel.mentions_cn
                us += rel.mentions_us
                if not is_relevant(rel, "news", it.title):
                    continue
                date = it.published or period
                prec = "day" if it.published else "seen"
                if int(date[:4]) < 1990:
                    continue
                row = make_document(source_id=self.source_id, country=country, doc_type="news", date=date, date_precision=prec, title=it.title,
                                    language=lang, venue=self.src.name, url=it.link, rel=rel, outlet_source_id=self.source_id)
                rows.setdefault(row["doc_id"], row)
            volume.append({"country": country, "period": period, "items_total": tot, "items_mining": int(mining), "items_cn": int(cn), "items_us": int(us),
                           "source_record_url": snap.files[name]["url"]})
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
