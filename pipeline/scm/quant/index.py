"""Composite influence index per country, year, actor and mineral, built along the OECD/JRC handbook steps:
component selection (six observable ties to the actor), no imputation (a missing input leaves the component
unavailable and the index rests on the rest, never on fewer than three), winsorised min–max normalisation pooled
over the country × year × actor panel (the mineral "all" rows, both actors on one scale; the same bounds apply to
the per-mineral rows), equal weights renormalised over the available components, arithmetic aggregation, and an
uncertainty analysis: weights redrawn from a Dirichlet around equal weights and the normalisation switched to
percentile ranks in half of the draws; the 5th–95th percentile band is stored with every value and the rank
stability (mean Spearman correlation of the perturbed rankings with the baseline) is reported for the methodology
page. A composite is held back (null, with its components still listed) in a year where a component it rested on
the year before is missing only because its source's release lags (`LAG_YEARS`), so a late release never changes
the index's composition silently; a source that stopped years ago is an ended series and the index goes on without it."""
from __future__ import annotations

from datetime import UTC, datetime

import numpy as np
import pandas as pd

from ..period import PERIOD_FROM
from ..registry import IN_SCOPE
from .concentration import wide
from .inputs import Inputs

MIN_COMPONENTS = 3  # the composite is computed only from this many components upward
MIN_DOCS = 5  # scored legislative records needed for a stance component
ROLLING_YEARS = 3  # finance commitments are summed over this many years
WINSOR = (2.5, 97.5)
DIRICHLET_ALPHA = 10.0  # concentration of the weight draws around equal weights
RANK_SHARE = 0.5  # share of draws that use percentile-rank normalisation instead of min–max
MIN_RANKED = 6  # countries needed in a year to measure rank stability
FIRST_YEAR = PERIOD_FROM
LAG_YEARS = 2  # a source whose last year is within this many years of the current year is lagging, not ended
COVERAGE_NOTE = "source coverage ends "  # the note a component carries beyond its source's last year

# name, group, definition, registry source ids
COMPONENTS: list[tuple[str, str, str, list[str]]] = [
    ("trade_export_share", "economic_ties", "Share of the country's mineral exports (reported to UN Comtrade) that go to the actor.", ["un_comtrade"]),
    ("trade_import_share", "economic_ties", "Share of the country's mineral imports that come from the actor.", ["un_comtrade"]),
    ("finance_flow", "economic_ties", "Documented official-finance commitments from the actor's institutions over the last three years, relative to GDP; central-bank swap-line drawdowns excluded.", ["aiddata_gcdf", "dfc_projects", "exim_authorizations", "wb_wdi"]),
    ("debt_stock", "economic_ties", "Public and publicly guaranteed external debt owed to the actor, relative to GDP (World Bank IDS reports China as a creditor; no equivalent source exists for the United States).", ["wb_ids", "wb_wdi"]),
    ("diplomatic_alignment", "political_alignment", "UN General Assembly voting agreement with the actor in the year.", ["unga_votes"]),
    ("legislative_stance", "political_alignment", "Mean stance toward the actor (−2 to +2) in the legislature's mineral-related records, years with at least five scored records; a text-model output carried with its validation status.", []),
]
NAMES = [c[0] for c in COMPONENTS]
GROUPS = {"economic_ties": 2, "political_alignment": 1}  # minimum available components per sub-index
# the registry sources behind each actor's finance component (AidData for China; the DFC and EXIM for the United States)
FINANCE_SOURCES: dict[str, list[str]] = {"US": ["dfc_projects", "exim_authorizations"], "CN": ["aiddata_gcdf"]}
FINANCE_SOURCE = {actor: ",".join(ids) for actor, ids in FINANCE_SOURCES.items()}  # the same, comma-joined


def _lookup(df: pd.DataFrame, keys: list[str], value: str) -> dict:
    if df.empty:
        return {}
    return dict(zip(map(tuple, df[keys].itertuples(index=False, name=None)), df[value], strict=True))


def _row(base: dict, name: str, value: float | None, note: str | None, source_ids: str) -> dict:
    ok = value is not None and not pd.isna(value)
    return {**base, "component": name, "raw_value": float(value) if ok else None, "available": bool(ok),
            "note": None if ok else (note or "no data"), "source_ids": source_ids}


