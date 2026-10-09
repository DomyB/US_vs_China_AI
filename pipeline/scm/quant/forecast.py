"""Forecasts to 2030 with backtests (Phase 5), plain numpy.

Targets per country and actor: the influence index (mineral "all") and the share of mineral exports going to
the actor. Annual series of at most eighteen points allow simple models only, so five are fitted and compared
on expanding-window backtests: naive persistence (last value, bootstrapped yearly changes), random walk with
drift, drift partially pooled across countries (empirical Bayes), AR(1) on first differences, and a damped local
linear trend fitted by maximum likelihood with a Kalman filter. Every model produces simulated paths; the
continuous ranked probability score (CRPS), the mean absolute error of the point forecast and the coverage of
the 80% and 95% bands are measured on every origin and horizon, and a model is used for the published forecast
only if its pooled CRPS beats naive persistence; otherwise naive persistence itself is published and labelled.
Scenarios are Monte Carlo paths of the selected model with an explicit, stated shift of the yearly change."""
from __future__ import annotations

import numpy as np
import pandas as pd

HORIZON_YEAR = 2030
N_SIMS = 2000
MIN_OBS = 8
MIN_LAST_YEAR = 2023
MAX_H = 3  # backtest horizons 1..MAX_H
FIRST_ORIGIN_OBS = 7  # observations needed before the first backtest origin
DAMPING = 0.9
QUANTILES = {"p05": 0.05, "p25": 0.25, "p75": 0.75, "p95": 0.95}
MODELS = ["naive", "drift", "pooled_drift", "ar1_diff", "damped_trend"]
MODEL_LABEL = {
    "naive": "naive persistence (last value; bootstrapped yearly changes)",
    "drift": "random walk with drift",
    "pooled_drift": "random walk with drift partially pooled across countries (empirical Bayes)",
    "ar1_diff": "AR(1) on yearly changes",
    "damped_trend": "damped local linear trend (Kalman filter, maximum likelihood)",
}
TARGETS = {"influence_index": (0.0, 100.0), "export_share": (0.0, 1.0)}
# scenarios: an explicit shift of the yearly change applied to every simulated path of the selected model
SCENARIOS = [
    {"id": "baseline", "name": "Baseline", "assumptions": "The selected model's own dynamics; no shift.", "delta": {"influence_index": {"US": 0.0, "CN": 0.0}, "export_share": {"US": 0.0, "CN": 0.0}}},
    {"id": "china_pull", "name": "Accelerated China pull", "assumptions": "Chinese demand and finance keep growing: the yearly change in the export share to China is 2 points above the model's, the share to the United States 1 point below; the index moves 2 points a year toward China and 1 away from the United States.",
     "delta": {"influence_index": {"US": -1.0, "CN": 2.0}, "export_share": {"US": -0.01, "CN": 0.02}}},
    {"id": "us_reshoring", "name": "US sourcing rules bite", "assumptions": "IRA-style sourcing rules, the Minerals Security Partnership and tariffs divert flows: the yearly change in the export share to the United States is 2 points above the model's, the share to China 2 points below; the index moves 2 points a year each way.",
     "delta": {"influence_index": {"US": 2.0, "CN": -2.0}, "export_share": {"US": 0.02, "CN": -0.02}}},
]


# ---------------------------------------------------------------- models: each returns simulated paths (n_sims, h)

def _diffs(y: np.ndarray) -> np.ndarray:
    d = np.diff(y)
    return d if len(d) else np.zeros(1)


def sim_naive(y: np.ndarray, h: int, n: int, rng: np.random.Generator, **_) -> np.ndarray:
    d = _diffs(y)
    steps = rng.choice(d - d.mean() + 0.0, size=(n, h)) if len(d) > 1 else np.zeros((n, h))
    return y[-1] + np.cumsum(steps, axis=1)


def sim_drift(y: np.ndarray, h: int, n: int, rng: np.random.Generator, drift: float | None = None, **_) -> np.ndarray:
    d = _diffs(y)
    mu = float(d.mean()) if drift is None else drift
    resid = d - d.mean()
    steps = mu + (rng.choice(resid, size=(n, h)) if len(resid) > 1 else np.zeros((n, h)))
    return y[-1] + np.cumsum(steps, axis=1)


