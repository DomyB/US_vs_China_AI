"""UN Comtrade annual HS6 flows for the 12 countries, with US- and China-reported mirrors.

Keyless: the public preview endpoint returns at most 500 records per call, so calls
are split per reporter and year (and per partner group for the mirrors). With
COMTRADE_KEY set, the subscription endpoint is used with the same splitting.
"""
from __future__ import annotations

import json
import os
import re
from datetime import date

import pandas as pd

from ..http import FetchError, Snapshot
from ..period import PERIOD_FROM
from ..registry import IN_SCOPE, M49, M49_TO_ISO3, hs6_to_mineral
from .base import Adapter

PREVIEW = "https://comtradeapi.un.org/public/v1/preview/C/A/HS"
KEYED = "https://comtradeapi.un.org/data/v1/get/C/A/HS"


MAX_QUOTA_FAILURES = 3
PROBE_CODE = "260300"  # copper ores and concentrates: in every HS edition, so a 400 on it alone is about the years, not the codes
CHUNK_ANCHOR = 2008  # chunks are aligned on 2008 so the file names of the 2008+ fetches (and the recorded fixtures) do not move with the period


def chunk_years(years: list[int], per_call: int) -> list[list[int]]:
    """Consecutive year chunks of at most per_call years, the years before CHUNK_ANCHOR chunked on their own."""
    before = [y for y in years if y < CHUNK_ANCHOR]
    after = [y for y in years if y >= CHUNK_ANCHOR]
    chunks = [before[i:i + per_call] for i in range(0, len(before), per_call)] + [after[i:i + per_call] for i in range(0, len(after), per_call)]
    return [c for c in chunks if c]


