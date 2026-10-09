"""Panel regressions with country and year fixed effects (plain numpy).

Outcome: the share of a country's mineral exports (or imports) going to (coming from) an actor. Regressors,
standardised over the estimation sample so a coefficient reads as share points per one standard deviation:
the actor's documented official-finance commitments over the previous three years relative to GDP, lagged
one year; UN General Assembly voting agreement with the actor; electoral democracy (V-Dem); rule of law
(WGI); mineral rents in GDP (WDI). Year effects absorb world prices and global demand, country effects absorb
geography and endowment. Inference with twelve clusters is fragile, so three things are reported together:
the cluster-robust (CR1) standard error, a wild cluster bootstrap p-value (Rademacher weights by country),
and the range of the coefficient when each country is dropped in turn. Results are associations."""
from __future__ import annotations

import numpy as np
import pandas as pd

from .concentration import wide

N_BOOT = 999
MIN_OBS = 40
MIN_COUNTRIES = 6
TERMS = ["finance_flow_lag1", "diplomatic_alignment", "electoral_democracy", "rule_of_law", "mineral_rents_gdp"]
SPECS = [  # id, outcome column in the wide share frame, flow, actor
    ("exports_to_cn", "share_cn", "x", "CN"), ("exports_to_us", "share_us", "x", "US"),
    ("imports_from_cn", "share_cn", "m", "CN"), ("imports_from_us", "share_us", "m", "US"),
]
VARIANTS = {"twfe": "country and year fixed effects", "country_fe": "country fixed effects only (robustness)"}


def build_panel(conc: pd.DataFrame, comp: pd.DataFrame, controls: pd.DataFrame) -> pd.DataFrame:
    """country, year, actor, share_x, share_m, finance_flow_lag1, diplomatic_alignment, <controls>."""
    ex, im = wide(conc, "x"), wide(conc, "m")
    ex = ex[ex["mineral"] == "all"][["country", "year", "share_us", "share_cn"]]
    im = im[im["mineral"] == "all"][["country", "year", "share_us", "share_cn"]].rename(columns={"share_us": "imp_us", "share_cn": "imp_cn"})
    base = ex.merge(im, on=["country", "year"], how="outer")
    rows = []
    c = comp[(comp["mineral"] == "all") & comp["available"]]
    for actor in ("US", "CN"):
        ca = c[c["actor"] == actor].pivot_table(index=["country", "year"], columns="component", values="raw_value", aggfunc="first").reset_index()
        for col in ("finance_flow", "diplomatic_alignment"):
            if col not in ca.columns:
                ca[col] = np.nan
        lag = ca[["country", "year", "finance_flow"]].assign(year=ca["year"] + 1).rename(columns={"finance_flow": "finance_flow_lag1"})
        d = base.merge(ca[["country", "year", "diplomatic_alignment"]], on=["country", "year"], how="left").merge(lag, on=["country", "year"], how="left")
        d["actor"] = actor
        d["share_x"] = d["share_cn"] if actor == "CN" else d["share_us"]
        d["share_m"] = d["imp_cn"] if actor == "CN" else d["imp_us"]
        rows.append(d[["country", "year", "actor", "share_x", "share_m", "finance_flow_lag1", "diplomatic_alignment"]])
    panel = pd.concat(rows, ignore_index=True)
    if not controls.empty:
        ctrl = controls.pivot_table(index=["country", "year"], columns="name", values="value", aggfunc="first").reset_index()
        panel = panel.merge(ctrl, on=["country", "year"], how="left")
    for name in ("electoral_democracy", "rule_of_law", "mineral_rents_gdp"):
        if name not in panel.columns:
            panel[name] = np.nan
    return panel


