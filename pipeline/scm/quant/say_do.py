"""Say–do gap: what a legislature says about an actor against how the country's economic ties with that actor move.

rhetoric = mean stance toward the actor in the year's scored legislative records (at least five), standardised
within the actor over every country-year with a value; action = year-on-year change of the economic-ties
sub-index (trade shares, finance, debt), standardised the same way; gap = rhetoric − action. Positive: words
warmer than the flows; negative: flows outrun the words. The rhetoric side is a text-model output and carries
the classifier's status label."""
from __future__ import annotations

import pandas as pd

from .index import MIN_DOCS

MAX_EVIDENCE = 60  # doc ids kept per row


def _z(s: pd.Series) -> pd.Series:
    sd = s.std(ddof=0)
    if pd.isna(sd) or sd == 0:
        return pd.Series([float("nan")] * len(s), index=s.index)
    return (s - s.mean()) / sd


def say_do(stance: pd.DataFrame, index_df: pd.DataFrame, text_label: str | None) -> pd.DataFrame:
    cols = ["country", "year", "actor", "rhetoric", "action", "gap", "n_docs", "evidence_doc_ids", "text_model_status"]
    if stance.empty:
        return pd.DataFrame(columns=cols)
    rh = stance.groupby(["country", "year", "actor"]).agg(mean=("stance", "mean"), n_docs=("stance", "size"),
                                                           ids=("doc_id", lambda s: "|".join(sorted(map(str, s))[:MAX_EVIDENCE]))).reset_index()
    rh = rh[rh["n_docs"] >= MIN_DOCS].copy()
    if rh.empty:
        return pd.DataFrame(columns=cols)
    econ = index_df[(index_df["index_name"] == "economic_ties") & (index_df["mineral"] == "all") & index_df["value"].notna()][["country", "year", "actor", "value"]]
    prev = econ.assign(year=econ["year"] + 1).rename(columns={"value": "prev"})
    act = econ.merge(prev, on=["country", "year", "actor"])
    act["delta"] = act["value"] - act["prev"]
    out = []
    for actor in ("US", "CN"):
        r = rh[rh["actor"] == actor].copy()
        if r.empty:
            continue
        r["rhetoric"] = _z(r["mean"].astype(float))
        a = act[act["actor"] == actor].copy()
        a["action"] = _z(a["delta"].astype(float)) if not a.empty else pd.Series(dtype=float)
        merged = r.merge(a[["country", "year", "action"]] if not a.empty else pd.DataFrame(columns=["country", "year", "action"]), on=["country", "year"], how="left")
        merged["gap"] = merged["rhetoric"] - merged["action"]
        out.append(merged)
    if not out:
        return pd.DataFrame(columns=cols)
    df = pd.concat(out, ignore_index=True)
    df = df.assign(rhetoric=df["rhetoric"].round(3), action=df["action"].round(3), gap=df["gap"].round(3), n_docs=df["n_docs"].astype(int),
                   evidence_doc_ids=df["ids"], text_model_status=text_label or "no classifier has run")
    return df[cols].sort_values(["country", "actor", "year"]).reset_index(drop=True)
