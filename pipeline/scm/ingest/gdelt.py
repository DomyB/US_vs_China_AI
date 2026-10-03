"""GDELT 2.0 DOC API -> document (news headlines, history from 2017) and media_volume (window ledger).

Keyless; one query per country and time window, restricted afterwards to the outlets in the
registry (matched on domain) and re-filtered on the headline. GDELT's date is the indexing time,
stored with date_precision "seen". Each run fetches the recent weeks for every country plus a
number of still-missing historical windows (GDELT_BACKFILL_WINDOWS, default 60, about 5 s each),
so the history completes over a few runs or one long manual dispatch.
"""
from __future__ import annotations

import json
import os
import re
from datetime import UTC, date, datetime, timedelta
from urllib.parse import urlsplit

import pandas as pd

from ..http import Snapshot
from ..registry import IN_SCOPE, sources
from .base import Adapter
from .docs import DOCUMENT_COLUMNS, MEDIA_VOLUME_COLUMNS, make_document
from .keywords import is_relevant, relevance

API = "https://api.gdeltproject.org/api/v2/doc/doc"
FIPS = {"ARG": "AR", "BOL": "BL", "BRA": "BR", "CHL": "CI", "COL": "CO", "ECU": "EC", "GUY": "GY", "PRY": "PA", "PER": "PE", "SUR": "NS", "URY": "UY", "VEN": "VE"}
HALF_MONTH = {"BRA", "ARG", "CHL", "PER", "COL"}  # busier press: shorter windows stay under the 250-record cap
HISTORY_FROM = date(2017, 1, 1)
RECENT_DAYS = 35
MAX_RECORDS = 250
# short term sets (GDELT rejects long queries); the headline is re-filtered with the full keyword module afterwards
# GDELT's DOC API matches non-English terms only when the language is named (sourcelang); every Spanish and
# Portuguese window came back empty without it in the first live runs while English windows returned articles
TERMS = {
    "es": '(litio OR cobre OR minería OR minera OR niobio OR "tierras raras") (China OR chino OR chinos OR "Estados Unidos" OR estadounidense) sourcelang:spanish',
    "pt": '(lítio OR cobre OR mineração OR mineradora OR nióbio OR "terras raras") (China OR chinesa OR chineses OR "Estados Unidos" OR EUA) sourcelang:portuguese',
    "en": '(mining OR bauxite OR gold OR lithium OR minerals) (China OR Chinese OR "United States")',
    "nl": '(mijnbouw OR goud OR bauxiet OR olie) (China OR Chinese OR "Verenigde Staten") sourcelang:dutch',
}
# ASCII-only, shorter variants: in the first live run every Spanish and Portuguese window came back empty while
# the English and Dutch ones returned articles, so accented or long queries are suspected; the fallback is tried
# once per empty window and the variant that yields results is recorded in the manifest
TERMS_FALLBACK = {
    "es": '(litio OR cobre OR mineria OR minera) (China OR "Estados Unidos") sourcelang:spanish',
    "pt": '(litio OR cobre OR mineracao OR mineradora OR niobio) (China OR "Estados Unidos") sourcelang:portuguese',
    "en": "(mining OR lithium OR copper) (China OR \"United States\")",
    "nl": "(mijnbouw OR goud OR bauxiet) (China OR \"Verenigde Staten\")",
}
COUNTRY_LANGS = {"BRA": ["pt"], "GUY": ["en"], "SUR": ["nl", "en"]}
# registry press hosts that GDELT reports under another domain
DOMAIN_ALIASES = {"www1.folha.uol.com.br": "bra_folha", "folha.uol.com.br": "bra_folha", "valor.globo.com": "bra_valor", "oglobo.globo.com": "bra_oglobo",
                  "emol.com": "chl_elmercurio", "elmercurio.com": "chl_elmercurio", "larazon.bo": "bol_larazon", "eluniverso.com": "ecu_eluniverso"}


def _host(url: str) -> str:
    h = urlsplit(url).netloc.lower()
    return h[4:] if h.startswith("www.") else h


def outlet_domains() -> dict[str, str]:
    """domain -> press source id, from the registry URLs plus aliases."""
    out: dict[str, str] = {}
    for sid, s in sources().items():
        if s.category == "press" and s.countries:
            out[_host(s.url)] = sid
    out.update(DOMAIN_ALIASES)
    return out


