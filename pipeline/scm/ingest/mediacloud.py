"""Media Cloud API v4 -> media_volume (monthly story counts per national collection) and document (headlines).

Media Cloud (mediacloud.org, a university consortium) indexes stories from tens of thousands of outlets and
keeps one national collection per country ("Argentina - National"). It is the history source for the press
record: GDELT throttles GitHub's runner addresses and starts in 2017, while Media Cloud answers a registered
key (MEDIACLOUD_KEY, free; 4,000 requests a week, the count endpoints two a minute) and its collections reach back to about 2010. Per country and year the adapter asks
for three daily count series (the mineral query; mineral AND China; mineral AND the United States) and one
story list (the mineral query, requested newest first though the API answers in its own order, paginated, capped
at MAX_STORIES per country-year: a big collection matches tens of thousands of stories a year, so the list is a
sample of them and the cut is
recorded, per country-year, as `headlines_window` {from, to, kept, matched, truncated} in the manifest and in
the ingest_run record, from which the export tells the reader the window the headlines come from). The daily
rows are summed into MONTHLY `media_volume` rows (`period = YYYY-MM-01`); `items_total` is the collection's
own daily total, so a share `items_mining / items_total` is the share of that collection, not of all press.
Headlines are kept as `document` rows (headline, date, outlet, URL; never text) when the keyword filter admits them.

The exact response shapes could not be verified from the sandbox (no network), so the parser accepts the
documented nesting and the flat form, stores every raw response in the snapshot and lists anything it cannot
read under manifest["unparsed"]. Only months that have ended are written (the running month would otherwise be
stored half-counted, since the incremental merge keeps the first row per month); a country-year is done when the
ledger (media_volume) holds its twelve months from this adapter, and the current year is refreshed every run. The
plan runs newest year first so the recent record fills before the history, within MEDIACLOUD_TIME_BUDGET_MIN
minutes per run (MEDIACLOUD_YEARS=YYYY-YYYY bounds a run).
"""
from __future__ import annotations

import json
import os
import re
import time
from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from urllib.parse import urlsplit

import pandas as pd

from ..http import Snapshot
from ..paths import WAREHOUSE_DIR
from ..registry import COUNTRIES, IN_SCOPE, sources
from .base import Adapter
from .docs import DOCUMENT_COLUMNS, MEDIA_VOLUME_COLUMNS, make_document
from .gdelt import outlet_domains
from .keywords import is_relevant, relevance

API = "https://search.mediacloud.org/api/"
HISTORY_FROM = 2010
PLATFORM = "onlinenews-mediacloud"  # the `platform` value the Media Cloud client sends
PAGE_SIZE = 1000
MAX_STORIES = 2000  # stories kept per country-year (two pages of PAGE_SIZE)
MAX_CONSECUTIVE_ERRORS = 5  # after this many failed requests in a row the run stops (quota or outage); the rest waits for the next run
MAX_THROTTLES = 10  # HTTP 429 answers in one run before it stops: the address is rate-limited or the weekly quota is spent
QUERY_RATE = (2, 60.0)  # Media Cloud limits each search endpoint to two requests a minute per user (its FAQ; confirmed by the first runs)
THROTTLE_PAUSE_S = 61  # the pause before the one retry of a throttled request, unless the answer names its own wait
THROTTLE_PAUSE_MAX_S = 120

# The mineral terms are the ones the GDELT adapter queries (gdelt.TERMS, English because GDELT matches its English
# translations) plus their Spanish and Portuguese forms, since Media Cloud matches the story's own language; the
# Dutch forms cover Suriname's press. Whole-word matching is the index's, the headline is re-filtered afterwards
# by the keyword module in its own language.
MINERAL_TERMS = [
    # en (gdelt.TERMS)
    "lithium", "copper", "mining", "niobium", '"rare earths"', "bauxite", "minerals", "gold",
    # es
    "litio", "cobre", "minería", "minera", "minero", "niobio", '"tierras raras"', "bauxita", "minerales", "oro",
    # pt
    "lítio", "mineração", "mineradora", "nióbio", '"terras raras"', "minério", "minerais", "ouro",
    # nl
    "mijnbouw", "bauxiet", "goud",
]
CN_TERMS = ["China", "chino", "china", "Chinese", "Beijing", "Pekín", "Pequim"]
US_TERMS = ['"Estados Unidos"', "EEUU", '"EE.UU."', '"United States"', "Washington", "estadounidense", "americano"]
COUNT_KINDS = ("count_mining", "count_cn", "count_us")


