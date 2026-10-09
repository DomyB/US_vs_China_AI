"""Concentration and dependence measures from the reported trade flows: the shares of a country's mineral
exports (and imports) that go to (come from) the United States and China, the two-power share, and a
revealed-comparative-advantage index against the pooled twelve-country export basket.

The warehouse holds partner flows for the United States, China and the world total only, so a Herfindahl
index over all destinations is not computable: it is stored as null with the reason, never as a guess."""
from __future__ import annotations

import pandas as pd

NOTE_HHI = "not computable: the warehouse holds partner flows for the United States, China and the world total only"
NOTE_ABSENT = "no row for this partner in the reporter's Comtrade data for the year: read as no reported flow"
NOTE_OVER = "partner value exceeded the reported world total; share capped at 1"
SHARE_COLS = {"US": "USA", "CN": "CHN"}


def _shares(t: pd.DataFrame, flow: str) -> pd.DataFrame:
    """Wide frame per (reporter, year, mineral): wld, usa, chn values for one flow (NaN when the partner row is absent)."""
    f = t[t["flow"] == flow]
    if f.empty:
        return pd.DataFrame(columns=["reporter", "year", "mineral", "WLD", "USA", "CHN"])
    w = f.pivot_table(index=["reporter", "year", "mineral"], columns="partner", values="value_usd", aggfunc="sum").reset_index()
    for p in ("WLD", "USA", "CHN"):
        if p not in w.columns:
            w[p] = float("nan")
    return w[["reporter", "year", "mineral", "WLD", "USA", "CHN"]]


def concentration(trade: pd.DataFrame) -> pd.DataFrame:
    """Long table: country, mineral, year, metric, value, note (see the module docstring for the metrics)."""
    cols = ["country", "mineral", "year", "metric", "value", "note"]
    if trade.empty:
        return pd.DataFrame(columns=cols)
    rows: list[dict] = []
    for flow, suffix, total_metric in (("X", "x", "exports_wld_usd"), ("M", "m", "imports_wld_usd")):
        w = _shares(trade, flow)
        w = w[w["WLD"].notna() & (w["WLD"] > 0)]
        for r in w.itertuples(index=False):
            base = {"country": r.reporter, "mineral": r.mineral, "year": int(r.year)}
            rows.append({**base, "metric": total_metric, "value": float(r.WLD), "note": None})
            shares = {}
            for actor, partner in SHARE_COLS.items():
                v = getattr(r, partner)
                note = None
                if pd.isna(v):
                    v, note = 0.0, NOTE_ABSENT
                share = float(v) / float(r.WLD)
                if share > 1:
                    share, note = 1.0, NOTE_OVER
                shares[actor] = share
                rows.append({**base, "metric": f"share_{actor.lower()}_{suffix}", "value": round(share, 6), "note": note})
            big2 = min(1.0, shares["US"] + shares["CN"])
            rows.append({**base, "metric": f"big2_share_{suffix}", "value": round(big2, 6), "note": None})
            rows.append({**base, "metric": f"share_other_{suffix}", "value": round(max(0.0, 1.0 - big2), 6), "note": None})
            if flow == "X":
                rows.append({**base, "metric": "hhi_export_dest", "value": None, "note": NOTE_HHI})
    out = pd.DataFrame(rows, columns=cols)
    # revealed comparative advantage against the pooled basket of the reporters with data that year
    x = _shares(trade, "X")
    x = x[x["WLD"].notna() & (x["WLD"] > 0)][["reporter", "year", "mineral", "WLD"]]
    if not x.empty:
        totals = x[x["mineral"] == "all"].rename(columns={"WLD": "country_total"})[["reporter", "year", "country_total"]]
        minerals = x[x["mineral"] != "all"].merge(totals, on=["reporter", "year"])
        pool_m = minerals.groupby(["year", "mineral"], as_index=False)["WLD"].sum().rename(columns={"WLD": "pool_mineral"})
        pool_t = minerals.drop_duplicates(["reporter", "year"]).groupby("year", as_index=False)["country_total"].sum().rename(columns={"country_total": "pool_total"})
        m = minerals.merge(pool_m, on=["year", "mineral"]).merge(pool_t, on="year")
        m = m[(m["country_total"] > 0) & (m["pool_total"] > 0) & (m["pool_mineral"] > 0)]
        rca = (m["WLD"] / m["country_total"]) / (m["pool_mineral"] / m["pool_total"])
        extra = pd.DataFrame({"country": m["reporter"], "mineral": m["mineral"], "year": m["year"].astype(int), "metric": "rca_pool",
                              "value": rca.round(4), "note": None})
        out = pd.concat([out, extra[cols]], ignore_index=True)
    return out.sort_values(["country", "mineral", "year", "metric"]).reset_index(drop=True)


def wide(conc: pd.DataFrame, flow: str = "x") -> pd.DataFrame:
    """Helper for the index and the flags: country, mineral, year, share_us, share_cn, wld for one flow."""
    cols = ["country", "mineral", "year", "share_us", "share_cn", "wld"]
    if conc.empty:
        return pd.DataFrame(columns=cols)
    total = "exports_wld_usd" if flow == "x" else "imports_wld_usd"
    keep = conc[conc["metric"].isin([f"share_us_{flow}", f"share_cn_{flow}", total])]
    if keep.empty:
        return pd.DataFrame(columns=cols)
    w = keep.pivot_table(index=["country", "mineral", "year"], columns="metric", values="value", aggfunc="first").reset_index()
    w = w.rename(columns={f"share_us_{flow}": "share_us", f"share_cn_{flow}": "share_cn", total: "wld"})
    for c in ("share_us", "share_cn", "wld"):
        if c not in w.columns:
            w[c] = float("nan")
    return w[cols]
