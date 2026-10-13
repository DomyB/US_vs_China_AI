"""IMF Direct Investment Positions by counterpart economy (DIP, the former CDIS) -> investment_position.

The SDMX 3.0 service answers JSON for a key COUNTRY.DV_TYPE.INDICATOR.COUNTERPART_COUNTRY.FREQUENCY. The adapter
asks, for each country in scope and each counterpart of interest (China, the United States, Hong Kong SAR, through
which much Chinese capital is routed), the headline inward position (net liabilities, all instruments, all
entities) on both bases the survey publishes: the country's own report (DV_TYPE O) and the counterpart's report of
the same position (SCC, "derived"). Values are US dollars as the IMF publishes them; a year with no observation is
absent, never zero. Probed from the runner on 2026-10-13 (DECISIONS 90): the key format, the ISO3 codes and the two
bases were read from the service's availability answer.
"""
from __future__ import annotations

import json

import pandas as pd

from ..http import Snapshot
from ..registry import IN_SCOPE
from .base import Adapter

API = "https://api.imf.org/external/sdmx/3.0/data/dataflow/IMF.STA/DIP/+"
COUNTERPARTS = ("CHN", "USA", "HKG")
INDICATORS = {"INWD_D_NETLA_FALL_ALL": ("inward", "Inward direct investment position, net liabilities, all instruments, all entities")}
BASIS = {"O": "reported", "SCC": "derived"}
COLUMNS = ["country", "counterpart", "year", "direction", "indicator", "indicator_name", "basis", "value_usd", "value_type", "source_record_url"]


def parse_sdmx_json(payload: dict) -> list[dict]:
    """Rows {dims: {id: code}, period, value} from an SDMX-JSON 2.0 data message (structures[0] describes the keys)."""
    data = payload.get("data", payload)
    structures = data.get("structures") or []
    datasets = data.get("dataSets") or []
    out: list[dict] = []
    for ds in datasets:
        st = structures[ds.get("structure", 0)] if structures else None
        if not st:
            continue
        dims = st.get("dimensions", {})
        series_dims = dims.get("series", [])
        obs_dims = dims.get("observation", [])
        time_values = next((d.get("values", []) for d in obs_dims if d.get("id") == "TIME_PERIOD"), [])
        for key, series in (ds.get("series") or {}).items():
            idx = [int(x) for x in key.split(":")]
            codes = {}
            for d, i in zip(series_dims, idx, strict=False):
                vals = d.get("values", [])
                codes[d.get("id")] = vals[i].get("id") if i < len(vals) else None
            for oi, obs in (series.get("observations") or {}).items():
                ti = int(oi)
                tv = time_values[ti] if ti < len(time_values) else {}
                period = tv.get("id") or tv.get("value")  # the IMF writes the period under "value"
                value = obs[0] if isinstance(obs, list) and obs else None
                if value is None:
                    continue  # a confidential or empty cell (status "C") is absent, never a zero
                out.append({"dims": codes, "period": period, "value": value})
    return out


class IMFDIP(Adapter):
    source_id = "imf_dip"
    tables = ("investment_position",)

    def fetch(self, snap: Snapshot) -> None:
        for iso in IN_SCOPE:
            for cp in COUNTERPARTS:
                for ind in INDICATORS:
                    snap.get(f"{API}/{iso}.*.{ind}.{cp}.A", f"{iso}_{cp}_{ind}.json", headers={"Accept": "application/json"}, allow_statuses=(200, 404))

    def parse(self, snap: Snapshot) -> dict[str, pd.DataFrame]:
        rows: list[dict] = []
        for name in sorted(snap.files):
            if not name.endswith(".json") or not snap.has(name):
                continue
            try:
                payload = json.loads(snap.path(name).read_text(encoding="utf-8"))
            except json.JSONDecodeError:
                continue
            if not isinstance(payload, dict):
                continue
            for r in parse_sdmx_json(payload):
                d = r["dims"]
                country, cp, ind, dv = d.get("COUNTRY"), d.get("COUNTERPART_COUNTRY"), d.get("INDICATOR"), d.get("DV_TYPE")
                if country not in IN_SCOPE or ind not in INDICATORS or dv not in BASIS or not r["period"]:
                    continue
                try:
                    year = int(str(r["period"])[:4])
                    value = None if r["value"] in (None, "", "NA") else float(r["value"])
                except (TypeError, ValueError):
                    continue
                direction, label = INDICATORS[ind]
                rows.append({"country": country, "counterpart": cp, "year": year, "direction": direction, "indicator": ind, "indicator_name": label,
                             "basis": BASIS[dv], "value_usd": value, "value_type": "reported", "source_record_url": f"{API}/{country}.{dv}.{ind}.{cp}.A"})
        return {"investment_position": self.stamp(snap, pd.DataFrame(rows, columns=COLUMNS))}