def _design(d: pd.DataFrame, terms: list[str], year_fe: bool) -> tuple[np.ndarray, list[str], np.ndarray, np.ndarray]:
    countries = sorted(d["country"].unique())
    years = sorted(d["year"].unique())
    x = [d[t].to_numpy(dtype=float) for t in terms]
    names = list(terms)
    x.append(np.ones(len(d)))
    names.append("const")
    for c in countries[1:]:
        x.append((d["country"] == c).to_numpy(dtype=float))
        names.append(f"fe_{c}")
    if year_fe:
        for y in years[1:]:
            x.append((d["year"] == y).to_numpy(dtype=float))
            names.append(f"fe_{y}")
    return np.column_stack(x), names, d["country"].to_numpy(), d["year"].to_numpy()


def _ols(x: np.ndarray, y: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    beta, *_ = np.linalg.lstsq(x, y, rcond=None)
    return beta, y - x @ beta


def _cluster_se(x: np.ndarray, resid: np.ndarray, groups: np.ndarray, k_terms: int) -> np.ndarray:
    n, k = x.shape
    xtx_inv = np.linalg.pinv(x.T @ x)
    meat = np.zeros((k, k))
    labels = np.unique(groups)
    for g in labels:
        xg = x[groups == g]
        eg = resid[groups == g]
        s = xg.T @ eg
        meat += np.outer(s, s)
    g_n = len(labels)
    adj = (g_n / (g_n - 1)) * ((n - 1) / max(1, n - k))
    v = adj * xtx_inv @ meat @ xtx_inv
    return np.sqrt(np.clip(np.diag(v)[:k_terms], 0, None))


def _wild_p(x: np.ndarray, y: np.ndarray, groups: np.ndarray, j: int, t_obs: float, rng: np.random.Generator, n_boot: int) -> float | None:
    """Wild cluster bootstrap (Rademacher) p-value for term j, unrestricted residuals."""
    beta, resid = _ols(x, y)
    fitted = x @ beta
    labels = np.unique(groups)
    idx = {g: np.where(groups == g)[0] for g in labels}
    count = 0
    k_terms = j + 1
    for _ in range(n_boot):
        w = rng.choice([-1.0, 1.0], size=len(labels))
        e = resid.copy()
        for gi, g in enumerate(labels):
            e[idx[g]] *= w[gi]
        yb = fitted + e
        bb, rb = _ols(x, yb)
        se = _cluster_se(x, rb, groups, k_terms)[j]
        if se > 0 and abs((bb[j] - beta[j]) / se) >= abs(t_obs):
            count += 1
    return round((1 + count) / (1 + n_boot), 3)


def fit(d: pd.DataFrame, outcome: str, terms: list[str], year_fe: bool, rng: np.random.Generator, n_boot: int = N_BOOT) -> list[dict]:
    d = d.dropna(subset=[outcome, *terms]).copy()
    n_c = d["country"].nunique()
    if len(d) < MIN_OBS or n_c < MIN_COUNTRIES:
        return []
    for t in terms:  # standardise over the estimation sample
        sd = d[t].std(ddof=0)
        d[t] = (d[t] - d[t].mean()) / sd if sd > 0 else 0.0
    x, names, groups, _years = _design(d, terms, year_fe)
    y = d[outcome].to_numpy(dtype=float)
    beta, resid = _ols(x, y)
    se = _cluster_se(x, resid, groups, len(terms))
    # within R²: fit of the regressors after the fixed effects
    x_fe = x[:, len(terms):]
    _, r_y = _ols(x_fe, y)
    r2_within = float(1 - resid.var() / r_y.var()) if r_y.var() > 0 else None
    countries = sorted(d["country"].unique())
    out = []
    for j, term in enumerate(terms):
        t_stat = float(beta[j] / se[j]) if se[j] > 0 else None
        df = n_c - 1
        p_cluster = float(2 * (1 - _t_cdf(abs(t_stat), df))) if t_stat is not None else None
        p_wild = _wild_p(x, y, groups, j, t_stat, rng, n_boot) if t_stat is not None else None
        jk = []
        for c in countries:
            dd = d[d["country"] != c]
            xx, _, _, _ = _design(dd, terms, year_fe)
            bb, _ = _ols(xx, dd[outcome].to_numpy(dtype=float))
            jk.append(float(bb[j]))
        out.append({"term": term, "coef": round(float(beta[j]), 5), "se": round(float(se[j]), 5), "t": round(t_stat, 3) if t_stat is not None else None,
                    "p_cluster": round(p_cluster, 4) if p_cluster is not None else None, "p_wild": p_wild, "jk_min": round(min(jk), 5), "jk_max": round(max(jk), 5),
                    "n_obs": int(len(d)), "n_countries": int(n_c), "years": f"{int(d['year'].min())}–{int(d['year'].max())}", "r2_within": round(r2_within, 4) if r2_within is not None else None})
    return out


def _t_cdf(t: float, df: int) -> float:
    """Student t CDF via the regularised incomplete beta (numpy only, continued fraction)."""
    x = df / (df + t * t)
    ib = _betainc(df / 2.0, 0.5, x)
    return 1 - 0.5 * ib if t >= 0 else 0.5 * ib


def _betainc(a: float, b: float, x: float) -> float:
    """Regularised incomplete beta I_x(a, b) (Numerical Recipes continued fraction)."""
    if x <= 0:
        return 0.0
    if x >= 1:
        return 1.0
    from math import exp, lgamma, log

    lbeta = lgamma(a + b) - lgamma(a) - lgamma(b) + a * log(x) + b * log(1 - x)
    if x < (a + 1) / (a + b + 2):
        return exp(lbeta) * _betacf(a, b, x) / a
    return 1 - exp(lbeta) * _betacf(b, a, 1 - x) / b


def _betacf(a: float, b: float, x: float, max_iter: int = 300, eps: float = 3e-14) -> float:
    tiny = 1e-300
    qab, qap, qam = a + b, a + 1, a - 1
    c, d = 1.0, 1 - qab * x / qap
    d = 1 / (d if abs(d) > tiny else tiny)
    h = d
    for m in range(1, max_iter + 1):
        m2 = 2 * m
        aa = m * (b - m) * x / ((qam + m2) * (a + m2))
        d = 1 + aa * d
        d = 1 / (d if abs(d) > tiny else tiny)
        c = 1 + aa / (c if abs(c) > tiny else tiny)
        h *= d * c
        aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2))
        d = 1 + aa * d
        d = 1 / (d if abs(d) > tiny else tiny)
        c = 1 + aa / (c if abs(c) > tiny else tiny)
        delta = d * c
        h *= delta
        if abs(delta - 1) < eps:
            break
    return h


def panel_regressions(panel: pd.DataFrame, n_boot: int = N_BOOT, seed: int = 20261009) -> pd.DataFrame:
    cols = ["spec", "variant", "outcome", "actor", "term", "coef", "se", "t", "p_cluster", "p_wild", "jk_min", "jk_max", "n_obs", "n_countries", "years", "r2_within", "note"]
    if panel.empty:
        return pd.DataFrame(columns=cols)
    rng = np.random.default_rng(seed)
    rows = []
    for spec, _share, flow, actor in SPECS:
        d = panel[panel["actor"] == actor]
        outcome = "share_x" if flow == "x" else "share_m"
        for variant, label in VARIANTS.items():
            for r in fit(d, outcome, TERMS, year_fe=(variant == "twfe"), rng=rng, n_boot=n_boot):
                rows.append({"spec": spec, "variant": variant, "outcome": f"{'export' if flow == 'x' else 'import'}_share_{actor.lower()}", "actor": actor, **r,
                             "note": f"{label}; regressors standardised (coefficient = share points per 1 SD); CR1 standard errors clustered by country; p_wild from {n_boot} Rademacher wild-cluster draws; jk_min/jk_max = coefficient range dropping one country at a time"})
    return pd.DataFrame(rows, columns=cols)