class Comtrade(Adapter):
    source_id = "un_comtrade"
    tables = ("trade_flow",)
    min_interval = 2.5

    def __init__(self, years: list[int] | None = None) -> None:
        super().__init__()
        last = date.today().year - 1
        self.years = years or list(range(PERIOD_FROM, last + 1))
        self.codes = sorted(hs6_to_mineral())
        self.key = os.environ.get("COMTRADE_KEY")
        self._quota_failures = 0  # consecutive calls refused with 429/403/503 after back-off
        self._last_status: int | None = None  # the HTTP status of the last failed call
        self._rejected: dict[tuple[int, ...], set[str]] = {}  # codes the API refused for a chunk of years, learnt by halving

    def _call(self, snap: Snapshot, name: str, reporter: int, periods: list[int], partners: list[int], codes: list[str] | None = None) -> dict | None:
        """One preview/keyed call; returns the parsed payload (or None on failure). Backs off on 429/403; a 400 is
        recorded with its body (the API's reason) and returned at once."""
        import json as _json
        import time as _time

        codes = self.codes if codes is None else codes
        params = {
            "reporterCode": reporter, "period": ",".join(map(str, periods)), "partnerCode": ",".join(map(str, partners)),
            "cmdCode": ",".join(codes), "flowCode": "X,M", "partner2Code": 0, "customsCode": "C00", "motCode": 0,
            "includeDesc": "false", "maxRecords": 500,
        }
        url = PREVIEW
        if self.key:
            url = KEYED
            params["subscription-key"] = self.key
            params["maxRecords"] = 250000
        self._last_status = None
        for attempt in range(4):
            try:
                path = snap.get(url, name, params=params, allow_statuses=(200,))
                self._quota_failures = 0
                return _json.loads(path.read_text(encoding="utf-8"))
            except FetchError as e:
                msg = str(e)
                m = re.search(r"HTTP (\d{3})", msg)
                self._last_status = int(m.group(1)) if m else None
                # keep the start (the status) and the end (the API's body) of the message: the URL in between is long
                snap.manifest.setdefault("errors", []).append({"name": name, "attempt": attempt, "error": msg[:120] + (" … " + msg[-380:] if len(msg) > 500 else msg[120:])})
                snap.save()
                # the refusal is read from the status, never from the message: the request URL carries HS codes such
                # as 740311 and 250490 that contain "403" and "503", which once turned a 400 into a quota refusal
                if self._last_status in (429, 403, 503):
                    _time.sleep(65 * (attempt + 1))
                    continue
                return None
        # every attempt was refused: count it, and stop once the refusal is clearly the day's quota
        self._quota_failures += 1
        if self._quota_failures >= MAX_QUOTA_FAILURES:
            raise RuntimeError(
                f"un_comtrade: {self._quota_failures} consecutive calls refused (429/403/503) after back-off; the "
                "preview API's quota for this address is spent (another run fetched Comtrade earlier today?) - "
                "the previous release's trade_flow is kept; rerun tomorrow or set COMTRADE_KEY"
            )
        return None

    def _fetch_one(self, snap: Snapshot, name: str, reporter: int, periods: list[int], partners: list[int], codes: list[str]) -> dict | None:
        """One chunk with one code list; a response truncated at the record cap is refetched year by year."""
        payload = self._call(snap, name, reporter, periods, partners, codes)
        if payload is None:
            return None
        count = int(payload.get("count") or 0)
        got = len(payload.get("data") or [])
        if count > got or (not self.key and got >= 500):
            snap.manifest.setdefault("truncated", []).append(name)
            for y in periods:
                self._call(snap, f"{name[:-5]}_{y}.json", reporter, [y], partners, codes)
            snap.path(name).unlink(missing_ok=True)
            snap.files.pop(name, None)
            snap.save()
        return payload

    def _fetch_bisecting(self, snap: Snapshot, name: str, reporter: int, periods: list[int], partners: list[int], codes: list[str]) -> None:
        """The API answers 400 when a requested code does not exist in the HS edition the reporter used for those
        years ("HS as reported": 811292, for one, only exists from the 2007 edition). Find the codes it rejects by
        halving the list, fetch the rest in parts, and remember the rejects so the other reporters' same years skip
        them (the manifest lists them under rejected_codes)."""
        key = tuple(periods)
        rejected = self._rejected.setdefault(key, set())
        # one probe with a code every edition has had since 1988: a 400 on it means the API refuses the years
        # themselves on this endpoint (the keyed one may not), so the range is skipped for every reporter at once
        if PROBE_CODE in codes:
            probe_name = f"{name[:-5]}_c{PROBE_CODE}.json"
            if self._fetch_one(snap, probe_name, reporter, periods, partners, [PROBE_CODE]) is None:
                if self._last_status == 400:
                    if periods[0] >= CHUNK_ANCHOR:
                        # these years were fetched by earlier runs with the same request: the endpoint is refusing
                        # everything (quota, outage), so stop and keep the previous release's rows
                        raise RuntimeError(
                            f"un_comtrade: the endpoint answers 400 even to a one-code request for {periods[0]}–{periods[-1]}, "
                            "years earlier runs fetched; quota or outage on this address - the previous release's trade_flow "
                            "is kept; rerun later or set COMTRADE_KEY"
                        )
                    rejected.update(codes)
                    snap.manifest.setdefault("rejected_periods", []).append(f"{periods[0]}-{periods[-1]}")
                    snap.save()
                return
            codes = [c for c in codes if c != PROBE_CODE]
        stack: list[list[str]] = [codes]
        while stack:
            part = stack.pop()
            part_name = f"{name[:-5]}_c{part[0]}-{part[-1]}.json"
            if self._fetch_one(snap, part_name, reporter, periods, partners, part) is not None:
                continue
            if self._last_status != 400:
                return  # a refusal or a dropped connection: nothing more to learn from this chunk
            if len(part) == 1:
                rejected.add(part[0])
                snap.manifest.setdefault("rejected_codes", {})[f"{periods[0]}-{periods[-1]}"] = sorted(rejected)
                snap.save()
                continue
            mid = len(part) // 2
            stack.append(part[:mid])
            stack.append(part[mid:])

    def _fetch_chunked(self, snap: Snapshot, prefix: str, reporter: int, partners: list[int], years_per_call: int) -> None:
        """Fetch several years per call; if a response is truncated at the record cap, refetch year by year."""
        for chunk in chunk_years(self.years, years_per_call):
            name = f"{prefix}_{chunk[0]}-{chunk[-1]}.json"
            known = self._rejected.get(tuple(chunk), set())
            codes = [c for c in self.codes if c not in known]
            if not codes:
                continue
            payload = self._fetch_one(snap, name, reporter, chunk, partners, codes)
            if payload is None and self._last_status == 400 and len(codes) > 1:
                self._fetch_bisecting(snap, name, reporter, chunk, partners, codes)

    def fetch(self, snap: Snapshot) -> None:
        # reported: 12 reporters, partners China / US / World, 3 years per call (max observed 168 rows per year)
        for iso in IN_SCOPE:
            self._fetch_chunked(snap, f"rep_{iso}", M49[iso], [M49["CHN"], M49["USA"], M49["WLD"]], years_per_call=3)
        # mirrors: China and the US reporting their trade with each South American country, 6 years per call
        for mirror in ("CHN", "USA"):
            for iso in IN_SCOPE:
                self._fetch_chunked(snap, f"mirror_{mirror}_{iso}", M49[mirror], [M49[iso]], years_per_call=6)
        if not any(snap.has(n) for n in snap.files):
            raise RuntimeError("un_comtrade: no response was stored (every request was refused); the previous release's trade_flow is kept")

    def parse(self, snap: Snapshot) -> dict[str, pd.DataFrame]:
        mapping = hs6_to_mineral()
        rows: list[dict] = []
        for name, meta in snap.files.items():
            if not name.endswith(".json") or not snap.has(name):
                continue
            payload = json.loads(snap.path(name).read_text())
            for r in payload.get("data", []):
                rep = M49_TO_ISO3.get(int(r.get("reporterCode", -1)))
                par = M49_TO_ISO3.get(int(r.get("partnerCode", -1)))
                code = str(r.get("cmdCode", "")).zfill(6)
                if rep is None or par is None or code not in mapping:
                    continue
                flow = r.get("flowCode")
                if flow not in ("X", "M"):
                    continue
                mineral, stage = mapping[code]
                if name.startswith("rep_"):
                    reporter, partner, value_type, out_flow = rep, par, "reported", flow
                else:
                    # mirror: China's import from Argentina is Argentina's export to China
                    reporter, partner, value_type, out_flow = par, rep, "mirror", ("X" if flow == "M" else "M")
                rows.append({
                    "reporter": reporter, "partner": partner, "reported_by": rep, "hs6": code, "mineral": mineral, "stage": stage,
                    "year": int(r.get("refYear") or r.get("period")), "month": pd.NA, "flow": out_flow,
                    "value_usd": float(r.get("primaryValue") or 0.0), "qty": r.get("netWgt") or r.get("qty"),
                    "qty_unit": "kg" if r.get("netWgt") else r.get("qtyUnitAbbr"), "value_type": value_type,
                    "source_record_url": meta.get("url"),
                })
        df = pd.DataFrame(rows)
        if df.empty:
            df = pd.DataFrame(columns=["reporter", "partner", "reported_by", "hs6", "mineral", "stage", "year", "month", "flow", "value_usd", "qty", "qty_unit", "value_type", "source_record_url"])
        return {"trade_flow": self.stamp(snap, df)}
