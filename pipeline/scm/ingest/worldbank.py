"""World Bank adapters: WDI (macro context), WGI (governance), IDS (debt to China)."""
from __future__ import annotations

import json

import pandas as pd

from ..http import Snapshot
from ..registry import IN_SCOPE
from .base import Adapter

API = "https://api.worldbank.org/v2"
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
    """Worldwide Governance Indicators (database 3). The simple indicator endpoint rejects a date
    range for this database ("Invalid value"), so the advanced sources endpoint is used."""

    source_id = "wb_wgi"
    tables = ("governance",)
    indicators = WGI_INDICATORS

    def fetch(self, snap: Snapshot) -> None:
        for ind in self.indicators:
            snap.get(f"{API}/sources/3/country/{COUNTRIES}/series/{ind}/time/all", f"{ind}.json", params={"format": "json", "per_page": 20000})

    def parse(self, snap: Snapshot) -> dict[str, pd.DataFrame]:
        import json

        rows: list[dict] = []
        for ind, name in self.indicators.items():
            if snap.has(f"{ind}.json"):
                rows += parse_advanced(json.loads(snap.path(f"{ind}.json").read_text()), ind, name)
        df = pd.DataFrame(rows, columns=["country", "year", "indicator", "indicator_name", "value"])
        df["value_type"] = "reported"
        return {"governance": self.stamp(snap, df)}


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
