"""V-Dem core indices from the vdemdata R package repository (public GitHub) -> governance."""
from __future__ import annotations

import pandas as pd

from ..http import Snapshot
from ..registry import IN_SCOPE
from .base import Adapter

RDATA_URL = "https://github.com/vdeminstitute/vdemdata/raw/master/data/vdem.RData"
INDICES = {
    "v2x_polyarchy": "Electoral democracy index",
    "v2x_libdem": "Liberal democracy index",
    "v2x_corr": "Political corruption index",
    "v2x_rule": "Rule of law index",
    "v2x_freexp_altinf": "Freedom of expression and alternative sources of information",
    "v2x_cspart": "Civil society participation index",
    "v2xnp_client": "Clientelism index",
}


class VDem(Adapter):
    source_id = "vdem"
    tables = ("governance",)

    def fetch(self, snap: Snapshot) -> None:
        snap.get(RDATA_URL, "vdem.RData", timeout=600)

    def parse(self, snap: Snapshot) -> dict[str, pd.DataFrame]:
        import pyreadr

        res = pyreadr.read_r(str(snap.path("vdem.RData")))
        df = next(iter(res.values()))
        keep = [c for c in INDICES if c in df.columns]
        sub = df[df["country_text_id"].isin(IN_SCOPE) & (df["year"] >= 2000)][["country_text_id", "year", *keep]]
        long = sub.melt(id_vars=["country_text_id", "year"], var_name="indicator", value_name="value")
        long = long.rename(columns={"country_text_id": "country"})
        long["indicator_name"] = long["indicator"].map(INDICES)
        long["year"] = long["year"].astype(int)
        long["value_type"] = "reported"
        long["source_record_url"] = RDATA_URL
        return {"governance": self.stamp(snap, long)}
