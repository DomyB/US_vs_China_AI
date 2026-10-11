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


MEDIACLOUD = "mediacloud"
WINDOW_SOURCES = ("gdelt", MEDIACLOUD)  # sources whose media_volume rows are disjoint windows (half-months, months): summed into the month
MONTHLY_COUNTS = ("items_total", "items_mining", "items_cn", "items_us")
MONTH_KEYS = ["country", "period", "source_id"]


def media_series(docs: pd.DataFrame, cls: pd.DataFrame, media_volume: pd.DataFrame | None = None) -> tuple[dict[str, list[dict]], str]:
    """({iso3: [{year, basis, articles_us, articles_cn, articles_us_mediacloud, articles_cn_mediacloud, total_articles,
    tone_us, tone_cn}]}, basis).

    total_articles is the sum of the monthly items_total of the feeds and the GDELT windows (`monthly_frame`: a feed
    counts once a month, at its fullest fetch, so the denominator does not grow with the number of fetches) when the
    year has any; the row's `basis` is then "feed_totals" and articles_us / articles_cn count the kept headlines of
    those same sources, while the Media Cloud headlines of the year are counted apart in articles_us_mediacloud /
    articles_cn_mediacloud (Media Cloud's own totals are a whole national collection, tens of thousands of stories a
    month, so they are never in the denominator and its headlines never in the numerator). A year without such totals
    falls back to the kept headlines of every source (`basis` "kept_headlines", total_articles = their number). The
    tone means are over every kept headline that names the actor."""
    cols = ["doc_id", "country", "year", "mentions_us", "mentions_cn"] + (["source_id"] if "source_id" in docs.columns else [])
    news = docs[docs["doc_type"] == "news"][cols].copy()
    if news.empty:
        return {}, "kept_headlines"
    news = news.merge(cls[["doc_id", "tone"]], on="doc_id", how="left") if not cls.empty else news.assign(tone=None)
    news["_mediacloud"] = news["source_id"].astype(str).eq(MEDIACLOUD) if "source_id" in news.columns else False
    totals: dict[tuple[str, int], int] = {}
    basis = "kept_headlines"
    monthly = monthly_frame(media_volume)
    if monthly is not None:
        mv = monthly[~monthly["source_id"].astype(str).eq(MEDIACLOUD)].copy()
        mv["year"] = mv["period"].astype(str).str[:4].astype(int)
        totals = {k: int(v) for k, v in mv.groupby(["country", "year"])["items_total"].sum().to_dict().items()}
        basis = "feed_totals"
    out: dict[str, list[dict]] = {}
    for (iso, year), g in news.groupby(["country", "year"]):
        total = totals.get((iso, int(year)), 0)
        row_basis = "feed_totals" if total > 0 else "kept_headlines"
        counted = g[~g["_mediacloud"]] if row_basis == "feed_totals" else g
        mc = g[g["_mediacloud"]]
        us_all, cn_all = g[g["mentions_us"].astype(bool)], g[g["mentions_cn"].astype(bool)]
        out.setdefault(iso, []).append({"year": int(year), "basis": row_basis,
                                        "articles_us": int(counted["mentions_us"].astype(bool).sum()), "articles_cn": int(counted["mentions_cn"].astype(bool).sum()),
                                        "articles_us_mediacloud": int(mc["mentions_us"].astype(bool).sum()), "articles_cn_mediacloud": int(mc["mentions_cn"].astype(bool).sum()),
                                        "total_articles": total if row_basis == "feed_totals" else int(len(g)),
                                        "tone_us": _mean(us_all["tone"]), "tone_cn": _mean(cn_all["tone"])})
    return {k: sorted(v, key=lambda r: r["year"]) for k, v in out.items()}, basis


def monthly_frame(media_volume: pd.DataFrame | None) -> pd.DataFrame | None:
    """One row per (country, period "YYYY-MM", source_id) with the four counts and `n_fetches`, or None without rows.

    GDELT windows (half-months) and Media Cloud months are disjoint, so their rows are summed into the calendar month.
    A feed's rows are fetch days of the same rolling list (weekly runs: four or five a month, mostly the same headlines),
    so they are never summed: the month's row is the feed's fullest fetch (the one that exposed the most items), all
    four counts taken from that same fetch so that items_mining / items_total stays the share the parser measured, and
    `n_fetches` says how many fetches the month had. (The kept `document` rows are not used here: the parser flags a
    feed item as mineral-related when it names a mineral OR mining, while a kept document's `mining_related` flag is
    the mining term alone, so counting documents would understate the feed's own measure.)"""
    if media_volume is None or media_volume.empty:
        return None
    mv = media_volume.copy()
    if "source_id" not in mv.columns:
        mv["source_id"] = ""  # rows of unknown source (older frames, test fixtures) are summed like windows
    mv = mv[[*MONTH_KEYS, *MONTHLY_COUNTS]].copy()
    mv["period"] = mv["period"].astype(str).str[:7]
    mv["source_id"] = mv["source_id"].astype(str)
    for c in MONTHLY_COUNTS:
        mv[c] = pd.to_numeric(mv[c], errors="coerce").fillna(0).astype(int)
    is_window = mv["source_id"].isin(WINDOW_SOURCES) | (mv["source_id"] == "")
    windows = mv[is_window].groupby(MONTH_KEYS, as_index=False)[list(MONTHLY_COUNTS)].sum()
    fetches = mv[~is_window]
    feeds = fetches.sort_values("items_total", ascending=False).drop_duplicates(MONTH_KEYS, keep="first").copy()
    sizes = fetches.groupby(MONTH_KEYS).size()
    feeds["n_fetches"] = [int(sizes.get(k, 1)) for k in zip(feeds["country"], feeds["period"], feeds["source_id"], strict=True)]
    return pd.concat([windows, feeds], ignore_index=True).sort_values(MONTH_KEYS).reset_index(drop=True)


def media_monthly(media_volume: pd.DataFrame | None) -> dict[str, list[dict]]:
    """{iso3: [{period: "YYYY-MM", source_id, items_total, items_mining, items_cn, items_us, n_fetches?}]}: the history
    rows of the media files, one per source and month (see `monthly_frame`); `n_fetches` on feed rows only."""
    g = monthly_frame(media_volume)
    if g is None:
        return {}
    out: dict[str, list[dict]] = {}
    for r in g.itertuples(index=False):
        row = {"period": str(r.period), "source_id": str(r.source_id), **{c: int(getattr(r, c)) for c in MONTHLY_COUNTS}}
        if pd.notna(r.n_fetches):  # NaN on the summed window rows
            row["n_fetches"] = int(r.n_fetches)
        out.setdefault(str(r.country), []).append(row)
    return out


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