def components(inp: Inputs, conc: pd.DataFrame) -> pd.DataFrame:
    """One row per (country, year, actor, mineral, component) with the raw value, whether it is available and why not."""
    years = [y for y in inp.years if y >= FIRST_YEAR]
    cols = ["country", "year", "actor", "mineral", "component", "raw_value", "available", "note", "source_ids"]
    if not years:
        return pd.DataFrame(columns=cols)
    ex, im = wide(conc, "x"), wide(conc, "m")
    ex_l = {(r.country, r.mineral, r.year): (r.share_us, r.share_cn) for r in ex.itertuples(index=False)}
    im_l = {(r.country, r.mineral, r.year): (r.share_us, r.share_cn) for r in im.itertuples(index=False)}
    gdp = _lookup(inp.gdp, ["country", "year"], "value")
    unga = _lookup(inp.unga, ["country", "year", "actor"], "value")
    debt = _lookup(inp.debt_cn, ["country", "year"], "value")
    fin = inp.finance[inp.finance["documented"] & ~inp.finance["swap"] & inp.finance["amount_usd"].notna()] if not inp.finance.empty else inp.finance
    fin_year = fin.groupby(["country", "origin", "year"])["amount_usd"].sum().to_dict() if not fin.empty else {}
    # the sources the summed rows came from, so a window of EXIM-only rows is never attributed to the DFC
    fin_src = (fin.groupby(["country", "origin", "year"])["source_id"].agg(lambda s: {str(x) for x in s.dropna() if str(x)}).to_dict()
               if not fin.empty and "source_id" in fin.columns else {})
    stance = inp.stance.groupby(["country", "year", "actor"]).agg(mean=("stance", "mean"), n=("stance", "size")).to_dict("index") if not inp.stance.empty else {}
    leg_sources = sorted(inp.stance["source_id"].unique()) if not inp.stance.empty else []
    src = {name: ",".join(ids) for name, _, _, ids in COMPONENTS}
    src["legislative_stance"] = ",".join(leg_sources)
    rows: list[dict] = []
    for iso in IN_SCOPE:
        for year in years:
            g = gdp.get((iso, year))
            for actor in ("US", "CN"):
                for mineral in ["all", *inp.minerals]:
                    e, m = ex_l.get((iso, mineral, year)), im_l.get((iso, mineral, year))
                    if mineral != "all" and e is None and m is None:
                        continue  # the country did not trade that mineral in the year: no mineral-specific index
                    base = {"country": iso, "year": year, "actor": actor, "mineral": mineral}
                    k = 0 if actor == "US" else 1

                    def add(name: str, value: float | None, note: str | None = None, source_ids: str | None = None, _base: dict = base) -> None:
                        rows.append(_row(_base, name, value, note, source_ids if source_ids is not None else src[name]))

                    add("trade_export_share", e[k] if e else None, "no reported exports of the mineral in the year" if mineral != "all" else "no reported trade for the year")
                    add("trade_import_share", m[k] if m else None, "no reported imports of the mineral in the year" if mineral != "all" else "no reported trade for the year")
                    ly = inp.last_year.get(f"finance_{actor}")
                    if ly is None:
                        add("finance_flow", None, "no finance source for the actor in the warehouse")
                    elif year > ly:
                        add("finance_flow", None, f"source coverage ends {ly}")
                    elif g is None or g <= 0:
                        add("finance_flow", None, "GDP not available for the year")
                    else:
                        window = range(year - ROLLING_YEARS + 1, year + 1)
                        total = sum(fin_year.get((iso, actor, y), 0.0) for y in window)
                        ids = sorted(set().union(*(fin_src.get((iso, actor, y), set()) for y in window))) or FINANCE_SOURCES[actor]
                        add("finance_flow", total / g, source_ids=",".join([*ids, "wb_wdi"]))
                    if actor == "US":
                        add("debt_stock", None, "no source for debt owed to the United States")
                    else:
                        d, lyd = debt.get((iso, year)), inp.last_year.get("debt_CN")
                        if d is None:
                            add("debt_stock", None, f"source coverage ends {lyd}" if lyd is not None and year > lyd else "not reported by the World Bank IDS for the country and year")
                        elif g is None or g <= 0:
                            add("debt_stock", None, "GDP not available for the year")
                        else:
                            add("debt_stock", d / g)
                    u, lyu = unga.get((iso, year, actor)), inp.last_year.get("unga")
                    add("diplomatic_alignment", u, f"source coverage ends {lyu}" if u is None and lyu is not None and year > lyu else "no UNGA voting data for the year")
                    s = stance.get((iso, year, actor))
                    if s is None:
                        add("legislative_stance", None, "no scored legislative records naming the actor")
                    elif s["n"] < MIN_DOCS:
                        add("legislative_stance", None, f"{int(s['n'])} scored record{'s' if s['n'] != 1 else ''}, fewer than {MIN_DOCS}")
                    else:
                        add("legislative_stance", s["mean"])
    return pd.DataFrame(rows, columns=cols)


