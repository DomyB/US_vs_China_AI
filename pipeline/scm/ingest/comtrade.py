"""UN Comtrade annual HS6 flows for the 12 countries, with US- and China-reported mirrors.

Keyless: the public preview endpoint returns at most 500 records per call, so calls
are split per reporter and year (and per partner group for the mirrors). With
COMTRADE_KEY set, the subscription endpoint is used with the same splitting.
"""
from __future__ import annotations

import json
import os
from datetime import date

import pandas as pd

from ..http import FetchError, Snapshot
from ..registry import IN_SCOPE, M49, M49_TO_ISO3, hs6_to_mineral
from .base import Adapter

PREVIEW = "https://comtradeapi.un.org/public/v1/preview/C/A/HS"
KEYED = "https://comtradeapi.un.org/data/v1/get/C/A/HS"


class Comtrade(Adapter):
    source_id = "un_comtrade"
    tables = ("trade_flow",)
    min_interval = 1.5

    def __init__(self, years: list[int] | None = None) -> None:
        super().__init__()
        last = date.today().year - 1
        self.years = years or list(range(2008, last + 1))
        self.codes = sorted(hs6_to_mineral())
        self.key = os.environ.get("COMTRADE_KEY")

    def _call(self, snap: Snapshot, name: str, reporter: int, period: int, partners: list[int]) -> None:
        params = {
            "reporterCode": reporter, "period": period, "partnerCode": ",".join(map(str, partners)),
            "cmdCode": ",".join(self.codes), "flowCode": "X,M", "partner2Code": 0, "customsCode": "C00", "motCode": 0,
            "includeDesc": "false",
        }
        url = PREVIEW
        if self.key:
            url = KEYED
            params["subscription-key"] = self.key
            params["maxRecords"] = 250000
        try:
            snap.get(url, name, params=params, allow_statuses=(200,))
        except FetchError as e:
            # record the failure in the manifest and move on; the parser skips missing files
            snap.manifest.setdefault("errors", []).append({"name": name, "error": str(e)[:300]})
            snap.save()

    def fetch(self, snap: Snapshot) -> None:
        sa = [M49[c] for c in IN_SCOPE]
        for iso in IN_SCOPE:
            for y in self.years:
                self._call(snap, f"rep_{iso}_{y}.json", M49[iso], y, [M49["CHN"], M49["USA"], M49["WLD"]])
        # mirrors: China and the US reporting their trade with each South American country
        groups = [sa[i:i + 4] for i in range(0, len(sa), 4)]
        for mirror in ("CHN", "USA"):
            for y in self.years:
                for gi, g in enumerate(groups):
                    self._call(snap, f"mirror_{mirror}_{y}_{gi}.json", M49[mirror], y, g)

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