def sim_ar1_diff(y: np.ndarray, h: int, n: int, rng: np.random.Generator, **_) -> np.ndarray:
    d = _diffs(y)
    if len(d) < 4:
        return sim_drift(y, h, n, rng)
    mu = d.mean()
    x, z = d[:-1] - mu, d[1:] - mu
    phi = float(np.clip((x @ z) / (x @ x), -0.95, 0.95)) if (x @ x) > 0 else 0.0
    resid = z - phi * x
    paths = np.empty((n, h))
    last = np.full(n, d[-1] - mu)
    level = np.full(n, y[-1])
    for k in range(h):
        eps = rng.choice(resid - resid.mean(), size=n) if len(resid) > 1 else np.zeros(n)
        last = phi * last + eps
        level = level + mu + last
        paths[:, k] = level
    return paths


def _kalman_llt(y: np.ndarray, q_level: float, q_slope: float, r: float, phi: float = DAMPING) -> tuple[float, np.ndarray, np.ndarray]:
    """Damped local linear trend: level_t = level_{t-1} + slope_{t-1} + e, slope_t = phi * slope_{t-1} + u, y = level + v.
    Returns (log-likelihood, filtered end state, its covariance)."""
    f = np.array([[1.0, 1.0], [0.0, phi]])
    q = np.diag([q_level, q_slope])
    hm = np.array([[1.0, 0.0]])
    x = np.array([y[0], 0.0])
    p = np.diag([max(r, 1e-9) * 10, max(q_slope, 1e-9) * 10 + 1e-6])
    ll = 0.0
    for t in range(1, len(y)):
        x = f @ x
        p = f @ p @ f.T + q
        s = float((hm @ p @ hm.T).item() + r)
        v = float(y[t] - (hm @ x).item())
        k = (p @ hm.T) / s  # (2, 1)
        x = x + (k * v).ravel()
        p = p - k @ hm @ p
        if t >= 2:
            ll += -0.5 * (np.log(2 * np.pi * s) + v * v / s)
    return ll, x, p


def fit_damped_trend(y: np.ndarray) -> tuple[float, float, float]:
    s2 = float(np.var(_diffs(y))) or 1e-6
    best, params = -np.inf, (s2, s2 * 0.1, s2 * 0.1)
    for ql in (0.0, 0.01, 0.1, 0.5, 1.0):
        for qs in (0.0, 0.01, 0.1, 0.5):
            for r in (0.01, 0.1, 0.5, 1.0):
                ll, _, _ = _kalman_llt(y, ql * s2 + 1e-9, qs * s2 + 1e-9, r * s2)
                if ll > best:
                    best, params = ll, (ql * s2 + 1e-9, qs * s2 + 1e-9, r * s2)
    return params


def sim_damped_trend(y: np.ndarray, h: int, n: int, rng: np.random.Generator, **_) -> np.ndarray:
    ql, qs, r = fit_damped_trend(y)
    _, x, p = _kalman_llt(y, ql, qs, r)
    p = (p + p.T) / 2 + np.eye(2) * 1e-12
    try:
        states = rng.multivariate_normal(x, p, size=n)
    except np.linalg.LinAlgError:
        states = np.tile(x, (n, 1))
    level, slope = states[:, 0], states[:, 1]
    paths = np.empty((n, h))
    for k in range(h):
        level = level + slope + rng.normal(0, np.sqrt(ql), n)
        slope = DAMPING * slope + rng.normal(0, np.sqrt(qs), n)
        paths[:, k] = level + rng.normal(0, np.sqrt(r), n)
    return paths


SIMULATORS = {"naive": sim_naive, "drift": sim_drift, "pooled_drift": sim_drift, "ar1_diff": sim_ar1_diff, "damped_trend": sim_damped_trend}


def pooled_drift(series: dict[str, np.ndarray], iso: str) -> float:
    """Empirical-Bayes shrinkage of a country's mean yearly change toward the cross-country mean:
    w = n_i / (n_i + k), k = within-country variance / between-country variance of the drifts."""
    drifts = {c: _diffs(v).mean() for c, v in series.items() if len(v) >= 3}
    if iso not in drifts or len(drifts) < 3:
        return float(_diffs(series[iso]).mean())
    d_i, n_i = drifts[iso], len(series[iso]) - 1
    between = float(np.var(list(drifts.values())))
    within = float(np.mean([np.var(_diffs(v)) for v in series.values() if len(v) >= 3]))
    k = within / between if between > 0 else 1e9
    w = n_i / (n_i + k)
    return float(w * d_i + (1 - w) * np.mean(list(drifts.values())))