def normalise(comp: pd.DataFrame) -> pd.DataFrame:
    """Add `normalized_value` (winsorised min–max, 0–100) and `rank_value` (percentile rank, 0–100) for the available rows.
    The bounds and the rank reference of each component come from its mineral "all" rows (one country × year × actor
    panel, both actors on one scale) and apply to every row: the per-mineral composites share the composite's scale and a
    country that trades many minerals weighs no more in the pool than one that trades one. Only if a component has no
    "all" row at all do its available rows form the pool."""
    comp = comp.copy()
    comp["normalized_value"] = np.nan
    comp["rank_value"] = np.nan
    for name in NAMES:
        mask = (comp["component"] == name) & comp["available"]
        if not mask.any():
            continue
        pool = mask & (comp["mineral"] == "all")
        ref = np.sort(comp.loc[pool if pool.any() else mask, "raw_value"].astype(float).to_numpy())
        lo, hi = np.nanpercentile(ref, WINSOR[0]), np.nanpercentile(ref, WINSOR[1])
        v = comp.loc[mask, "raw_value"].astype(float)
        w = v.clip(lo, hi)
        comp.loc[mask, "normalized_value"] = 50.0 if hi <= lo else ((w - lo) / (hi - lo) * 100.0)
        # percentile rank within the "all" pool (ties share their mean rank, as pandas' average rank); a per-mineral
        # value is ranked against the same pool, so the two normalisations agree on the "all" rows
        x = v.to_numpy()
        rank = (np.searchsorted(ref, x, side="left") + np.searchsorted(ref, x, side="right") + 1) / 2.0 / len(ref) * 100.0
        comp.loc[mask, "rank_value"] = np.clip(rank, 0.0, 100.0)
    return comp


def _aggregate(x: np.ndarray, mask: np.ndarray, w: np.ndarray) -> np.ndarray:
    """Weighted mean over the available components; w is (K,) or (D, K); rows with nothing available give NaN."""
    num = np.where(mask, x, 0.0) @ w.T
    den = mask.astype(float) @ w.T
    with np.errstate(divide="ignore", invalid="ignore"):
        return np.where(den > 0, num / den, np.nan)


def index(comp: pd.DataFrame, draws: int = 500, seed: int = 20261009, current_year: int | None = None) -> tuple[pd.DataFrame, float | None]:
    """Baseline index values with their sensitivity band, for the composite and the two sub-indices, and the rank
    stability of the composite (mean Spearman correlation between the baseline and the perturbed rankings in the
    latest year with enough countries, averaged over the two actors). Composite rows held back by `lagging_hold`
    (`current_year` defaults to today's) keep their n_components and components_available with a null value and band."""
    keys = ["country", "year", "actor", "mineral"]
    cols = [*keys, "index_name", "value", "lower", "upper", "n_components", "components_available"]
    if comp.empty:
        return pd.DataFrame(columns=cols), None
    piv = comp.pivot_table(index=keys, columns="component", values="normalized_value", aggfunc="first").reindex(columns=NAMES)
    piv_r = comp.pivot_table(index=keys, columns="component", values="rank_value", aggfunc="first").reindex(columns=NAMES).reindex(piv.index)
    x = piv.to_numpy(dtype=float)
    xr = piv_r.to_numpy(dtype=float)
    avail = ~np.isnan(x)
    k = len(NAMES)
    rng = np.random.default_rng(seed)
    w_draw = rng.dirichlet(np.full(k, DIRICHLET_ALPHA), size=draws)
    use_rank = rng.random(draws) < RANK_SHARE
    equal = np.ones(k) / k
    group_masks = {"influence": np.ones(k, dtype=bool)}
    for g in GROUPS:
        group_masks[g] = np.array([c[1] == g for c in COMPONENTS])
    minimums = {"influence": MIN_COMPONENTS, **GROUPS}
    index_keys = piv.index.to_frame(index=False)
    out: list[pd.DataFrame] = []
    composite: np.ndarray | None = None
    for name, gmask in group_masks.items():
        m = avail & gmask[None, :]
        n = m.sum(axis=1)
        value = _aggregate(x, m, equal)
        ok = n >= minimums[name]
        value[~ok] = np.nan
        band_mm = _aggregate(x, m, w_draw)  # (N, D)
        band_rk = _aggregate(xr, m, w_draw)
        band = np.where(use_rank[None, :], band_rk, band_mm)
        lower = np.full(len(value), np.nan)
        upper = np.full(len(value), np.nan)
        if ok.any():
            lower[ok] = np.nanpercentile(band[ok], 5, axis=1)
            upper[ok] = np.nanpercentile(band[ok], 95, axis=1)
        lower, upper = np.minimum(lower, value), np.maximum(upper, value)
        if name == "influence":
            held = lagging_hold(comp, index_keys, current_year)
            value[held], lower[held], upper[held] = np.nan, np.nan, np.nan
        names_avail = [",".join(c for c, a in zip(NAMES, row, strict=True) if a) for row in m]
        df = index_keys.assign(index_name=name, value=np.round(value, 2), lower=np.round(np.clip(lower, 0, 100), 2), upper=np.round(np.clip(upper, 0, 100), 2),
                               n_components=n.astype(int), components_available=names_avail)
        if name == "influence":
            composite = band
            df = df[n > 0]  # keep null composites (too few components, or held back for a lagging source) where anything is available
        else:
            df = df[ok]
        out.append(df)
    result = pd.concat(out, ignore_index=True)[cols]
    stability = _rank_stability(index_keys, result, composite) if composite is not None else None
    return result, stability