def mineral_query() -> str:
    return "(" + " OR ".join(dict.fromkeys(MINERAL_TERMS)) + ")"


def actor_query(kind: str) -> str:
    """The query for one count kind: the mineral terms alone, or ANDed with the China / United States terms."""
    base = mineral_query()
    if kind == "count_mining":
        return base
    terms = CN_TERMS if kind == "count_cn" else US_TERMS
    return f"{base} AND ({' OR '.join(terms)})"


def collection_name(iso: str) -> str:
    return f"{COUNTRIES[iso]} - National"


def find_collection(results: object, iso: str) -> int | str | None:
    """The id of the national collection among a `sources/collections/` answer (list or {results: [...]})."""
    items = results.get("results", results.get("collections", [])) if isinstance(results, dict) else results
    if not isinstance(items, list):
        return None
    want = collection_name(iso).lower()
    names = [(str(it.get("name", "")).strip().lower(), it["id"]) for it in items if isinstance(it, dict) and it.get("id") is not None]
    for name, cid in names:
        if name == want:
            return cid
    # Media Cloud names some countries by their long form ("Bolivia, Plurinational State of - National",
    # "Venezuela, Bolivarian Republic of - National"): the national collection whose name is the short name, a comma and a qualifier
    country = COUNTRIES[iso].lower()
    for name, cid in names:
        if name.endswith(" - national") and name.startswith(country + ","):
            return cid
    return None


def daily_rows(payload: object) -> list[dict] | None:
    """The daily rows of a count-over-time answer: nested under count_over_time -> counts, under counts,
    or the list itself. None when the shape is not recognised."""
    obj = payload
    for _ in range(3):
        if isinstance(obj, list):
            break
        if not isinstance(obj, dict):
            return None
        for key in ("count_over_time", "counts", "results", "data"):
            if key in obj:
                obj = obj[key]
                break
        else:
            return None
    if not isinstance(obj, list):
        return None
    out = []
    for r in obj:
        if not isinstance(r, dict) or "date" not in r:
            continue
        d = str(r.get("date", ""))[:10]
        if not re.match(r"^\d{4}-\d{2}-\d{2}$", d):
            continue
        out.append({"date": d, "count": _int(r.get("count")), "total_count": _int(r.get("total_count", r.get("total")))})
    return out


def story_rows(payload: object) -> tuple[list[dict], str | None] | None:
    """(stories, pagination_token) of a story-list answer, or None when the shape is not recognised."""
    if isinstance(payload, list):
        return [s for s in payload if isinstance(s, dict)], None
    if not isinstance(payload, dict):
        return None
    stories = payload.get("stories", payload.get("results"))
    if not isinstance(stories, list):
        return None
    token = payload.get("pagination_token") or payload.get("next_page_token")
    return [s for s in stories if isinstance(s, dict)], (str(token) if token else None)


def throttle_wait(message: str) -> float:
    """The pause a throttled answer asks for ("Request was throttled. Expected available in 42 seconds."), bounded;
    THROTTLE_PAUSE_S when the answer names none."""
    m = re.search(r"available in (\d+) second", message)
    return min(float(m.group(1)) + 1, THROTTLE_PAUSE_MAX_S) if m else float(THROTTLE_PAUSE_S)


def _int(x: object) -> int:
    try:
        return int(float(x))  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return 0


def _publish_date(story: dict) -> str | None:
    d = str(story.get("publish_date") or "")[:10]
    return d if re.match(r"^\d{4}-\d{2}-\d{2}$", d) else None


def headline_windows(pages: dict[tuple[str, int], dict[int, tuple[list[str], int, bool]]], counts: dict[tuple[str, int], dict[str, list[dict]]]) -> dict[str, dict]:
    """{"ISO/year": {from, to, kept, matched, truncated}} from the stored story pages of a run (page -> (publish dates,
    stories on the page, has a next-page token)): `from`/`to` the oldest and newest publish date in the list, `kept` the
    stories the list holds, `matched` the year's matches of the same query (the daily mining counts summed; None when
    that count call failed) and `truncated` when the last stored page still carried a next-page token, i.e. the year
    has more matches than MAX_STORIES and the list holds a sample of them only."""
    out: dict[str, dict] = {}
    for (iso, year), by_page in sorted(pages.items()):
        dates = [d for _, (ds, _, _) in sorted(by_page.items()) for d in ds]
        mining = (counts.get((iso, year)) or {}).get("count_mining")
        out[f"{iso}/{year}"] = {"from": min(dates) if dates else None, "to": max(dates) if dates else None, "kept": sum(n for _, n, _ in by_page.values()),
                                "matched": sum(r["count"] for r in mining) if mining is not None else None,
                                "truncated": by_page[max(by_page)][2]}
    return out


