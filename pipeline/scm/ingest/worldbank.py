"""World Bank adapters: WDI (macro context), WGI (governance), IDS (debt to China)."""
from __future__ import annotations

import json
import re
import zipfile
from urllib.parse import urljoin

import pandas as pd

from ..http import Snapshot
from ..registry import IN_SCOPE
from .base import Adapter
from .util import col, read_any

API = "https://api.worldbank.org/v2"
WGI_SITE = "https://www.govindicators.org"
DATA360 = "https://data360api.worldbank.org/data360/data"
WGI_BULK_CANDIDATES = [f"{WGI_SITE}/data/wgidataset.xlsx", f"{WGI_SITE}/data/wgidataset.csv",
                       f"{WGI_SITE}/sites/default/files/wgidataset.xlsx", f"{WGI_SITE}/sites/default/files/wgidataset.csv"]
WGI_BULK_CODES = {"cc": "CC.EST", "ge": "GE.EST", "pv": "PV.EST", "rl": "RL.EST", "rq": "RQ.EST", "va": "VA.EST"}
COUNTRIES = ";".join(IN_SCOPE)

WDI_INDICATORS = {
    "NY.GDP.MKTP.CD": "GDP (current US$)",
    "TX.VAL.MRCH.CD.WT": "Merchandise exports (current US$)",
    "BX.KLT.DINV.CD.WD": "Foreign direct investment, net inflows (current US$)",
    "TX.VAL.MMTL.ZS.UN": "Ores and metals exports (% of merchandise exports)",
    "NY.GDP.TOTL.RT.ZS": "Total natural resources rents (% of GDP)",
    "NY.GDP.MINR.RT.ZS": "Mineral rents (% of GDP)",
}
WGI_INDICATORS = {
    "CC.EST": "Control of Corruption: Estimate",
    "GE.EST": "Government Effectiveness: Estimate",
    "PV.EST": "Political Stability and Absence of Violence: Estimate",
    "RL.EST": "Rule of Law: Estimate",
    "RQ.EST": "Regulatory Quality: Estimate",
    "VA.EST": "Voice and Accountability: Estimate",
}


def _parse_v2(payload: list, indicator: str, name: str) -> list[dict]:
    rows = []
    if not isinstance(payload, list) or len(payload) < 2 or not payload[1]:
        return rows
    for r in payload[1]:
        iso = r.get("countryiso3code") or ""
        if iso not in IN_SCOPE:
            continue
        rows.append({"country": iso, "year": int(r["date"]), "indicator": indicator, "indicator_name": name, "value": r.get("value")})
    return rows


class _WBBase(Adapter):
    tables = ("governance",)
    indicators: dict[str, str] = {}
    source_param: str | None = None
    date_range = "1996:2026"

    def fetch(self, snap: Snapshot) -> None:
        for ind in self.indicators:
            params = {"format": "json", "per_page": 20000, "date": self.date_range}
            if self.source_param:
                params["source"] = self.source_param
            snap.get(f"{API}/country/{COUNTRIES}/indicator/{ind}", f"{ind}.json", params=params)

    def parse(self, snap: Snapshot) -> dict[str, pd.DataFrame]:
        rows: list[dict] = []
        for ind, name in self.indicators.items():
            if snap.has(f"{ind}.json"):
                payload = json.loads(snap.path(f"{ind}.json").read_text())
                rows += _parse_v2(payload, ind, name)
        df = pd.DataFrame(rows, columns=["country", "year", "indicator", "indicator_name", "value"])
        df["value_type"] = "reported"
        df = self.stamp(snap, df, record_url=f"{API}/country/{COUNTRIES}/indicator/{{indicator}}")
        return {"governance": df}


class WDI(_WBBase):
    source_id = "wb_wdi"
    indicators = WDI_INDICATORS
    date_range = "2000:2026"


def parse_advanced(payload: object, indicator: str, name: str) -> list[dict]:
    """Rows from the /v2/sources/<n>/... endpoint: {"source": {"data": [{"variable": [...], "value": v}]}}."""
    rows: list[dict] = []
    data = payload.get("source", {}).get("data", []) if isinstance(payload, dict) else []
    for d in data:
        dims = {x.get("concept"): x for x in d.get("variable", [])}
        iso = (dims.get("Country") or {}).get("id")
        t = dims.get("Time") or {}
        year = t.get("value") or str(t.get("id", "")).replace("YR", "")
        if iso not in IN_SCOPE or not str(year)[:4].isdigit():
            continue
        rows.append({"country": iso, "year": int(str(year)[:4]), "indicator": indicator, "indicator_name": name, "value": d.get("value")})
    return rows