# ---------------------------------------------------------------- scoring

def crps(samples: np.ndarray, y: float) -> float:
    """CRPS from samples: E|X-y| - 0.5 E|X-X'| (sorted-sample identity for the second term)."""
    x = np.sort(samples)
    n = len(x)
    term1 = float(np.mean(np.abs(x - y)))
    weights = 2 * np.arange(n) - n + 1
    term2 = float(2 * np.sum(weights * x) / (n * n))
    return term1 - 0.5 * term2


def _simulate(model: str, y: np.ndarray, h: int, n: int, rng: np.random.Generator, series: dict[str, np.ndarray], iso: str, bounds: tuple[float, float]) -> np.ndarray:
    kw = {"drift": pooled_drift(series, iso)} if model == "pooled_drift" else {}
    paths = SIMULATORS[model](y, h, n, rng, **kw)
    return np.clip(paths, bounds[0], bounds[1])


def backtest(series: dict[str, np.ndarray], years: dict[str, np.ndarray], bounds: tuple[float, float], rng: np.random.Generator, n: int = 500) -> pd.DataFrame:
    """Expanding-window backtest of every model, every country, origin and horizon: one row each with CRPS, absolute
    error of the median and whether the 80% / 95% bands covered the outcome."""
    rows = []
    for iso, y in series.items():
        yrs = years[iso]
        for origin_idx in range(FIRST_ORIGIN_OBS, len(y) - 1):
            train = y[: origin_idx + 1]
            h_max = min(MAX_H, len(y) - origin_idx - 1)
            for model in MODELS:
                sub_series = {c: v[: np.searchsorted(years[c], yrs[origin_idx], side="right")] for c, v in series.items()}
                paths = _simulate(model, train, h_max, n, rng, sub_series, iso, bounds)
                for h in range(1, h_max + 1):
                    actual = float(y[origin_idx + h])
                    s = paths[:, h - 1]
                    q = np.quantile(s, [0.025, 0.1, 0.5, 0.9, 0.975])
                    rows.append({"country": iso, "model": model, "origin": int(yrs[origin_idx]), "h": h, "crps": crps(s, actual), "abs_error": abs(float(q[2]) - actual),
                                 "in80": bool(q[1] <= actual <= q[3]), "in95": bool(q[0] <= actual <= q[4])})
    return pd.DataFrame(rows)


def summarise(bt: pd.DataFrame) -> pd.DataFrame:
    """Pooled scores per model and horizon, and per model over all horizons (h = 0), with the ratio to naive."""
    if bt.empty:
        return pd.DataFrame(columns=["model", "h", "crps", "mae", "coverage_80", "coverage_95", "n", "crps_naive", "crps_ratio", "beats_naive"])
    parts = []
    for h_sel, label in [*((h, h) for h in sorted(bt["h"].unique())), (None, 0)]:
        d = bt if h_sel is None else bt[bt["h"] == h_sel]
        g = d.groupby("model").agg(crps=("crps", "mean"), mae=("abs_error", "mean"), coverage_80=("in80", "mean"), coverage_95=("in95", "mean"), n=("crps", "size")).reset_index()
        g["h"] = label
        parts.append(g)
    out = pd.concat(parts, ignore_index=True)
    naive = out[out["model"] == "naive"].set_index("h")["crps"]
    out["crps_naive"] = out["h"].map(naive)
    out["crps_ratio"] = out["crps"] / out["crps_naive"]
    out["beats_naive"] = (out["model"] != "naive") & (out["crps_ratio"] < 1)
    return out


def select_model(summary: pd.DataFrame) -> str:
    """The model with the lowest pooled CRPS over all horizons, if it beats naive persistence; else naive."""
    if summary.empty:
        return "naive"
    pooled = summary[summary["h"] == 0].set_index("model")["crps"]
    best = str(pooled.idxmin())
    return best if best != "naive" and pooled[best] < pooled.get("naive", np.inf) else "naive"


# ---------------------------------------------------------------- orchestration

