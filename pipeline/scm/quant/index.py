"""Composite influence index per country, year, actor and mineral, built along the OECD/JRC handbook steps:
component selection (six observable ties to the actor), no imputation (a missing input leaves the component
unavailable and the index rests on the rest, never on fewer than three), winsorised min–max normalisation pooled
over the whole panel so both actors share one scale, equal weights renormalised over the available components,
arithmetic aggregation, and an uncertainty analysis: weights redrawn from a Dirichlet around equal weights and
the normalisation switched to percentile ranks in half of the draws; the 5th–95th percentile band is stored
with every value and the rank stability (mean Spearman correlation of the perturbed rankings with the
baseline) is reported for the methodology page."""
from __future__ import annotations

import numpy as np
import pandas as pd

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
FIRST_YEAR = 2008

# name, group, definition, registry source ids
COMPONENTS: list[tuple[str, str, str, list[str]]] = [
    ("trade_export_share", "economic_ties", "Share of the country's mineral exports (reported to UN Comtrade) that go to the actor.", ["un_comtrade"]),
    ("trade_import_share", "economic_ties", "Share of the country's mineral imports that come from the actor.", ["un_comtrade"]),
    ("finance_flow", "economic_ties", "Documented official-finance commitments from the actor's institutions over the last three years, relative to GDP; central-bank swap-line drawdowns excluded.", ["aiddata_gcdf", "dfc_projects", "wb_wdi"]),
    ("debt_stock", "economic_ties", "Public and publicly guaranteed external debt owed to the actor, relative to GDP (World Bank IDS reports China as a creditor; no equivalent source exists for the United States).", ["wb_ids", "wb_wdi"]),
    ("diplomatic_alignment", "political_alignment", "UN General Assembly voting agreement with the actor in the year.", ["unga_votes"]),
    ("legislative_stance", "political_alignment", "Mean stance toward the actor (−2 to +2) in the legislature's mineral-related records, years with at least five scored records; a text-model output carried with its validation status.", []),
]
NAMES = [c[0] for c in COMPONENTS]
GROUPS = {"economic_ties": 2, "political_alignment": 1}  # minimum available components per sub-index
FINANCE_SOURCE = {"US": "dfc_projects", "CN": "aiddata_gcdf"}


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
                        total = sum(fin_year.get((iso, actor, y), 0.0) for y in range(year - ROLLING_YEARS + 1, year + 1))
                        add("finance_flow", total / g, source_ids=f"{FINANCE_SOURCE[actor]},wb_wdi")
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
    """Add `normalized_value` (winsorised min–max, 0–100, pooled over the panel per component) and `rank_value`
    (percentile rank, 0–100) for the available rows."""
    comp = comp.copy()
    comp["normalized_value"] = np.nan
    comp["rank_value"] = np.nan
    for name in NAMES:
        mask = (comp["component"] == name) & comp["available"]
        if not mask.any():
            continue
        v = comp.loc[mask, "raw_value"].astype(float)
        lo, hi = np.nanpercentile(v, WINSOR[0]), np.nanpercentile(v, WINSOR[1])
        w = v.clip(lo, hi)
        comp.loc[mask, "normalized_value"] = 50.0 if hi <= lo else ((w - lo) / (hi - lo) * 100.0)
        comp.loc[mask, "rank_value"] = v.rank(pct=True, method="average") * 100.0
    return comp


def _aggregate(x: np.ndarray, mask: np.ndarray, w: np.ndarray) -> np.ndarray:
    """Weighted mean over the available components; w is (K,) or (D, K); rows with nothing available give NaN."""
    num = np.where(mask, x, 0.0) @ w.T
    den = mask.astype(float) @ w.T
    with np.errstate(divide="ignore", invalid="ignore"):
        return np.where(den > 0, num / den, np.nan)


def index(comp: pd.DataFrame, draws: int = 500, seed: int = 20261009) -> tuple[pd.DataFrame, float | None]:
    """Baseline index values with their sensitivity band, for the composite and the two sub-indices, and the rank
    stability of the composite (mean Spearman correlation between the baseline and the perturbed rankings in the
    latest year with enough countries, averaged over the two actors)."""
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
        names_avail = [",".join(c for c, a in zip(NAMES, row, strict=True) if a) for row in m]
        df = index_keys.assign(index_name=name, value=np.round(value, 2), lower=np.round(np.clip(lower, 0, 100), 2), upper=np.round(np.clip(upper, 0, 100), 2),
                               n_components=n.astype(int), components_available=names_avail)
        if name == "influence":
            composite = band
            df = df[n > 0]  # keep null composites (with the reason: too few components) where anything is available
        else:
            df = df[ok]
        out.append(df)
    result = pd.concat(out, ignore_index=True)[cols]
    stability = _rank_stability(index_keys, result, composite) if composite is not None else None
    return result, stability


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