class WGI(Adapter):
    """Worldwide Governance Indicators. The World Bank API (database 3) answered "Data not found"
    for every request in the first live runs, so after the two API endpoints the adapter falls back
    to the bulk dataset published on govindicators.org (link discovered on the site, then known paths)."""

    source_id = "wb_wgi"
    tables = ("governance",)
    indicators = WGI_INDICATORS

    def fetch(self, snap: Snapshot) -> None:
        got = False
        for ind in self.indicators:
            for suffix, url, params in (
                ("json", f"{API}/country/{COUNTRIES}/indicator/{ind}", {"format": "json", "source": 3, "per_page": 20000}),
                ("adv.json", f"{API}/sources/3/country/{COUNTRIES}/series/{ind}/time/all", {"format": "json", "per_page": 20000}),
            ):
                try:
                    payload = snap.get_json(url, f"{ind}.{suffix}", params=params)
                except Exception as e:  # noqa: BLE001 - try the next endpoint
                    snap.manifest.setdefault("errors", []).append({"name": f"{ind}.{suffix}", "error": str(e)[:300]})
                    continue
                if _has_rows(payload):
                    got = True
                    break
        if not got:
            links: list[str] = []
            try:
                html = snap.get(WGI_SITE, "govindicators.html").read_text(encoding="utf-8", errors="ignore")
                links = [urljoin(WGI_SITE, h) for h in re.findall(r'href="([^"]*wgidataset[^"]*\.(?:xlsx|csv|zip)[^"]*)"', html, re.I)]
                snap.manifest["bulk_links"] = links
            except Exception as e:  # noqa: BLE001
                snap.manifest.setdefault("errors", []).append({"name": "govindicators.html", "error": str(e)[:300]})
            for url in dict.fromkeys(links + WGI_BULK_CANDIDATES):
                ext = url.split("?")[0].rsplit(".", 1)[-1].lower()
                name = f"wgidataset.{ext}"
                try:
                    snap.get(url, name, timeout=600, headers={"Referer": WGI_SITE + "/"})
                except Exception as e:  # noqa: BLE001
                    snap.manifest.setdefault("errors", []).append({"name": url, "error": str(e)[:300]})
                    continue
                if snap.looks_like(name, ext):
                    got = True
                    break
                snap.discard(name, f"{url}: not a {ext} file; starts with {snap.path(name).open('rb').read(120)!r}" if snap.has(name) else f"{url}: empty")
        if not got:
            # 4) World Bank Data360 (the platform WGI moved to): one call per indicator and country
            for ind in self.indicators:
                for iso in IN_SCOPE:
                    try:
                        payload = snap.get_json(DATA360, f"d360_{ind}_{iso}.json", params={"DATABASE_ID": "WB_WGI", "INDICATOR": f"WB_WGI_{ind.replace('.', '_')}", "REF_AREA": iso})
                        if "data360_sample" not in snap.manifest:
                            snap.manifest["data360_sample"] = json.dumps(payload, ensure_ascii=False)[:1500]
                    except Exception as e:  # noqa: BLE001
                        snap.manifest.setdefault("errors", []).append({"name": f"d360_{ind}_{iso}", "error": str(e)[:300]})
                        if iso == IN_SCOPE[0]:
                            break  # the endpoint itself is unavailable; do not repeat 71 times
        snap.save()

    def parse(self, snap: Snapshot) -> dict[str, pd.DataFrame]:
        rows: list[dict] = []
        for ind, name in self.indicators.items():
            for fname in (f"{ind}.json", f"{ind}.adv.json"):
                if not snap.has(fname):
                    continue
                try:
                    payload = json.loads(snap.path(fname).read_text())
                except json.JSONDecodeError:
                    snap.manifest.setdefault("unparsed", []).append(fname)
                    continue
                rows += _parse_v2(payload, ind, name) if isinstance(payload, list) else parse_advanced(payload, ind, name)
        if not rows:
            rows = self._parse_bulk(snap)
        if not rows:
            rows = self._parse_data360(snap)
        df = pd.DataFrame(rows, columns=["country", "year", "indicator", "indicator_name", "value", "source_record_url"])
        df["value_type"] = "reported"
        return {"governance": self.stamp(snap, df)}

    def _parse_data360(self, snap: Snapshot) -> list[dict]:
        rows: list[dict] = []
        for name, meta in snap.files.items():
            if not name.startswith("d360_") or not snap.has(name):
                continue
            ind = name.split("_", 1)[1].rsplit("_", 1)[0]
            try:
                payload = json.loads(snap.path(name).read_text())
            except json.JSONDecodeError:
                continue
            rows += _parse_data360_payload(payload, ind, self.indicators.get(ind, ind), meta.get("url"))
        return rows

    def _parse_bulk(self, snap: Snapshot) -> list[dict]:
        """govindicators.org wgidataset: long format (countryname, code, year, indicator, estimate, ...)
        since the 2024 release; older releases are wide (one column per indicator and statistic)."""
        name = next((n for n in snap.files if n.startswith("wgidataset.") and snap.has(n)), None)
        if name is None:
            return []
        path = snap.path(name)
        if name.endswith(".zip"):
            with zipfile.ZipFile(path) as z:
                inner = next((m for m in z.namelist() if m.lower().endswith((".xlsx", ".csv"))), None)
                if inner is None:
                    return []
                extracted = snap.dir / ("wgidataset_inner." + inner.rsplit(".", 1)[-1].lower())
                extracted.write_bytes(z.read(inner))
                path = extracted
        df = read_any(path)
        df.columns = [str(c).strip().lower() for c in df.columns]
        c_code = col(df, "code", "countrycode", "iso3", "wbcode")
        c_year = col(df, "year")
        url = snap.files[name]["url"]
        rows: list[dict] = []
        if "indicator" in df.columns and "estimate" in df.columns:
            for _, r in df.iterrows():
                iso = str(r[c_code]).upper()
                ind = WGI_BULK_CODES.get(str(r["indicator"]).strip().lower())
                if iso not in IN_SCOPE or ind is None or pd.isna(r["estimate"]) or str(r["estimate"]).strip() in ("", ".."):
                    continue
                rows.append({"country": iso, "year": int(float(r[c_year])), "indicator": ind, "indicator_name": self.indicators[ind], "value": float(r["estimate"]), "source_record_url": url})
            return rows
        for short, ind in WGI_BULK_CODES.items():
            c = col(df, f"{short}.est", f"{short}_est", f"{short}est", required=False)
            if c is None:
                continue
            for _, r in df.iterrows():
                iso = str(r[c_code]).upper()
                if iso not in IN_SCOPE or pd.isna(r[c]) or str(r[c]).strip() in ("", ".."):
                    continue
                rows.append({"country": iso, "year": int(float(r[c_year])), "indicator": ind, "indicator_name": self.indicators[ind], "value": float(r[c]), "source_record_url": url})
        return rows


