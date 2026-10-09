"""Event studies around the dated policy events in pipeline/config/events.yaml.

Annual data, twelve countries: the honest designs are (1) an event-window comparison per country and actor,
the mean export share to the actor in the two years after the event minus the two years before (the event
year itself is left out), with a placebo distribution of the same statistic at every other year of the
country's own series, and (2) for events whose scope is a subset of the countries, a difference-in-differences
against the countries outside the scope, with a permutation placebo over country subsets of the same size.
Results are associations: the placebo p says how unusual the movement is for that series, not that the
event caused it. Every row carries the event's review status; draft events are shown as such."""
from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd
import yaml

from ..paths import CONFIG_DIR
from ..registry import IN_SCOPE

EVENTS_FILE = CONFIG_DIR / "events.yaml"
PRE = (2, 1)  # years before the event used as the pre window (t-2, t-1)
POST = (1, 2)  # years after (t+1, t+2)
MIN_CONTROL = 3  # countries outside the scope needed for a difference-in-differences
N_PERM = 999
ACTOR_NAME = {"US": "the United States", "CN": "China"}


def load_events(path: Path = EVENTS_FILE) -> list[dict]:
    if not path.exists():
        return []
    raw = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    out = []
    for e in raw.get("events", []):
        scope = e.get("scope", "all")
        countries = list(IN_SCOPE) if scope == "all" else [c for c in scope if c in IN_SCOPE]
        out.append({"id": str(e["id"]), "date": str(e["date"]), "year": int(str(e["date"])[:4]), "actor": str(e.get("actor", "")), "scope_all": scope == "all",
                    "countries": countries, "type": str(e.get("type", "")), "title": str(e.get("title", "")), "status": str(e.get("status", "draft")),
                    "verify": bool(e.get("verify", False)), "source_id": e.get("source_id")})
    return out


def _window(series: dict[int, float], t: int) -> tuple[float | None, float | None]:
    pre = [series[t - k] for k in PRE if (t - k) in series]
    post = [series[t + k] for k in POST if (t + k) in series]
    if not pre or not post:
        return None, None
    return float(np.mean(pre)), float(np.mean(post))


def _diffs_at_every_year(series: dict[int, float]) -> dict[int, float]:
    """Post-minus-pre difference at every year where both windows exist."""
    out = {}
    for t in sorted(series):
        pre, post = _window(series, t)
        if pre is not None and post is not None:
            out[t] = post - pre
    return out


def event_effects(events: list[dict], shares: pd.DataFrame, n_perm: int = N_PERM, seed: int = 20261009) -> pd.DataFrame:
    """`shares`: country, year, share_us, share_cn (mineral "all", exports). Returns one row per event × actor × country
    (design `window`) plus, for scoped events with enough controls, one row per event × actor for the treated group
    (design `did`)."""
    cols = ["event_id", "event_date", "event_year", "event_status", "event_verify", "event_actor", "event_type", "event_title", "event_source_id", "event_scope",
            "country", "actor", "outcome", "design", "pre_mean", "post_mean", "diff", "placebo_p", "n_placebo", "treated_countries", "control_countries", "note"]
    if not events or shares.empty:
        return pd.DataFrame(columns=cols)
    rng = np.random.default_rng(seed)
    series: dict[tuple[str, str], dict[int, float]] = {}
    for r in shares.itertuples(index=False):
        for actor, col in (("US", "share_us"), ("CN", "share_cn")):
            v = getattr(r, col)
            if v is not None and not pd.isna(v):
                series.setdefault((r.country, actor), {})[int(r.year)] = float(v)
    all_diffs = {k: _diffs_at_every_year(v) for k, v in series.items()}
    rows: list[dict] = []
    for e in events:
        t = e["year"]
        base = {"event_id": e["id"], "event_date": e["date"], "event_year": t, "event_status": e["status"], "event_verify": e["verify"], "event_actor": e["actor"],
                "event_type": e["type"], "event_title": e["title"], "event_source_id": e["source_id"], "event_scope": "all" if e["scope_all"] else ",".join(e["countries"])}
        for actor in ("US", "CN"):
            outcome = f"export_share_{actor.lower()}"
            treated_diffs: dict[str, float] = {}
            for iso in e["countries"]:
                s = series.get((iso, actor))
                if not s:
                    continue
                pre, post = _window(s, t)
                if pre is None:
                    rows.append({**base, "country": iso, "actor": actor, "outcome": outcome, "design": "window", "pre_mean": None, "post_mean": None, "diff": None,
                                 "placebo_p": None, "n_placebo": 0, "treated_countries": iso, "control_countries": "", "note": "window not covered by the reported trade series"})
                    continue
                diff = post - pre
                treated_diffs[iso] = diff
                placebo = [d for yr, d in all_diffs[(iso, actor)].items() if abs(yr - t) > max(PRE + POST)]
                p = (1 + sum(1 for d in placebo if abs(d) >= abs(diff))) / (1 + len(placebo)) if placebo else None
                rows.append({**base, "country": iso, "actor": actor, "outcome": outcome, "design": "window", "pre_mean": round(pre, 4), "post_mean": round(post, 4),
                             "diff": round(diff, 4), "placebo_p": round(p, 3) if p is not None else None, "n_placebo": len(placebo), "treated_countries": iso, "control_countries": "",
                             "note": f"mean share in {t + POST[0]}–{t + POST[1]} minus {t - PRE[0]}–{t - PRE[1]}; placebo: the same statistic at the series' other years"})
            if e["scope_all"] or not treated_diffs:
                continue
            controls = {iso: all_diffs[(iso, actor)].get(t) for iso in IN_SCOPE if iso not in e["countries"] and (iso, actor) in all_diffs}
            controls = {k: v for k, v in controls.items() if v is not None}
            if len(controls) < MIN_CONTROL:
                rows.append({**base, "country": "treated", "actor": actor, "outcome": outcome, "design": "did", "pre_mean": None, "post_mean": None, "diff": None,
                             "placebo_p": None, "n_placebo": 0, "treated_countries": ",".join(sorted(treated_diffs)), "control_countries": ",".join(sorted(controls)),
                             "note": f"fewer than {MIN_CONTROL} control countries with data around {t}"})
                continue
            did = float(np.mean(list(treated_diffs.values())) - np.mean(list(controls.values())))
            pool = {**treated_diffs, **controls}
            names = sorted(pool)
            values = np.array([pool[n] for n in names])
            k = len(treated_diffs)
            perms = []
            for _ in range(n_perm):
                idx = rng.choice(len(names), size=k, replace=False)
                mask = np.zeros(len(names), dtype=bool)
                mask[idx] = True
                perms.append(values[mask].mean() - values[~mask].mean())
            p = (1 + sum(1 for d in perms if abs(d) >= abs(did))) / (1 + len(perms))
            rows.append({**base, "country": "treated", "actor": actor, "outcome": outcome, "design": "did",
                         "pre_mean": round(float(np.mean(list(treated_diffs.values()))), 4), "post_mean": round(float(np.mean(list(controls.values()))), 4), "diff": round(did, 4),
                         "placebo_p": round(p, 3), "n_placebo": len(perms), "treated_countries": ",".join(sorted(treated_diffs)), "control_countries": ",".join(sorted(controls)),
                         "note": "difference-in-differences: mean post-minus-pre change of the treated countries minus that of the controls (pre_mean/post_mean hold the two group means); placebo: random country subsets of the same size"})
    return pd.DataFrame(rows, columns=cols)