def _host(url: str) -> str:
    h = urlsplit(url).netloc.lower()
    return h[4:] if h.startswith("www.") else h


def month_sums(rows: list[dict]) -> dict[str, dict[str, int]]:
    """{YYYY-MM-01: {count, total_count}} summed from daily rows."""
    out: dict[str, dict[str, int]] = {}
    for r in rows:
        key = r["date"][:7] + "-01"
        m = out.setdefault(key, {"count": 0, "total_count": 0})
        m["count"] += r["count"]
        m["total_count"] += r["total_count"]
    return out


def complete_months(start: str, end: str) -> list[str]:
    """Every YYYY-MM-01 of the requested range whose month had ended by `end` (so a month with no stories still gets a
    zero row, while the month still running on the fetch day gets none: the incremental merge keeps the first row stored
    per month, so a half-counted month would stay half-counted for good; it is written by the first run after it ends)."""
    try:
        s, e = date.fromisoformat(start[:10]), date.fromisoformat(end[:10])
    except ValueError:
        return []
    out = []
    y, m = s.year, s.month
    while (y, m) <= (e.year, e.month):
        ny, nm = (y + 1, 1) if m == 12 else (y, m + 1)
        if date(ny, nm, 1) - timedelta(days=1) <= e:
            out.append(f"{y:04d}-{m:02d}-01")
        y, m = ny, nm
    return out


def year_bounds(value: str | None) -> tuple[int, int] | None:
    """MEDIACLOUD_YEARS as (first, last), or None when unset or malformed."""
    m = re.match(r"^\s*(\d{4})\s*-\s*(\d{4})\s*$", value or "")
    if not m:
        return None
    a, b = int(m.group(1)), int(m.group(2))
    return (min(a, b), max(a, b))


def plan_years(prev: pd.DataFrame | None, today: date, only: list[str], bounds: tuple[int, int] | None = None) -> list[tuple[str, int]]:
    """The (country, year) pairs to fetch, newest year first and the countries in turn within a year.

    A country-year is done when the ledger holds media_volume rows of that country for all twelve months of that year
    whose `source_record_url` carries `mediacloud` (the count request URL): `parse` writes every month of a fetched
    range that has ended, so a year with fewer months was cut short (a failed request, a run stopped by its budget)
    and is planned again. The current year is never done: it is still being written, so every run refreshes it and
    the newly ended month joins the ledger (the merge keeps the first-seen row per month, as for every incremental
    adapter, so a month is written once, after it has ended)."""
    months: dict[tuple[str, int], set[str]] = {}
    if prev is not None and not prev.empty and {"country", "period"} <= set(prev.columns):
        urls = prev["source_record_url"].astype(str) if "source_record_url" in prev.columns else pd.Series([""] * len(prev), index=prev.index)
        for country, period, url in zip(prev["country"], prev["period"], urls, strict=True):
            if "mediacloud" in url and re.match(r"^\d{4}-\d{2}", str(period)):
                months.setdefault((str(country), int(str(period)[:4])), set()).add(str(period)[:7])
    done = {key for key, seen in months.items() if len(seen) >= 12}
    first, last = HISTORY_FROM, today.year
    if bounds:
        first, last = max(first, bounds[0]), min(last, bounds[1])
    plan: list[tuple[str, int]] = []
    for year in range(last, first - 1, -1):
        for iso in only:
            if year == today.year or (iso, year) not in done:
                plan.append((iso, year))
    return plan