def forecasts(idx: pd.DataFrame, shares: pd.DataFrame, seed: int = 20261009, n_sims: int = N_SIMS, n_backtest: int = 500) -> tuple[pd.DataFrame, pd.DataFrame, dict]:
    """(forecast rows, backtest summary rows, status). `idx`: index_value rows; `shares`: country, year, share_us, share_cn."""
    rng = np.random.default_rng(seed)
    f_rows: list[dict] = []
    b_rows: list[dict] = []
    status: dict = {"targets": {}, "horizon_year": HORIZON_YEAR, "n_sims": n_sims, "models": MODEL_LABEL, "scenarios": [{k: v for k, v in s.items() if k != "delta"} for s in SCENARIOS]}
    for target, bounds in TARGETS.items():
        for actor in ("US", "CN"):
            if target == "influence_index":
                d = idx[(idx["index_name"] == "influence") & (idx["mineral"] == "all") & (idx["actor"] == actor) & idx["value"].notna()][["country", "year", "value"]]
            else:
                col = "share_us" if actor == "US" else "share_cn"
                d = shares[shares[col].notna()][["country", "year", col]].rename(columns={col: "value"})
            series: dict[str, np.ndarray] = {}
            years: dict[str, np.ndarray] = {}
            for iso, g in d.sort_values("year").groupby("country"):
                yrs = g["year"].to_numpy(dtype=int)
                vals = g["value"].to_numpy(dtype=float)
                # a series must be contiguous, long enough and current
                if len(vals) >= MIN_OBS and yrs[-1] >= MIN_LAST_YEAR and np.all(np.diff(yrs) == 1):
                    series[iso], years[iso] = vals, yrs
            key = f"{target}:{actor}"
            if not series:
                status["targets"][key] = {"countries": [], "model": None, "note": "no series long enough"}
                continue
            bt = backtest(series, years, bounds, rng, n=n_backtest)
            summary = summarise(bt)
            model = select_model(summary)
            for r in summary.itertuples(index=False):
                b_rows.append({"target": target, "actor": actor, "model": r.model, "h": int(r.h), "crps": round(float(r.crps), 5), "mae": round(float(r.mae), 5),
                               "coverage_80": round(float(r.coverage_80), 3), "coverage_95": round(float(r.coverage_95), 3), "n": int(r.n), "crps_naive": round(float(r.crps_naive), 5),
                               "crps_ratio": round(float(r.crps_ratio), 4), "beats_naive": bool(r.beats_naive), "selected": r.model == model,
                               "origins": f"{int(bt['origin'].min())}–{int(bt['origin'].max())}", "countries": int(bt["country"].nunique())})
            pooled = summary[(summary["h"] == 0) & (summary["model"] == model)].iloc[0]
            status["targets"][key] = {"countries": sorted(series), "model": model, "label": MODEL_LABEL[model], "crps": round(float(pooled["crps"]), 4),
                                      "crps_naive": round(float(pooled["crps_naive"]), 4), "crps_ratio": round(float(pooled["crps_ratio"]), 3), "beats_naive": bool(pooled["beats_naive"]),
                                      "coverage_80": round(float(pooled["coverage_80"]), 3), "coverage_95": round(float(pooled["coverage_95"]), 3), "n_tests": int(pooled["n"]),
                                      "origins": f"{int(bt['origin'].min())}–{int(bt['origin'].max())}"}
            for iso, y in series.items():
                last_year = int(years[iso][-1])
                h = HORIZON_YEAR - last_year
                if h <= 0:
                    continue
                paths = _simulate(model, y, h, n_sims, rng, series, iso, bounds)
                for sc in SCENARIOS:
                    delta = sc["delta"][target][actor]
                    shifted = np.clip(paths + delta * np.arange(1, h + 1)[None, :], bounds[0], bounds[1])
                    for k in range(h):
                        s = shifted[:, k]
                        qs = {name: float(np.quantile(s, q)) for name, q in QUANTILES.items()}
                        f_rows.append({"country": iso, "actor": actor, "target": target, "mineral": "all", "horizon_year": last_year + k + 1, "last_observed_year": last_year,
                                       "model": model, "scenario_id": sc["id"], "point": round(float(np.median(s)), 4), **{k2: round(v, 4) for k2, v in qs.items()}})
    return pd.DataFrame(f_rows), pd.DataFrame(b_rows), status