def _parse_data360_payload(payload: object, indicator: str, name: str, url: str | None) -> list[dict]:
    """Data360 rows: {"value": [{"REF_AREA": "ARG", "TIME_PERIOD": "2022", "OBS_VALUE": "-0.1", ...}]}."""
    rows: list[dict] = []
    values: list = []
    if isinstance(payload, dict):
        for key in ("value", "data", "values", "results", "items"):
            if isinstance(payload.get(key), list):
                values = payload[key]
                break
    elif isinstance(payload, list):
        values = payload
    for r in values:
        if not isinstance(r, dict):
            continue
        low = {str(k).lower(): v for k, v in r.items()}
        iso = str(low.get("ref_area") or low.get("ref_area_id") or low.get("country") or "").upper()
        v = low.get("obs_value", low.get("value"))
        period = str(low.get("time_period") or low.get("time") or low.get("year") or "")[:4]
        if iso not in IN_SCOPE or v in (None, "", "..") or not period.isdigit():
            continue
        try:
            rows.append({"country": iso, "year": int(period), "indicator": indicator, "indicator_name": name, "value": float(v), "source_record_url": url})
        except (TypeError, ValueError):
            continue
    return rows


def _has_rows(payload: object) -> bool:
    if isinstance(payload, list):
        return len(payload) > 1 and bool(payload[1])
    if isinstance(payload, dict):
        return bool(payload.get("source", {}).get("data")) if isinstance(payload.get("source"), dict) else False
    return False


class IDS(Adapter):
    """International Debt Statistics: public and publicly guaranteed debt by creditor (China = 730)."""

    source_id = "wb_ids"
    tables = ("governance",)
    series = {"DT.DOD.DPPG.CD": "PPG external debt stock, by creditor (current US$)",
              "DT.DIS.DPPG.CD": "PPG debt disbursements, by creditor (current US$)"}
    counterparts = {"730": "China", "WLD": "World"}

    def fetch(self, snap: Snapshot) -> None:
        for s in self.series:
            for cp in self.counterparts:
                url = f"{API}/sources/6/country/{COUNTRIES}/series/{s}/counterpart-area/{cp}/time/all"
                snap.get(url, f"{s}_{cp}.json", params={"format": "json", "per_page": 20000})

    def parse(self, snap: Snapshot) -> dict[str, pd.DataFrame]:
        import json

        rows: list[dict] = []
        for s, sname in self.series.items():
            for cp, cpname in self.counterparts.items():
                name = f"{s}_{cp}.json"
                if not snap.has(name):
                    continue
                payload = json.loads(snap.path(name).read_text())
                rows += parse_advanced(payload, f"{s}:{cp}", f"{sname} — creditor: {cpname}")
        df = pd.DataFrame(rows, columns=["country", "year", "indicator", "indicator_name", "value"])
        df["value_type"] = "reported"
        return {"governance": self.stamp(snap, df)}