class MediaCloud(Adapter):
    source_id = "mediacloud"
    tables = ("document", "media_volume")
    requires_env = ("MEDIACLOUD_KEY",)
    incremental = True
    min_interval = 1.0
    retry_statuses = (500, 502, 503, 504)  # a 429 is paced by the adapter (one retry after the wait the answer names), never retried blindly
    TIME_BUDGET_MIN = 40  # minutes of fetching per run (MEDIACLOUD_TIME_BUDGET_MIN); unfetched country-years wait for the next run
    _errors = 0  # consecutive failed requests in this run
    _calls: dict[str, list[float]]  # endpoint -> monotonic times of its recent requests, for the two-a-minute pacing
    _windows: dict[str, dict]  # "ISO/year" -> the story list's window (see headline_windows), set by parse and recorded by load

    def _pause(self, seconds: float) -> None:
        time.sleep(seconds)

    def _pace(self, endpoint: str) -> None:
        """Wait so that no more than QUERY_RATE[0] requests to one endpoint go out in any QUERY_RATE[1] seconds. The limit
        is per endpoint, so the three counts and the two story pages of a country-year interleave: about two minutes each."""
        n, window = QUERY_RATE
        now = time.monotonic()
        calls = [t for t in self.__dict__.setdefault("_calls", {}).get(endpoint, []) if now - t < window]
        if len(calls) >= n:
            wait = window - (now - calls[0]) + 1.0
            if wait > 0:
                self._pause(wait)
                now = time.monotonic()
        calls.append(now)
        self._calls[endpoint] = calls

    def _headers(self) -> dict[str, str]:
        return {"Authorization": f"Token {os.environ.get('MEDIACLOUD_KEY', '')}", "Accept": "application/json"}

    def _get_json(self, snap: Snapshot, path: str, name: str, params: dict) -> object | None:
        """One GET, stored under `name`; None (and a manifest error) when it fails or is not JSON."""
        if self._errors >= MAX_CONSECUTIVE_ERRORS or snap.manifest.get("throttled", 0) >= MAX_THROTTLES:
            return None  # the run is stopping: no further request
        for attempt in (1, 2):
            try:
                snap.get(API + path, name, params=params, headers=self._headers(), timeout=120, force=True)
                break
            except Exception as e:  # noqa: BLE001 - the country-year stays missing and is planned again next run
                err = str(e)
                throttled = re.search(r"HTTP 429\b", err) is not None
                if throttled:
                    snap.manifest["throttled"] = snap.manifest.get("throttled", 0) + 1
                if throttled and attempt == 1 and snap.manifest["throttled"] < MAX_THROTTLES:
                    self._pause(throttle_wait(err))  # one paced retry: the API names its wait ("Expected available in N seconds")
                    continue
                snap.manifest["errors"].append({"name": name, "error": err[:200]})
                self._errors += 1
                return None
        try:
            payload = json.loads(snap.path(name).read_text(encoding="utf-8"))
        except (json.JSONDecodeError, UnicodeDecodeError) as e:
            snap.discard(name, f"non-JSON answer for {name}: {str(e)[:100]}")
            self._errors += 1
            return None
        self._errors = 0
        return payload

    def collections(self, snap: Snapshot, only: list[str]) -> dict[str, int | str]:
        """ISO3 -> national collection id, looked up by name; countries without one are recorded and skipped."""
        found: dict[str, int | str] = {}
        missing: list[str] = []
        for iso in only:
            payload = self._get_json(snap, "sources/collections/", f"collections/{iso}.json", {"name": collection_name(iso), "limit": 50})
            if payload is None:
                missing.append(iso)
                continue
            cid = find_collection(payload, iso)
            if cid is None:
                missing.append(iso)
                snap.manifest.setdefault("unparsed", []).append(f"collections/{iso}.json")
            else:
                found[iso] = cid
        snap.manifest["collections"] = found
        snap.manifest["collections_missing"] = missing
        snap.save()
        return found

    def fetch(self, snap: Snapshot) -> None:
        self._errors = 0
        self._calls = {}
        snap.manifest["errors"] = []
        today = datetime.now(UTC).date()
        bounds = year_bounds(os.environ.get("MEDIACLOUD_YEARS"))
        time_budget = float(os.environ.get("MEDIACLOUD_TIME_BUDGET_MIN", str(self.TIME_BUDGET_MIN)) or self.TIME_BUDGET_MIN) * 60
        t0 = time.monotonic()
        cols = self.collections(snap, list(IN_SCOPE))
        plan = plan_years(self.previous_table("media_volume"), today, [iso for iso in IN_SCOPE if iso in cols], bounds)
        snap.manifest["years_planned"] = len(plan)
        snap.manifest["years_bounds"] = list(bounds) if bounds else None
        fetched = 0
        for iso, year in plan:
            if time.monotonic() - t0 > time_budget:
                snap.manifest["stopped"] = f"time budget of {time_budget / 60:.0f} min exhausted"
                break
            if self._errors >= MAX_CONSECUTIVE_ERRORS:
                snap.manifest["stopped"] = f"{MAX_CONSECUTIVE_ERRORS} consecutive requests failed; the remaining years wait for the next run"
                break
            if snap.manifest.get("throttled", 0) >= MAX_THROTTLES:
                snap.manifest["stopped"] = f"{MAX_THROTTLES} throttle responses in this run: the address is rate-limited or the weekly quota is spent"
                break
            start, end = f"{year}-01-01", min(date(year, 12, 31), today).isoformat()
            common = {"start": start, "end": end, "cs": cols[iso], "platform": PLATFORM}
            for kind in COUNT_KINDS:
                self._pace("search/count-over-time")
                self._get_json(snap, "search/count-over-time", f"{iso}/{year}_{kind}.json", {"q": actor_query(kind), **common})
            self._stories(snap, iso, year, common)
            fetched += 1
            snap.manifest["years_fetched"] = fetched
            snap.save()
        snap.manifest["years_left"] = max(0, len(plan) - fetched)
        snap.save()

    def _stories(self, snap: Snapshot, iso: str, year: int, common: dict) -> None:
        """The story list of a country-year (requested newest first; the API answers in its own order), at most
        MAX_STORIES stories. A year with more matches than the cap is cut: the list then holds a sample of them only, and the cut is recorded in the manifest under
        `stories_truncated` ({"ISO/year": {from, to, kept}}) so a reader never takes a few weeks for the year."""
        token: str | None = None
        got = 0
        dates: list[str] = []
        for page in range(1, MAX_STORIES // PAGE_SIZE + 1):
            params = {"q": mineral_query(), **common, "page_size": PAGE_SIZE, "sort_order": "desc"}
            if token:
                params["pagination_token"] = token
            self._pace("search/story-list")
            payload = self._get_json(snap, "search/story-list", f"{iso}/{year}_stories_{page}.json", params)
            if payload is None:
                return
            parsed = story_rows(payload)
            if parsed is None:
                snap.manifest.setdefault("unparsed", []).append(f"{iso}/{year}_stories_{page}.json")
                return
            stories, token = parsed
            got += len(stories)
            dates.extend(d for d in (_publish_date(s) for s in stories) if d)
            if not token or not stories:
                return
            if got >= MAX_STORIES:
                # the cap stopped the loop with a page still to come: the year has more matches than the list holds
                snap.manifest.setdefault("stories_truncated", {})[f"{iso}/{year}"] = {"from": min(dates) if dates else None, "to": max(dates) if dates else None, "kept": got}
                return

    def load(self, tables: dict[str, pd.DataFrame], out_dir: Path = WAREHOUSE_DIR) -> dict[str, int]:
        """The usual row counts plus `headlines_window` (per fetched country-year: the story list's date window, how
        many stories it holds, how many the query matched and whether it was cut). Raw snapshots are not kept between
        runs, so the window travels in the ingest_run record, which the data release restores and the export reads."""
        rows = super().load(tables, out_dir=out_dir)
        windows = self.__dict__.get("_windows") or {}
        if windows:
            rows["headlines_window"] = windows  # type: ignore[assignment]
        return rows

    def parse(self, snap: Snapshot) -> dict[str, pd.DataFrame]:
        domains = outlet_domains()
        reg = sources()
        counts: dict[tuple[str, int], dict[str, list[dict]]] = {}
        rows: dict[str, dict] = {}
        unmatched: dict[str, int] = {}
        pages: dict[tuple[str, int], dict[int, tuple[list[str], int, bool]]] = {}  # (iso, year) -> page -> (publish dates, stories, has a next-page token)
        for name in sorted(snap.files):
            m = re.match(r"([A-Z]{3})/(\d{4})_(count_mining|count_cn|count_us|stories_\d+)\.json$", name)
            if not m or not snap.has(name):
                continue
            iso, year, kind = m.group(1), int(m.group(2)), m.group(3)
            try:
                payload = json.loads(snap.path(name).read_text(encoding="utf-8"))
            except (json.JSONDecodeError, UnicodeDecodeError):
                snap.manifest.setdefault("unparsed", []).append(name)
                continue
            if kind.startswith("count_"):
                daily = daily_rows(payload)
                if daily is None:
                    snap.manifest.setdefault("unparsed", []).append(name)
                    continue
                counts.setdefault((iso, year), {})[kind] = daily
                continue
            parsed = story_rows(payload)
            if parsed is None:
                snap.manifest.setdefault("unparsed", []).append(name)
                continue
            stories, token = parsed
            pages.setdefault((iso, year), {})[int(kind.split("_")[1])] = ([d for d in (_publish_date(s) for s in stories) if d], len(stories), bool(token))
            for s in stories:
                row = self._document(s, iso, year, domains, reg, unmatched)
                if row is not None:
                    rows.setdefault(row["doc_id"], row)
        self._windows = headline_windows(pages, counts)
        snap.manifest["headlines_window"] = self._windows
        volume: list[dict] = []
        incomplete: list[str] = []
        for (iso, year), kinds in sorted(counts.items()):
            if any(k not in kinds for k in COUNT_KINDS):
                incomplete.append(f"{iso}/{year}")  # a year with a failed count call is not written, so the ledger plans it again
                continue
            name = f"{iso}/{year}_count_mining.json"
            params = snap.files[name].get("params") or {}
            # only the months that had ended by the request's end date are written (the running month would otherwise be
            # stored half-counted and kept so by the merge); the ledger counts a year as done once its twelve are stored
            mining, cn, us = (month_sums(kinds[k]) for k in COUNT_KINDS)
            for p in complete_months(str(params.get("start", "")), str(params.get("end", ""))):
                volume.append({"country": iso, "period": p, "items_total": mining.get(p, {}).get("total_count", 0),
                               "items_mining": mining.get(p, {}).get("count", 0), "items_cn": cn.get(p, {}).get("count", 0),
                               "items_us": us.get(p, {}).get("count", 0), "source_record_url": snap.files[name].get("url")})
        snap.manifest["incomplete_years"] = incomplete
        snap.manifest["unmatched_domains"] = dict(sorted(unmatched.items(), key=lambda kv: -kv[1])[:30])
        snap.save()
        docs = pd.DataFrame(list(rows.values()), columns=[*DOCUMENT_COLUMNS, "reliability", "original_language"])
        return {"document": self.stamp(snap, docs), "media_volume": self.stamp(snap, pd.DataFrame(volume, columns=MEDIA_VOLUME_COLUMNS))}

    def _document(self, s: dict, iso: str, year: int, domains: dict[str, str], reg: dict, unmatched: dict[str, int]) -> dict | None:
        title = str(s.get("title") or "").strip()
        url = str(s.get("url") or "").strip()
        if not title or not url.startswith("http"):
            return None
        rel = relevance(title)
        if not is_relevant(rel, "news", title):
            return None
        published = str(s.get("publish_date") or "")[:10]
        if re.match(r"^\d{4}-\d{2}-\d{2}$", published):
            date_, prec = published, "day"
        else:
            date_, prec = f"{year}-01-01", "year"
        lang = str(s.get("language") or "").lower()[:2]
        if lang not in ("es", "pt", "en", "nl"):
            lang = self.src.language if self.src.language in ("es", "pt", "en", "nl") else "multi"
        outlet = domains.get(_host(url)) or domains.get(_host(str(s.get("media_url") or "")))
        if outlet is not None and reg[outlet].countries and iso not in reg[outlet].countries:
            outlet = None  # an outlet registered for another country: the collection's country stands, the outlet is not claimed
        if outlet is None:
            d = _host(url)
            unmatched[d] = unmatched.get(d, 0) + 1
        venue = str(s.get("media_name") or "").strip() or (reg[outlet].name if outlet else _host(url))
        row = make_document(source_id=self.source_id, country=iso, doc_type="news", date=date_, date_precision=prec, title=title, language=lang,
                            venue=venue, url=url, rel=rel, outlet_source_id=outlet)
        # a registered outlet's own reliability travels with the headline, as in the GDELT adapter (stamp only fills missing columns)
        row["reliability"] = reg[outlet].reliability if outlet else self.src.reliability
        row["original_language"] = lang
        return row