def coverage_end(note: str | None) -> int | None:
    """The last year L in a "source coverage ends L" note, else None."""
    text = str(note or "")
    if not text.startswith(COVERAGE_NOTE):
        return None
    try:
        return int(text[len(COVERAGE_NOTE):].split()[0])
    except (ValueError, IndexError):
        return None


def lagging_hold(comp: pd.DataFrame, index_keys: pd.DataFrame, current_year: int | None = None, lag_years: int = LAG_YEARS) -> np.ndarray:
    """One flag per row of `index_keys`: True where the composite is held back because a component that was available
    the year before (or was itself held in the year before, while the lag lasts) is unavailable only because its source's
    release lags: its note reads "source coverage ends L" with L ≥ current_year − lag_years. A source whose last year is
    older than that (AidData, 2021) is an ended series: the index goes on without it, as documented. The decision is
    taken on the mineral "all" rows of a country, actor and year and applied to its per-mineral rows too."""
    if comp.empty or "note" not in comp.columns:
        return np.zeros(len(index_keys), dtype=bool)
    year_now = int(current_year) if current_year is not None else datetime.now(UTC).year
    cutoff = year_now - lag_years
    rows = comp[comp["mineral"] == "all"]
    avail = {(r.country, r.actor, int(r.year), r.component) for r in rows[rows["available"].astype(bool)].itertuples(index=False)}
    lag: dict[tuple[str, str], dict[int, set[str]]] = {}
    for r in rows[~rows["available"].astype(bool)].itertuples(index=False):
        last = coverage_end(r.note)
        if last is not None and last >= cutoff:
            lag.setdefault((r.country, r.actor), {}).setdefault(int(r.year), set()).add(r.component)
    held: set[tuple[str, str, int]] = set()
    for (iso, actor), by_year in lag.items():
        carried: set[str] = set()
        prev: int | None = None
        for year in sorted(by_year):
            if prev is None or year != prev + 1:
                carried = set()
            carried = {c for c in by_year[year] if (iso, actor, year - 1, c) in avail or c in carried}
            if carried:
                held.add((iso, actor, year))
            prev = year
    return np.array([(r.country, r.actor, int(r.year)) in held for r in index_keys.itertuples(index=False)], dtype=bool)


def _rank_stability(index_keys: pd.DataFrame, result: pd.DataFrame, band: np.ndarray) -> float | None:
    """Mean Spearman correlation between the baseline composite ranking and each draw's ranking, latest year with at
    least MIN_RANKED countries, mineral "all", averaged over the actors."""
    comp = result[(result["index_name"] == "influence") & (result["mineral"] == "all") & result["value"].notna()]
    if comp.empty:
        return None
    pos = {tuple(r): i for i, r in enumerate(map(tuple, index_keys.itertuples(index=False, name=None)))}
    rhos: list[float] = []
    for actor in ("US", "CN"):
        a = comp[comp["actor"] == actor]
        counts = a.groupby("year")["country"].nunique()
        years = counts[counts >= MIN_RANKED].index
        if len(years) == 0:
            continue
        y = int(years.max())
        sel = a[a["year"] == y]
        idx = [pos[(r.country, r.year, r.actor, r.mineral)] for r in sel.itertuples(index=False)]
        base = sel["value"].to_numpy(dtype=float)
        draws = band[idx, :]  # (n_countries, D)
        base_r = pd.Series(base).rank().to_numpy()
        for d in range(draws.shape[1]):
            col = draws[:, d]
            if np.isnan(col).any():
                continue
            dr = pd.Series(col).rank().to_numpy()
            if base_r.std() == 0 or dr.std() == 0:
                continue
            rhos.append(float(np.corrcoef(base_r, dr)[0, 1]))
    return round(float(np.mean(rhos)), 3) if rhos else None
