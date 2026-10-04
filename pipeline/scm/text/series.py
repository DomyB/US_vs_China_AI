"""Per-country, per-year aggregates of the model outputs for the site (pure pandas, no models)."""
from __future__ import annotations

from datetime import date

import pandas as pd

SEMANA_SPLIT = date(2020, 1, 1)


def outlet_key(outlet_source_id: str | None, when: str | None) -> str | None:
    """Semana (Colombia) changed its editorial line after the 2020 takeover: aggregate it as two outlets."""
    if outlet_source_id == "col_semana" and when and str(when)[:10] < SEMANA_SPLIT.isoformat():
        return "col_semana_pre2020"
    return outlet_source_id


def _mean(series: pd.Series) -> float | None:
    s = pd.to_numeric(series, errors="coerce").dropna()
    return round(float(s.mean()), 3) if len(s) else None


def stance_series(docs: pd.DataFrame, cls: pd.DataFrame) -> dict[str, list[dict]]:
    """{iso3: [{year, stance_us_mean, stance_cn_mean, n_docs}]} over legislative records with a stance row;
    n_docs counts records where at least one actor applies; a mean is null when no record applies that year."""
    if docs.empty or cls.empty:
        return {}
    d = docs[docs["doc_type"] != "news"][["doc_id", "country", "year"]].merge(cls[["doc_id", "stance_us", "stance_cn"]], on="doc_id")
    d = d[d["stance_us"].notna() | d["stance_cn"].notna()]
    out: dict[str, list[dict]] = {}
    for (iso, year), g in d.groupby(["country", "year"]):
        out.setdefault(iso, []).append({"year": int(year), "stance_us_mean": _mean(g["stance_us"]), "stance_cn_mean": _mean(g["stance_cn"]), "n_docs": int(len(g))})
    return {k: sorted(v, key=lambda r: r["year"]) for k, v in out.items()}


def media_series(docs: pd.DataFrame, cls: pd.DataFrame, media_volume: pd.DataFrame | None = None) -> tuple[dict[str, list[dict]], str]:
    """({iso3: [{year, articles_us, articles_cn, total_articles, tone_us, tone_cn}]}, basis). total_articles comes
    from the feed/GDELT window totals (media_volume.items_total) when present for the year, else from the kept headlines."""
    news = docs[docs["doc_type"] == "news"][["doc_id", "country", "year", "mentions_us", "mentions_cn"]].copy()
    if news.empty:
        return {}, "kept_headlines"
    news = news.merge(cls[["doc_id", "tone"]], on="doc_id", how="left") if not cls.empty else news.assign(tone=None)
    totals: dict[tuple[str, int], int] = {}
    basis = "kept_headlines"
    if media_volume is not None and not media_volume.empty:
        mv = media_volume.copy()
        mv["year"] = mv["period"].astype(str).str[:4].astype(int)
        totals = mv.groupby(["country", "year"])["items_total"].sum().to_dict()
        basis = "feed_totals"
    out: dict[str, list[dict]] = {}
    for (iso, year), g in news.groupby(["country", "year"]):
        us, cn = g[g["mentions_us"].astype(bool)], g[g["mentions_cn"].astype(bool)]
        out.setdefault(iso, []).append({"year": int(year), "articles_us": int(len(us)), "articles_cn": int(len(cn)),
                                        "total_articles": int(totals.get((iso, int(year)), len(g))) or int(len(g)),
                                        "tone_us": _mean(us["tone"]), "tone_cn": _mean(cn["tone"])})
    return {k: sorted(v, key=lambda r: r["year"]) for k, v in out.items()}, basis


def narratives(docs: pd.DataFrame, doc_topic: pd.DataFrame, topics: pd.DataFrame, top: int = 5) -> dict[str, list[dict]]:
    """{iso3: [{year, label, share}]}: share of each topic among the country's documents that year (top `top` labels
    plus "other"); the topic run is the one referenced by the doc_topic rows."""
    if docs.empty or doc_topic.empty or topics.empty:
        return {}
    labels = dict(zip(zip(topics["run_id"], topics["topic_id"], strict=True), topics["label"], strict=True))
    d = docs[["doc_id", "country", "year"]].merge(doc_topic[["doc_id", "run_id", "topic_id"]], on="doc_id")
    d["label"] = [labels.get((r, t), f"topic {t}") for r, t in zip(d["run_id"], d["topic_id"], strict=True)]
    out: dict[str, list[dict]] = {}
    for iso, g in d.groupby("country"):
        keep = list(g["label"].value_counts().head(top).index)
        for year, gy in g.groupby("year"):
            counts = gy["label"].where(gy["label"].isin(keep), "other").value_counts()
            n = int(len(gy))
            for label, c in counts.items():
                out.setdefault(iso, []).append({"year": int(year), "label": str(label), "share": round(float(c) / n, 3)})
    return {k: sorted(v, key=lambda r: (r["year"], -r["share"])) for k, v in out.items()}
