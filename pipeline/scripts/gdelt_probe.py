"""Probe how the GDELT DOC API answers Spanish and Portuguese queries, and how Google News RSS search behaves.

Runs on the GitHub Actions runner (the development container has no route to either host). It writes nothing
to the warehouse: every answer is printed as one JSON line (`probe`, `status`, `bytes`, `articles`, `head`) so the
log is the record. One request every PACE seconds; a 429 pauses for THROTTLE seconds and the probe continues.

Usage: python scripts/gdelt_probe.py [gdelt|gnews|all]
"""
from __future__ import annotations

import json
import sys
import time
import urllib.robotparser
import xml.etree.ElementTree as ET
from datetime import UTC, datetime, timedelta

import requests

API = "https://api.gdeltproject.org/api/v2/doc/doc"
UA = "US-vs-China-AI pipeline probe (github.com/DomyB/US_vs_China_AI)"
PACE = 12
THROTTLE = 60
TODAY = datetime.now(UTC).date()
LAST30 = {"startdatetime": (TODAY - timedelta(days=30)).strftime("%Y%m%d000000"), "enddatetime": TODAY.strftime("%Y%m%d235959")}
WIN_2025 = {"startdatetime": "20250901000000", "enddatetime": "20250915235959"}
BASE = {"mode": "artlist", "format": "json", "maxrecords": 5, "sort": "datedesc"}
PROD_ES = '(litio OR cobre OR minería OR minera OR niobio OR "tierras raras") (China OR chino OR chinos OR "Estados Unidos" OR estadounidense) sourcelang:spanish sourcecountry:AR'

GDELT_PROBES: list[tuple[str, dict]] = [
    ("en_control", {"query": "lithium", **BASE, **LAST30}),
    ("en_sourcelang", {"query": "lithium sourcelang:english", **BASE, **LAST30}),
    ("es_term_only", {"query": "cobre", **BASE, **LAST30}),
    ("es_sourcelang_lower", {"query": "cobre sourcelang:spanish", **BASE, **LAST30}),
    ("es_sourcelang_cap", {"query": "cobre sourcelang:Spanish", **BASE, **LAST30}),
    ("es_sourcelang_iso3", {"query": "cobre sourcelang:spa", **BASE, **LAST30}),
    ("es_sourcecountry_AR", {"query": "cobre sourcecountry:AR", **BASE, **LAST30}),
    ("es_sourcecountry_CI", {"query": "cobre sourcecountry:CI", **BASE, **LAST30}),
    ("es_two_terms", {"query": "litio China", **BASE, **LAST30}),
    ("es_phrase", {"query": '"tierras raras"', **BASE, **LAST30}),
    ("es_accent", {"query": "minería", **BASE, **LAST30}),
    ("es_timespan", {"query": "cobre", "mode": "artlist", "format": "json", "maxrecords": 5, "timespan": "1month"}),
    ("es_timelinevol", {"query": "cobre sourcelang:spanish", "mode": "timelinevol", "format": "json", **LAST30}),
    ("es_no_sort", {"query": "cobre sourcelang:spanish", "mode": "artlist", "format": "json", "maxrecords": 5, **LAST30}),
    ("es_window_2025", {"query": "cobre sourcelang:spanish", **BASE, **WIN_2025}),
    ("es_production_form", {"query": PROD_ES, **BASE, **WIN_2025}),
    ("pt_term", {"query": "lítio", **BASE, **LAST30}),
    ("pt_term_ascii", {"query": "litio sourcelang:portuguese", **BASE, **LAST30}),
    ("pt_sourcelang", {"query": "mineração sourcelang:portuguese", **BASE, **LAST30}),
    ("pt_sourcecountry_BR", {"query": "cobre sourcecountry:BR", **BASE, **LAST30}),
]


def say(**kw) -> None:
    print(json.dumps(kw, ensure_ascii=False), flush=True)


def gdelt() -> None:
    s = requests.Session()
    s.headers["User-Agent"] = UA
    for key, params in GDELT_PROBES:
        try:
            r = s.get(API, params=params, timeout=60)
        except Exception as e:  # noqa: BLE001
            say(probe=key, error=str(e)[:160])
            time.sleep(PACE)
            continue
        body = r.content
        head = body[:160].decode("utf-8", "replace")
        arts = None
        try:
            j = json.loads(body.decode("utf-8"))
            arts = len(j.get("articles", [])) if isinstance(j, dict) else None
            if isinstance(j, dict) and "timeline" in j:
                arts = sum(int(p.get("value", 0)) for t in j["timeline"] for p in t.get("data", []))
        except Exception:  # noqa: BLE001
            pass
        say(probe=key, status=r.status_code, bytes=len(body), articles=arts, url=r.url[:220], head=head)
        time.sleep(THROTTLE if r.status_code == 429 else PACE)


def gnews() -> None:
    s = requests.Session()
    s.headers["User-Agent"] = UA
    r = s.get("https://news.google.com/robots.txt", timeout=30)
    lines = [ln for ln in r.text.splitlines() if ln.strip()]
    say(probe="gnews_robots", status=r.status_code, lines=lines[:40])
    rp = urllib.robotparser.RobotFileParser()
    rp.parse(r.text.splitlines())
    feed = "https://news.google.com/rss/search?q=litio+site:lanacion.com.ar+after:2023-01-01+before:2023-04-01&hl=es-419&gl=AR&ceid=AR:es-419"
    allowed = rp.can_fetch(UA, feed) and rp.can_fetch("*", feed)
    say(probe="gnews_allowed", allowed=allowed, crawl_delay=rp.crawl_delay("*"))
    if not allowed:
        say(probe="gnews_search", skipped="robots.txt disallows the search feed; not fetched")
        return
    time.sleep(PACE)
    r = s.get(feed, timeout=60)
    items = []
    try:
        root = ET.fromstring(r.content)
        for it in root.iter("item"):
            src = it.find("source")
            items.append({"title": (it.findtext("title") or "")[:120], "link": (it.findtext("link") or "")[:90], "pubDate": it.findtext("pubDate"),
                          "source": src.text if src is not None else None, "source_url": src.get("url") if src is not None else None})
    except ET.ParseError as e:
        say(probe="gnews_search", status=r.status_code, parse_error=str(e)[:120], head=r.text[:200])
        return
    say(probe="gnews_search", status=r.status_code, bytes=len(r.content), items=len(items), first=items[:3], last_date=items[-1]["pubDate"] if items else None)


if __name__ == "__main__":
    what = sys.argv[1] if len(sys.argv) > 1 else "all"
    if what in ("gdelt", "all"):
        gdelt()
    if what in ("gnews", "all"):
        gnews()
