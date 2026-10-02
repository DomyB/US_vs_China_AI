"""RSS / Atom / RSS 1.0 parsing on the standard library, feed discovery and URL normalisation.

No feed library: the formats are small, and keeping to xml.etree avoids a dependency whose
behaviour we cannot inspect in fixtures.
"""
from __future__ import annotations

import re
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from datetime import UTC, datetime
from email.utils import parsedate_to_datetime
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import parse_qsl, urlencode, urljoin, urlsplit, urlunsplit

ATOM = "{http://www.w3.org/2005/Atom}"
RSS1 = "{http://purl.org/rss/1.0/}"
DC = "{http://purl.org/dc/elements/1.1/}"

# common feed paths tried when a publisher's page does not advertise its feed
FEED_CANDIDATES = ["/rss", "/feed", "/rss.xml", "/feed.xml", "/feeds/rss", "/rss/portada", "/rss/ultimas-noticias",
                   "/arc/outboundfeeds/rss/?outputType=xml", "/rss/lo-ultimo/", "/feeds/articulos", "/rss/listado/"]

_TRACKING = re.compile(r"^(utm_.*|fbclid|gclid|mc_cid|mc_eid|ref|source|cmpid|ncid|sc_src|ito)$", re.I)


@dataclass
class FeedItem:
    title: str
    link: str
    published: str | None  # ISO date YYYY-MM-DD or None
    guid: str | None


def strip_ns(root: ET.Element) -> ET.Element:
    """Remove XML namespaces in place (SOAP responses, RSS extensions) so tags can be matched by name."""
    for el in root.iter():
        if isinstance(el.tag, str) and el.tag.startswith("{"):
            el.tag = el.tag.split("}", 1)[1]
    return root


def _iso_date(text: str | None) -> str | None:
    if not text:
        return None
    t = text.strip()
    try:
        dt = parsedate_to_datetime(t)  # RFC 822 (RSS 2.0)
        return dt.date().isoformat()
    except (TypeError, ValueError, IndexError):
        pass
    m = re.match(r"(\d{4})-(\d{2})-(\d{2})", t)  # ISO 8601 (Atom, dc:date)
    if m:
        return f"{m.group(1)}-{m.group(2)}-{m.group(3)}"
    m = re.match(r"(\d{2})/(\d{2})/(\d{4})", t)
    if m:
        return f"{m.group(3)}-{m.group(2)}-{m.group(1)}"
    return None


def _text(el: ET.Element | None) -> str:
    return (el.text or "").strip() if el is not None else ""


def parse_feed_bytes(raw: bytes) -> list[FeedItem]:
    raw = raw.lstrip(b"\xef\xbb\xbf \r\n\t")
    try:
        root = ET.fromstring(raw)
    except ET.ParseError:
        # bare ampersands are the most common breakage in publisher feeds; escape and retry once
        fixed = re.sub(rb"&(?![a-zA-Z]+;|#\d+;|#x[0-9a-fA-F]+;)", b"&amp;", raw)
        try:
            root = ET.fromstring(fixed)
        except ET.ParseError:
            return []
    items: list[FeedItem] = []
    # RSS 2.0
    for it in root.iter("item"):
        title = _text(it.find("title"))
        link = _text(it.find("link")) or _text(it.find("guid"))
        if not link:
            # some feeds put the link as tail text or in an atom:link
            al = it.find(f"{ATOM}link")
            link = al.get("href", "") if al is not None else ""
        date = _iso_date(_text(it.find("pubDate")) or _text(it.find(f"{DC}date")))
        if title and link:
            items.append(FeedItem(title, link, date, _text(it.find("guid")) or None))
    if items:
        return items
    # RSS 1.0 / RDF
    for it in root.iter(f"{RSS1}item"):
        title = _text(it.find(f"{RSS1}title"))
        link = _text(it.find(f"{RSS1}link")) or it.get("{http://www.w3.org/1999/02/22-rdf-syntax-ns#}about", "")
        date = _iso_date(_text(it.find(f"{DC}date")))
        if title and link:
            items.append(FeedItem(title, link, date, None))
    if items:
        return items
    # Atom
    for it in root.iter(f"{ATOM}entry"):
        title = _text(it.find(f"{ATOM}title"))
        link = ""
        for ln in it.findall(f"{ATOM}link"):
            if ln.get("rel", "alternate") == "alternate":
                link = ln.get("href", "")
                break
        date = _iso_date(_text(it.find(f"{ATOM}published")) or _text(it.find(f"{ATOM}updated")))
        if title and link:
            items.append(FeedItem(title, link, date, _text(it.find(f"{ATOM}id")) or None))
    return items


def parse_feed(path: Path) -> list[FeedItem]:
    return parse_feed_bytes(path.read_bytes())


class _LinkFinder(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.feeds: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag.lower() != "link":
            return
        a = {k.lower(): (v or "") for k, v in attrs}
        if "alternate" in a.get("rel", "").lower() and a.get("type", "").lower() in ("application/rss+xml", "application/atom+xml", "application/rdf+xml") and a.get("href"):
            self.feeds.append(a["href"])


def discover_feeds(html: str, base_url: str) -> list[str]:
    """Feed URLs advertised in the page head (<link rel="alternate" type="application/rss+xml">)."""
    finder = _LinkFinder()
    try:
        finder.feed(html)
    except Exception:  # noqa: BLE001 - malformed HTML; whatever was found so far
        pass
    return list(dict.fromkeys(urljoin(base_url, h) for h in finder.feeds))


def normalize_url(url: str) -> str:
    """Canonical form for deduplicating the same article seen through RSS and GDELT:
    lower-case host, no tracking parameters, no fragment, no trailing slash, no AMP suffix."""
    parts = urlsplit(url.strip())
    host = parts.netloc.lower()
    if host.startswith("www."):
        host = host[4:]
    path = re.sub(r"/amp/?$", "", parts.path).rstrip("/")
    kept = [(k, v) for k, v in parse_qsl(parts.query, keep_blank_values=True) if not _TRACKING.match(k)]
    return urlunsplit((parts.scheme.lower() or "https", host, path, urlencode(kept, doseq=True), ""))


def today_iso() -> str:
    return datetime.now(UTC).date().isoformat()