def windows(iso: str, until: date | None = None) -> list[tuple[date, date]]:
    until = until or datetime.now(UTC).date()
    out: list[tuple[date, date]] = []
    start = HISTORY_FROM
    while start <= until:
        if iso in HALF_MONTH:
            end = date(start.year, start.month, 15) if start.day == 1 else (date(start.year + (start.month == 12), start.month % 12 + 1, 1) - timedelta(days=1))
            nxt = end + timedelta(days=1)
        else:
            nxt = date(start.year + (start.month == 12), start.month % 12 + 1, 1)
            end = nxt - timedelta(days=1)
        out.append((start, min(end, until)))
        start = nxt
    return out


class GDELTDoc(Adapter):
    source_id = "gdelt"
    tables = ("document", "media_volume")
    incremental = True
    min_interval = 10.0  # GDELT asks for one request every 5 s; GitHub runners share egress addresses, so go slower
    THROTTLE_SLEEP = 45  # seconds to pause after an HTTP 429 before the next window
    MAX_THROTTLES = 12  # after this many 429s the run stops: the address is being rate-limited
    TIME_BUDGET_MIN = 45  # minutes of fetching per run (GDELT_TIME_BUDGET_MIN); unfetched windows stay in the backlog

    def fetch(self, snap: Snapshot) -> None:
        budget = int(os.environ.get("GDELT_BACKFILL_WINDOWS", "60") or 60)
        only = [c for c in os.environ.get("GDELT_COUNTRIES", "").replace(",", " ").split() if c in IN_SCOPE] or IN_SCOPE
        prev = self.previous_table("media_volume")
        done = set(zip(prev["country"], prev["period"], strict=True)) if prev is not None and not prev.empty else set()
        today = datetime.now(UTC).date()
        recent_from = today - timedelta(days=RECENT_DAYS)
        plan: list[tuple[str, date, date, bool]] = []
        backlog: list[tuple[str, date, date, bool]] = []
        for iso in only:
            for start, end in windows(iso, today):
                if end >= recent_from:
                    plan.append((iso, start, end, True))
                elif (iso, start.isoformat()) not in done:
                    backlog.append((iso, start, end, False))
        plan += backlog[:budget]
        snap.manifest["windows_planned"] = len(plan)
        snap.manifest["windows_backlog"] = max(0, len(backlog) - budget)
        snap.manifest["errors"] = []
        import time

        t0 = time.monotonic()
        time_budget = float(os.environ.get("GDELT_TIME_BUDGET_MIN", str(self.TIME_BUDGET_MIN))) * 60
        for iso, start, end, _recent in plan:
            if time.monotonic() - t0 > time_budget:
                snap.manifest["stopped"] = f"time budget of {time_budget / 60:.0f} min exhausted"
                break
            if snap.manifest.get("throttled", 0) >= self.MAX_THROTTLES:
                snap.manifest["stopped"] = f"{self.MAX_THROTTLES} throttle responses; remaining windows left for the next run"
                break
            for lang in COUNTRY_LANGS.get(iso, ["es"]):
                name = f"{iso}/{start.isoformat()}_{lang}.json"
                params = {"query": f"{TERMS[lang]} sourcecountry:{FIPS[iso]}", "mode": "artlist", "format": "json", "maxrecords": MAX_RECORDS, "sort": "datedesc",
                          "startdatetime": start.strftime("%Y%m%d000000"), "enddatetime": end.strftime("%Y%m%d235959")}
                try:
                    snap.get(API, name, params=params, timeout=60, force=True)
                except Exception as e:  # noqa: BLE001 - keep going; the window stays missing and is retried next run
                    snap.manifest["errors"].append({"name": name, "error": str(e)[:200]})
                    if "429" in str(e):
                        snap.manifest["throttled"] = snap.manifest.get("throttled", 0) + 1
                        time.sleep(self.THROTTLE_SLEEP)
                    continue
                head = snap.path(name).open("rb").read(200).lstrip()
                if not head.startswith((b"{", b"[")):
                    snap.discard(name, f"GDELT answered non-JSON for {name}: {head[:150]!r}")
                    continue
                try:
                    n_arts = len(json.loads(snap.path(name).read_text(encoding="utf-8")).get("articles", []))
                except (json.JSONDecodeError, AttributeError):
                    n_arts = 0
                tally = snap.manifest.setdefault("query_variant_hits", {"primary": 0, "fallback": 0, "empty": 0})
                if n_arts:
                    tally["primary"] += 1
                    snap.manifest.setdefault("primary_works", {})[lang] = True
                    continue
                if snap.manifest.get("primary_works", {}).get(lang):
                    tally["empty"] += 1
                    continue  # the primary form is known to work for this language: an empty window is just empty
                # empty window: try the ASCII-only short query once
                try:
                    snap.get(API, name, params={**params, "query": f"{TERMS_FALLBACK[lang]} sourcecountry:{FIPS[iso]}"}, timeout=60, force=True)
                except Exception as e:  # noqa: BLE001
                    snap.manifest["errors"].append({"name": name + " (fallback)", "error": str(e)[:200]})
                    if "429" in str(e):
                        snap.manifest["throttled"] = snap.manifest.get("throttled", 0) + 1
                        time.sleep(self.THROTTLE_SLEEP)
                    continue
                head = snap.path(name).open("rb").read(200).lstrip()
                if not head.startswith((b"{", b"[")):
                    snap.discard(name, f"GDELT answered non-JSON for {name} (fallback): {head[:150]!r}")
                    continue
                try:
                    n2 = len(json.loads(snap.path(name).read_text(encoding="utf-8")).get("articles", []))
                except (json.JSONDecodeError, AttributeError):
                    n2 = 0
                tally["fallback" if n2 else "empty"] += 1
        snap.save()

    def parse(self, snap: Snapshot) -> dict[str, pd.DataFrame]:
        domains = outlet_domains()
        reg = sources()
        rows: dict[str, dict] = {}
        volume: list[dict] = []
        unmatched: dict[str, int] = {}
        for name, meta in sorted(snap.files.items()):
            m = re.match(r"([A-Z]{3})/(\d{4}-\d{2}-\d{2})_(\w+)\.json$", name)
            if not m or not snap.has(name):
                continue
            iso, period, _lang = m.groups()
            try:
                payload = json.loads(snap.path(name).read_text(encoding="utf-8"))
            except json.JSONDecodeError:
                snap.manifest.setdefault("unparsed", []).append(name)
                continue
            arts = payload.get("articles", []) if isinstance(payload, dict) else []
            if len(arts) >= MAX_RECORDS:
                snap.manifest.setdefault("truncated_windows", []).append(name)
            tot = mining = cn = us = 0
            for a in arts:
                title = str(a.get("title", "")).strip()
                url = str(a.get("url", "")).strip()
                if not title or not url:
                    continue
                rel = relevance(title)
                tot += 1
                mining += rel.mining or bool(rel.minerals)
                cn += rel.mentions_cn
                us += rel.mentions_us
                outlet = domains.get(_host(url)) or domains.get(str(a.get("domain", "")).lower())
                if outlet is None:
                    d = str(a.get("domain") or _host(url))
                    unmatched[d] = unmatched.get(d, 0) + 1
                    continue
                if reg[outlet].countries and iso not in reg[outlet].countries:
                    continue
                if not is_relevant(rel, "news", title):
                    continue
                seen = str(a.get("seendate", ""))
                dm = re.match(r"(\d{4})(\d{2})(\d{2})", seen)
                date_ = f"{dm.group(1)}-{dm.group(2)}-{dm.group(3)}" if dm else period
                lang = reg[outlet].language if reg[outlet].language in ("es", "pt", "en", "nl") else "multi"
                row = make_document(source_id=self.source_id, country=iso, doc_type="news", date=date_, date_precision="seen", title=title, language=lang,
                                    venue=reg[outlet].name, url=url, rel=rel, outlet_source_id=outlet)
                # the outlet's own reliability travels with the headline (stamp only fills missing columns)
                row["reliability"] = reg[outlet].reliability
                row["original_language"] = lang
                rows.setdefault(row["doc_id"], row)
            volume.append({"country": iso, "period": period, "items_total": tot, "items_mining": int(mining), "items_cn": int(cn), "items_us": int(us),
                           "source_record_url": meta.get("url")})
        snap.manifest["unmatched_domains"] = dict(sorted(unmatched.items(), key=lambda kv: -kv[1])[:30])
        snap.save()
        docs = pd.DataFrame(list(rows.values()), columns=[*DOCUMENT_COLUMNS, "reliability", "original_language"])
        return {"document": self.stamp(snap, docs), "media_volume": self.stamp(snap, pd.DataFrame(volume, columns=MEDIA_VOLUME_COLUMNS))}
