"""Cross-layer contrasts, scenario inputs and findings for the site's Insights page (export-time, pure functions).

The quant tables measure each layer on its own; this module sets them against each other: what executives say
(the owner's coded statements), what legislatures and media say (text-model outputs), what the money and the
minerals do (documented finance, reported trade), what the backtested models expect (forecasts and their stated
scenarios) and what the event studies and panel regressions can support. Every contrast and every finding carries
the ids of the rows it rests on and an honest `n`; a contrast or a finding is produced only when its inputs exist,
never estimated. Scales differ and are kept apart (statements −1..+1 under the dataset's codebook, legislative
stance −2..+2 from the zero-shot model, media tone −1..+1, the index 0–100) and are named wherever they meet. The
same file carries what the scenario studio needs on the client (component scales, latest components, GDP, forecast
paths, prices, event echoes) so every what-if on the site is plain arithmetic on published numbers. The written
interpretation is read from data/manual/interpretation/insights.md and labelled by its front matter."""
from __future__ import annotations

import re
import statistics
from pathlib import Path

import numpy as np

from .quant.briefs import HUMAN_DIR, Section, join, load_human, musd, pct, pts
from .quant.forecast import HORIZON_YEAR, SCENARIOS
from .quant.index import COMPONENTS, MIN_COMPONENTS, NAMES, WINSOR
from .quant.inputs import SWAP_RE
from .registry import COUNTRIES, IN_SCOPE

INSIGHTS_VERSION = "2026.10"
ACTOR = {"US": "the United States", "CN": "China"}
ADJ = {"US": "US", "CN": "Chinese"}
BLOC_EXEC, BLOC_LEG, BLOC_US, BLOC_CN = "LatAm executive", "LatAm legislature", "United States", "China"
STANCE_CODES = ("positive", "neutral", "mixed", "negative", "not_mentioned")
POSITIONS = ("positive", "neutral", "mixed", "negative")
POOL_YEARS = 3  # latest statement years pooled for a words-vs-trade contrast
MIN_STANCE_N = 3  # coded statements needed for a pooled stance
MIN_HEDGE_N = 4  # positive statements toward the two actors together needed for a hedging balance
MIN_ECHO_N = 3  # event-country windows needed before an event family is offered as a shock
MIN_MENTIONS = 5  # specific mineral mentions needed for a talk-vs-trade contrast
MIN_PRICE_MUSD = 10.0  # exports of a mineral below this are not worth a price lever
CN_WINDOW, US_WINDOW = (2015, 2021), (2022, 2024)  # AidData's last seven years; the DFC years after them
WARM, COOL = 0.34, -0.34  # mean coded stance above/below which words are called warm/cool
BIG, SMALL = 0.25, 0.10  # export shares above/below which trade is called large/small
GENERAL = {"critical_minerals_general", "mining_general"}
MINERAL_ALIAS = {"antimony": "gallium_germanium_antimony", "gallium": "gallium_germanium_antimony", "germanium": "gallium_germanium_antimony",
                 "aluminum": "bauxite_aluminum", "aluminium": "bauxite_aluminum", "bauxite": "bauxite_aluminum", "phosphate": "phosphate_potash",
                 "potash": "phosphate_potash", "iron": "iron_ore", "rare_earth_elements": "rare_earths"}
SCALES = {"statements": "coded stance −1..+1 (the dataset's codebook, interpretive, not validated)",
          "legislative_stance": "zero-shot text model −2..+2 (not yet validated)", "media_tone": "zero-shot text model −1..+1", "index": "0–100, winsorised min–max over the panel"}


# ---------------------------------------------------------------- small helpers

def _num(v) -> float | None:
    if v is None:
        return None
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return None if f != f else f


def _r(v, d: int = 3) -> float | None:
    f = _num(v)
    return None if f is None else round(f, d)


def _mean(xs: list[float]) -> float | None:
    return round(sum(xs) / len(xs), 3) if xs else None


def _m(v: float | None) -> str:
    return musd(float(v) * 1e6) if v is not None else "an unknown amount"


def _pretty(mineral: str) -> str:
    return mineral.replace("_", " ")


def _family_label(event_actor: str, event_type: str) -> str:
    kind = event_type.replace("_", " ")
    if event_actor in ADJ:
        return f"{ADJ[event_actor]} {kind} measures"
    return f"{COUNTRIES.get(event_actor, event_actor)}'s own {kind}"


# ---------------------------------------------------------------- statements

def _scores(rows: list[dict], actor: str) -> list[float]:
    key = f"stance_{actor.lower()}_score"
    return [s for s in (_num(r.get(key)) for r in rows) if s is not None]


def statement_series(rows: list[dict]) -> list[dict]:
    """Per year: statements, and the mean coded stance toward each actor over the statements that take a position."""
    by: dict[int, dict] = {}
    for r in rows:
        y = int(r["year"])
        b = by.setdefault(y, {"year": y, "n": 0, "cn": [], "us": []})
        b["n"] += 1
        for a in ("cn", "us"):
            s = _num(r.get(f"stance_{a}_score"))
            if s is not None:
                b[a].append(s)
    return [{"year": b["year"], "n": b["n"], "stance_cn": _mean(b["cn"]), "n_cn": len(b["cn"]), "stance_us": _mean(b["us"]), "n_us": len(b["us"])}
            for b in sorted(by.values(), key=lambda x: x["year"])]


def pooled_stance(rows: list[dict], actor: str, pool_years: int = POOL_YEARS, min_n: int = MIN_STANCE_N) -> dict | None:
    """Mean coded stance toward the actor over the latest `pool_years` statement years; None under `min_n` positions."""
    years = sorted({int(r["year"]) for r in rows})
    if not years:
        return None
    keep = years[-pool_years:]
    sel = [r for r in rows if int(r["year"]) in keep]
    scores = _scores(sel, actor)
    if len(scores) < min_n:
        return None
    return {"mean": _mean(scores), "n": len(scores), "years": [keep[0], keep[-1]], "n_statements": len(sel)}


def stance_counts(rows: list[dict]) -> dict:
    out = {"cn": dict.fromkeys(STANCE_CODES, 0), "us": dict.fromkeys(STANCE_CODES, 0)}
    for r in rows:
        for a in ("cn", "us"):
            v = r.get(f"stance_{a}")
            out[a][v if v in STANCE_CODES else "not_mentioned"] += 1
    return out


def _n_positions(counts: dict) -> int:
    return sum(counts[k] for k in POSITIONS)


def mineral_mentions(rows: list[dict], known: list[str]) -> dict[str, int]:
    """Minerals named in the statements, mapped to the warehouse's core ids; general labels count as `general`, the rest as `other`."""
    counts: dict[str, int] = {}
    for r in rows:
        for raw in str(r.get("minerals") or "").split(","):
            m = raw.strip()
            if not m:
                continue
            k = "general" if m in GENERAL else MINERAL_ALIAS.get(m, m)
            if k != "general" and k not in known:
                k = "other"
            counts[k] = counts.get(k, 0) + 1
    return counts


# ---------------------------------------------------------------- trade, finance, components, forecasts

def _total(e: dict) -> float:
    return (e.get("US") or 0.0) + (e.get("CN") or 0.0) + (e.get("ROW") or 0.0)


def minerals_latest(trade_raw: list[dict], iso: str, year: int) -> list[dict]:
    """Every mineral the country reported exporting in the year (reported rows, world total present), largest first."""
    agg: dict[str, dict] = {}
    for r in trade_raw or []:
        if r.get("reporter") != iso or int(r.get("year") or 0) != year or r.get("value_type") != "reported" or r.get("mineral") in (None, "all"):
            continue
        slot = {"CHN": "CN", "USA": "US", "WLD": "WLD"}.get(r.get("partner"))
        if slot:
            a = agg.setdefault(r["mineral"], {"CN": None, "US": None, "WLD": None})
            a[slot] = (a[slot] or 0.0) + float(r["value_usd"])
    out = []
    for mineral, a in agg.items():
        if a["WLD"] is None or a["WLD"] <= 0:
            continue
        e = {"US": round(a["US"] / 1e6, 3) if a["US"] is not None else None, "CN": round(a["CN"] / 1e6, 3) if a["CN"] is not None else None,
             "ROW": round((a["WLD"] - (a["CN"] or 0.0) - (a["US"] or 0.0)) / 1e6, 3)}
        out.append({"mineral": mineral, "exports_musd": e, "total_musd": round(a["WLD"] / 1e6, 3)})
    return sorted(out, key=lambda m: -m["total_musd"])


def trade_latest(trade_rows: list[dict], iso: str, trade_raw: list[dict] | None = None) -> dict | None:
    """The latest reported trade year of the country (flows.json rows): totals, shares and the minerals (from the raw
    reported rows when given, else the core minerals the flows file carries)."""
    rows = [r for r in trade_rows if r["iso3"] == iso and r["exports_musd"].get("ROW") is not None]
    years = [r["year"] for r in rows if r["mineral"] == "all" and _total(r["exports_musd"]) > 0]
    if not years:
        return None
    year = max(years)
    allrow = next(r for r in rows if r["year"] == year and r["mineral"] == "all")
    t = _total(allrow["exports_musd"])
    minerals = minerals_latest(trade_raw, iso, year) if trade_raw else sorted(
        ({"mineral": r["mineral"], "exports_musd": r["exports_musd"], "total_musd": _r(_total(r["exports_musd"]), 3)} for r in rows if r["year"] == year and r["mineral"] != "all"),
        key=lambda m: -(m["total_musd"] or 0))
    return {"year": year, "exports_musd": allrow["exports_musd"], "total_musd": _r(t, 3), "share_cn": _r((allrow["exports_musd"].get("CN") or 0.0) / t, 4),
            "share_us": _r((allrow["exports_musd"].get("US") or 0.0) / t, 4), "minerals": minerals, "source_id": allrow.get("source_id")}


def trade_series(trade_rows: list[dict], iso: str) -> list[dict]:
    out = []
    for r in sorted(trade_rows, key=lambda r: r["year"]):
        if r["iso3"] != iso or r["mineral"] != "all" or r["exports_musd"].get("ROW") is None:
            continue
        t = _total(r["exports_musd"])
        if t <= 0:
            continue
        e = r["exports_musd"]
        out.append({"year": r["year"], "share_cn": _r((e.get("CN") or 0.0) / t, 4), "share_us": _r((e.get("US") or 0.0) / t, 4), "total_musd": _r(t, 1)})
    return out


def finance_summary(fin_rows: list[dict], iso: str) -> dict:
    """Documented commitments by year and origin (flows.json rows) with the two comparison windows."""
    by: dict[int, dict] = {}
    for r in fin_rows:
        if r["iso3"] != iso:
            continue
        b = by.setdefault(r["year"], {"year": r["year"], "US": None, "CN": None, "n_US": 0, "n_CN": 0})
        b[r["origin"]] = _r(r["amount_musd"], 2)
        b[f"n_{r['origin']}"] = int(r["n_events"])
    by_year = sorted(by.values(), key=lambda x: x["year"])

    def window(origin: str, lo: int, hi: int) -> float:
        return round(sum((b[origin] or 0.0) for b in by_year if lo <= b["year"] <= hi), 2)

    return {"by_year": by_year, "cn_2015_21": window("CN", *CN_WINDOW), "us_2015_21": window("US", *CN_WINDOW), "us_2022_24": window("US", *US_WINDOW),
            "windows": {"CN": list(CN_WINDOW), "US_after": list(US_WINDOW)}}


def component_scales(comp_rows: list[dict]) -> dict[str, dict]:
    """The normalisation bounds the index used (winsorised percentiles of the raw values, pooled over the panel), so the
    client can map a what-if raw value to the 0–100 scale with the same formula as `quant.index.normalise`."""
    out = {}
    for name in NAMES:
        v = np.array([x for x in (_num(r["raw_value"]) for r in comp_rows if r["component"] == name and bool(r.get("available"))) if x is not None], dtype=float)
        if len(v) == 0:
            continue
        lo, hi = float(np.nanpercentile(v, WINSOR[0])), float(np.nanpercentile(v, WINSOR[1]))
        out[name] = {"lo": lo, "hi": hi, "n": int(len(v))}
    return out


def components_latest(comp_rows: list[dict], idx_rows: list[dict], iso: str) -> dict:
    """Per actor: the six components of the latest year with a published composite, and that composite."""
    out = {}
    for actor in ("US", "CN"):
        pub = [r for r in idx_rows if r["country"] == iso and r["actor"] == actor and r["mineral"] == "all" and r["index_name"] == "influence" and _num(r["value"]) is not None]
        if not pub:
            continue
        p = max(pub, key=lambda r: int(r["year"]))
        y = int(p["year"])
        comps = [{"name": r["component"], "raw_value": _num(r["raw_value"]), "normalized_value": _num(r.get("normalized_value")), "available": bool(r.get("available")), "note": r.get("note")}
                 for r in comp_rows if r["country"] == iso and r["actor"] == actor and r["mineral"] == "all" and int(r["year"]) == y]
        comps.sort(key=lambda c: NAMES.index(c["name"]) if c["name"] in NAMES else 99)
        out[actor] = {"year": y, "components": comps, "published": {"value": _num(p["value"]), "lower": _num(p["lower"]), "upper": _num(p["upper"]), "n_components": int(p["n_components"])}}
    return out


def forecast_paths(fc_rows: list[dict], iso: str) -> dict | None:
    rows = [r for r in fc_rows if r["country"] == iso and (r.get("mineral") or "all") == "all"]
    if not rows:
        return None
    paths: dict = {}
    status: dict = {}
    for r in sorted(rows, key=lambda r: int(r["horizon_year"])):
        paths.setdefault(r["target"], {}).setdefault(r["actor"], {}).setdefault(r["scenario_id"], []).append(
            {"year": int(r["horizon_year"]), "point": _r(r["point"], 4), "p05": _r(r["p05"], 4), "p25": _r(r["p25"], 4), "p75": _r(r["p75"], 4), "p95": _r(r["p95"], 4)})
        status[f"{r['target']}:{r['actor']}"] = {"last_observed_year": int(r["last_observed_year"]), "model": r["model"]}
    return {"paths": paths, "status": status}


# ---------------------------------------------------------------- region-wide blocks

def event_echoes(effect_rows: list[dict]) -> list[dict]:
    """Post-minus-pre changes of the export share grouped by event family (the event's actor and type) and the share's actor."""
    groups: dict[tuple, dict] = {}
    for r in effect_rows:
        d = _num(r.get("diff"))
        if r.get("design") != "window" or d is None:
            continue
        key = (r["event_actor"], r["event_type"], r["actor"])
        g = groups.setdefault(key, {"family": f"{r['event_actor']}:{r['event_type']}", "event_actor": r["event_actor"], "event_type": r["event_type"],
                                    "label": _family_label(r["event_actor"], r["event_type"]), "actor": r["actor"], "diffs": [], "events": set(), "countries": set(), "windows": []})
        g["diffs"].append(d)
        g["events"].add(r["event_id"])
        g["countries"].add(r["country"])
        g["windows"].append({"event_id": r["event_id"], "country": r["country"], "year": int(r["event_year"]), "diff": _r(d, 4),
                             "placebo_p": _num(r.get("placebo_p")), "status": r.get("event_status")})
    out = []
    for g in groups.values():
        d = g["diffs"]
        out.append({"family": g["family"], "event_actor": g["event_actor"], "event_type": g["event_type"], "label": g["label"], "actor": g["actor"], "n": len(d),
                    "mean": _r(statistics.fmean(d), 4), "median": _r(statistics.median(d), 4), "p25": _r(float(np.percentile(d, 25)), 4), "p75": _r(float(np.percentile(d, 75)), 4),
                    "events": sorted(g["events"]), "countries": sorted(g["countries"]), "all_draft": all(w["status"] != "reviewed" for w in g["windows"]),
                    "windows": sorted(g["windows"], key=lambda w: (w["year"], w["country"]))})
    return sorted(out, key=lambda e: (e["family"], e["actor"]))


def regression_block(reg_rows: list[dict], gov: list[dict]) -> dict:
    rows = [{"spec": r["spec"], "outcome": r["outcome"], "actor": r["actor"], "term": r["term"], "coef": _num(r["coef"]), "se": _num(r["se"]), "p_cluster": _num(r.get("p_cluster")),
             "p_wild": _num(r.get("p_wild")), "jk_min": _num(r.get("jk_min")), "jk_max": _num(r.get("jk_max")), "n_obs": int(r["n_obs"]), "n_countries": int(r["n_countries"]),
             "years": r["years"], "r2_within": _num(r.get("r2_within"))} for r in reg_rows if r.get("variant") == "twfe"]
    sds = {}
    for ind, name in (("v2x_polyarchy", "electoral_democracy"), ("RL.EST", "rule_of_law")):
        vals = [(float(g["value"]), g["country"], int(g["year"])) for g in gov
                if g.get("indicator") == ind and g.get("country") in IN_SCOPE and 2009 <= int(g["year"]) <= 2021 and _num(g.get("value")) is not None]
        if len(vals) >= 10:
            v = np.array([x[0] for x in vals])
            lo, hi = min(vals), max(vals)
            sds[name] = {"sd": _r(float(v.std()), 4), "mean": _r(float(v.mean()), 4), "n": len(vals), "min": {"value": _r(lo[0], 3), "country": lo[1], "year": lo[2]},
                         "max": {"value": _r(hi[0], 3), "country": hi[1], "year": hi[2]},
                         "note": "standard deviation of the twelve countries' 2009–2021 values in the governance table, approximately the estimation sample"}
    return {"rows": rows, "regressor_sd": sds, "note": "two-way fixed effects (country and year); regressors standardised, a coefficient is share points per one standard deviation; associations, not causal estimates"}


def price_block(prices: list[dict], core: list[str]) -> dict:
    """One annual series per core mineral that has one: the monthly Pink Sheet series averaged by year, else the USGS annual series."""
    by: dict[tuple, dict] = {}
    for r in prices:
        p = _num(r.get("price"))
        if r.get("mineral") not in core or p is None or r.get("year") is None:
            continue
        key = (r["mineral"], r["source_id"], r["series"])
        by.setdefault(key, {"unit": r.get("unit"), "years": {}})["years"].setdefault(int(r["year"]), []).append(p)
    out = {}
    for mineral in core:
        cands = sorted(((k, v) for k, v in by.items() if k[0] == mineral), key=lambda kv: (0 if kv[0][1] == "wb_pink_sheet" else 1, kv[0][2]))
        if not cands:
            continue
        (_, sid, series), v = cands[0]
        annual = [{"year": y, "avg": round(sum(p) / len(p), 2), "n_obs": len(p)} for y, p in sorted(v["years"].items()) if y >= 2008]
        if not annual:
            continue
        last = annual[-1]
        decade = [a for a in annual if a["year"] >= last["year"] - 10]
        out[mineral] = {"source_id": sid, "series": series, "unit": v["unit"], "span": [annual[0]["year"], last["year"]], "latest": last,
                        "min_10y": min(decade, key=lambda a: a["avg"]), "max_10y": max(decade, key=lambda a: a["avg"]), "annual": annual}
    return out


def policy_attention(policy: list[dict]) -> list[dict]:
    by: dict[int, dict] = {}
    for p in policy:
        if p.get("jurisdiction") != "US" or p.get("year") is None or int(p["year"]) < 2008:
            continue
        b = by.setdefault(int(p["year"]), {"year": int(p["year"]), "n": 0, "by_source": {}})
        b["n"] += 1
        b["by_source"][p["source_id"]] = b["by_source"].get(p["source_id"], 0) + 1
    return sorted(by.values(), key=lambda b: b["year"])


def talk_vs_money(stm: list[dict], flow_finance: list[dict], fin: list[dict], last_year: dict | None = None) -> dict:
    """Statements by speaker bloc (in-scope countries and the region) against documented commitments by origin."""
    kept = [r for r in stm if r["country"] in IN_SCOPE or r["country"] == "REG"]
    blocs: dict[str, list[dict]] = {}
    for r in kept:
        blocs.setdefault(r["speaker_bloc"], []).append(r)
    by_bloc = [{"bloc": b, "n": len(v), "stance": stance_counts(v)} for b, v in sorted(blocs.items(), key=lambda kv: -len(kv[1]))]
    swap = re.compile(SWAP_RE)

    def window(origin: str, lo: int, hi: int) -> float:
        return round(sum(r["amount_musd"] for r in flow_finance if r["origin"] == origin and lo <= r["year"] <= hi), 2)

    def tagged(origin: str, lo: int, hi: int) -> float:
        total = 0.0
        for r in fin:
            if r.get("actor_from_origin") != origin or r.get("country") not in IN_SCOPE or r.get("year") is None or not (lo <= int(r["year"]) <= hi):
                continue
            if r.get("confidence") != "documented" or r.get("amount_usd") is None or swap.search(f"{r.get('description') or ''} {r.get('type') or ''}"):
                continue
            if str(r.get("mineral") or "none").lower() in ("none", "", "nan"):
                continue
            total += float(r["amount_usd"]) / 1e6
        return round(total, 2)

    def sources(origin: str) -> list[str]:
        return sorted({str(r["source_id"]) for r in fin if r.get("actor_from_origin") == origin and r.get("country") in IN_SCOPE and r.get("source_id")})

    finance = {"CN": {"years": list(CN_WINDOW), "musd": window("CN", *CN_WINDOW), "mineral_tagged_musd": tagged("CN", *CN_WINDOW), "sources": sources("CN")},
               "US": {"years": list(CN_WINDOW), "musd": window("US", *CN_WINDOW), "mineral_tagged_musd": tagged("US", *CN_WINDOW), "sources": sources("US")},
               "US_after": {"years": list(US_WINDOW), "musd": window("US", *US_WINDOW), "mineral_tagged_musd": tagged("US", *US_WINDOW)}}
    n_us, n_cn = len(blocs.get(BLOC_US, [])), len(blocs.get(BLOC_CN, []))
    ratios = {"statements_us_over_cn": round(n_us / n_cn, 2) if n_cn else None,
              "money_cn_over_us_2015_21": round(finance["CN"]["musd"] / finance["US"]["musd"], 1) if finance["US"]["musd"] else None}
    years = sorted({int(r["year"]) for r in kept} | {r["year"] for r in flow_finance})
    ly = last_year or {}
    attention = []
    for y in years:  # a year beyond a finance source's coverage is null, never zero
        us_sum = round(sum(r["amount_musd"] for r in flow_finance if r["origin"] == "US" and r["year"] == y), 2)
        cn_sum = round(sum(r["amount_musd"] for r in flow_finance if r["origin"] == "CN" and r["year"] == y), 2)
        attention.append({"year": y, "statements": sum(1 for r in kept if int(r["year"]) == y), "us_statements": sum(1 for r in blocs.get(BLOC_US, []) if int(r["year"]) == y),
                          "dfc_musd": None if ly.get("finance_US") and y > ly["finance_US"] else us_sum, "cn_musd": None if ly.get("finance_CN") and y > ly["finance_CN"] else cn_sum})
    return {"n_statements": len(kept), "by_bloc": by_bloc, "finance": finance, "ratios": ratios, "by_year": attention,
            "note": "both finance sources record commitments in every sector; the part the adapters tagged to a mineral is shown apart"}


# ---------------------------------------------------------------- per-country assembly and contrasts

def country_contrasts(c: dict) -> list[dict]:
    out: list[dict] = []
    iso, t, w, f = c["iso3"], c["trade"], c["words"], c["finance"]
    if t:
        for actor in ("CN", "US"):
            p = w["executive_pooled"].get(actor)
            share = t[f"share_{actor.lower()}"]
            if p and share is not None:
                words = "warm" if p["mean"] >= WARM else "cool" if p["mean"] <= COOL else "mixed"
                trade = "large" if share >= BIG else "small" if share <= SMALL else "middling"
                out.append({"id": f"words_vs_trade_{actor.lower()}", "kind": "words_vs_trade", "actor": actor, "stance": p["mean"], "n": p["n"], "years": p["years"],
                            "share": share, "trade_year": t["year"], "label": f"{words} words, {trade} trade",
                            "inputs": [f"statement:stance_{actor.lower()}:{iso}:{p['years'][0]}-{p['years'][1]}", f"flow_trade:share_{actor.lower()}:{iso}:{t['year']}"],
                            "caveat": "the stance is the dataset's own coding (not validated) pooled over the latest statement years; the share is the latest reported trade year"})
        e = t["exports_musd"]
        cn, us = e.get("CN") or 0.0, e.get("US") or 0.0
        if cn > 0 or us > 0:
            gap = (cn - us) / 2 if cn > us else 0.0
            top = max(t["minerals"], key=lambda m: m["exports_musd"].get("CN") or 0.0) if t["minerals"] else None
            out.append({"id": "parity_gap", "kind": "parity_gap", "year": t["year"], "musd": round(gap, 1), "cn_musd": round(cn, 1), "us_musd": round(us, 1),
                        "multiple_of_us": round(gap / us, 1) if us > 0 else None, "us_ahead": us >= cn, "top_mineral": top["mineral"] if top else None,
                        "top_mineral_cn_musd": round(top["exports_musd"].get("CN") or 0.0, 1) if top else None,
                        "reachable_with_top_mineral": ((top["exports_musd"].get("CN") or 0.0) >= gap) if top else None,
                        "inputs": [f"flow_trade:{iso}:all:{t['year']}"] + ([f"flow_trade:{iso}:{top['mineral']}:{t['year']}"] if top else []),
                        "caveat": "arithmetic on reported exports at constant totals: what would have to change hands for equal shares, not a forecast"})
        mentions = w["minerals_talked"]
        specific = {k: v for k, v in mentions.items() if k not in ("general", "other")}
        n_m = sum(specific.values())
        tot = t["total_musd"] or 0.0
        if n_m >= MIN_MENTIONS and tot > 0:
            val = {m["mineral"]: (m["total_musd"] or 0.0) / tot for m in t["minerals"]}
            rest = 1.0 - sum(val.values())
            if rest > 0.005:
                val["other"] = rest  # minerals in the total that have no row of their own (or none reported by mineral)
            keys = set(specific) | set(val)
            mism = 0.5 * sum(abs(specific.get(k, 0) / n_m - val.get(k, 0.0)) for k in keys)
            rows = sorted(({"mineral": k, "mentions": specific.get(k, 0), "mention_share": round(specific.get(k, 0) / n_m, 3), "value_share": round(val.get(k, 0.0), 3),
                            "musd": round(val.get(k, 0.0) * tot, 1)} for k in keys), key=lambda r: -r["value_share"])
            out.append({"id": "talk_vs_trade_minerals", "kind": "talk_vs_trade", "year": t["year"], "mismatch": round(mism, 3), "n_mentions": n_m, "n_general": mentions.get("general", 0),
                        "n_other": mentions.get("other", 0), "total_musd": round(tot, 1), "rows": rows, "inputs": [f"statement:minerals:{iso}", f"flow_trade:{iso}:minerals:{t['year']}"],
                        "caveat": "mentions count the minerals named in domestic executive and legislative statements (several per statement); value shares are reported exports of the core minerals in the latest trade year"})
        fc = c["forecast"]
        cn_paths = (fc or {}).get("paths", {}).get("export_share", {}).get("CN")
        if cn_paths:
            cn30 = {sid: next((p["point"] for p in path if p["year"] == HORIZON_YEAR), None) for sid, path in cn_paths.items()}
            us30 = {sid: next((p["point"] for p in path if p["year"] == HORIZON_YEAR), None) for sid, path in fc["paths"]["export_share"].get("US", {}).items()}
            if all(v is not None for v in cn30.values()) and cn30:
                out.append({"id": "dependence_2030", "kind": "dependence_2030", "share_cn_now": t["share_cn"], "share_us_now": t["share_us"], "year_now": t["year"],
                            "cn_2030": cn30, "us_2030": us30, "min_cn_2030": min(cn30.values()), "max_cn_2030": max(cn30.values()),
                            "inputs": [f"forecast:export_share:CN:{sid}:{HORIZON_YEAR}:{iso}" for sid in cn30] + [f"flow_trade:share_cn:{iso}:{t['year']}"],
                            "caveat": "medians of the published model's paths under each stated yearly shift; the bands are in the forecast block"})
        prices = c.get("_prices") or {}
        exposed = [m for m in t["minerals"] if m["mineral"] in prices and (m["total_musd"] or 0) >= MIN_PRICE_MUSD]
        if exposed:
            top = exposed[0]
            pr = prices[top["mineral"]]
            out.append({"id": "price_exposure", "kind": "price_exposure", "year": t["year"], "mineral": top["mineral"], "exports_musd": top["exports_musd"], "total_musd": top["total_musd"],
                        "price": {"latest": pr["latest"], "unit": pr["unit"], "min_10y": pr["min_10y"], "max_10y": pr["max_10y"], "source_id": pr["source_id"]},
                        "inputs": [f"flow_trade:{iso}:{top['mineral']}:{t['year']}", f"price:{top['mineral']}:{pr['source_id']}:{pr['latest']['year']}"],
                        "caveat": "a price change revalues the reported exports at constant volumes; it says what is at stake, not where the minerals will go"})
    if w["us_officials"]["n"] > 0 and f:
        cnt = w["us_officials"]["counts"]["cn"]
        out.append({"id": "us_words_vs_us_money", "kind": "us_words_vs_money", "n_us_statements": w["us_officials"]["n"], "n_cn_negative": cnt["negative"], "n_cn_positions": _n_positions(cnt),
                    "us_2022_24_musd": f["us_2022_24"], "us_2015_21_musd": f["us_2015_21"], "cn_2015_21_musd": f["cn_2015_21"],
                    "inputs": [f"statement:count:bloc=United States:{iso}", f"flow_finance:US:{iso}:2022-2024", f"flow_finance:CN:{iso}:2015-2021"],
                    "caveat": "statements by US officials about the country; the finance windows differ because AidData ends in 2021 and the DFC record continues"})
    cnt = w["executive_counts"]
    pos_cn, pos_us = cnt["cn"]["positive"], cnt["us"]["positive"]
    if pos_cn + pos_us >= MIN_HEDGE_N:
        out.append({"id": "hedging", "kind": "hedging", "pos_cn": pos_cn, "pos_us": pos_us, "neg_cn": cnt["cn"]["negative"], "neg_us": cnt["us"]["negative"],
                    "balance": round(1 - abs(pos_cn - pos_us) / (pos_cn + pos_us), 3), "n_executive": sum(cnt["cn"].values()),
                    "inputs": [f"statement:stance_counts:{iso}:executive"], "caveat": "counts of coded positions by domestic executives over every year in the dataset; 1 = equally warm to both, 0 = one-sided"})
    ex = {r["year"]: r for r in w["executive"]}
    for pr in reversed(w["parliament"]):
        if pr.get("stance_cn_mean") is None or (pr.get("n_docs") or 0) < 5:
            continue
        e = ex.get(pr["year"])
        if e and e["stance_cn"] is not None:
            out.append({"id": "parliament_vs_executive", "kind": "parliament_vs_executive", "year": pr["year"], "parliament_cn": pr["stance_cn_mean"], "parliament_cn_rescaled": round(pr["stance_cn_mean"] / 2, 3),
                        "n_docs": pr["n_docs"], "executive_cn": e["stance_cn"], "n_exec_cn": e["n_cn"], "parliament_us": pr.get("stance_us_mean"), "executive_us": e["stance_us"], "n_exec_us": e["n_us"],
                        "inputs": [f"document:stance_cn:{iso}:{pr['year']}", f"statement:stance_cn:{iso}:{pr['year']}"],
                        "caveat": "two scales: the legislative stance is a zero-shot model output on −2..+2 (shown halved), the executives' stance the dataset's coding on −1..+1"})
            break
    for mr in reversed(w["media"]):
        if mr.get("tone_cn") is None and mr.get("tone_us") is None:
            continue
        e = ex.get(mr["year"])
        out.append({"id": "media_vs_executive", "kind": "media_vs_executive", "year": mr["year"], "tone_cn": mr.get("tone_cn"), "tone_us": mr.get("tone_us"), "articles_cn": mr.get("articles_cn"),
                    "articles_us": mr.get("articles_us"), "executive_cn": e["stance_cn"] if e else None, "executive_us": e["stance_us"] if e else None,
                    "inputs": [f"media_volume:tone:{iso}:{mr['year']}"] + ([f"statement:stance:{iso}:{mr['year']}"] if e else []),
                    "caveat": "headline tone from the zero-shot model over a handful of coded headlines: thin by construction"})
        break
    sd = [r for r in c["say_do"] if r.get("gap") is not None]
    if sd:
        latest = max(sd, key=lambda r: (r["year"], r["actor"]))
        out.append({"id": "say_do_latest", "kind": "say_do", "year": latest["year"], "actor": latest["actor"], "rhetoric": latest["rhetoric"], "action": latest["action"], "gap": latest["gap"],
                    "n_docs": latest["n_docs"], "inputs": [f"say_do_gap:{latest['actor']}:{iso}:{latest['year']}"], "caveat": "legislative rhetoric from the zero-shot model against the index; the gap is the project's own measure"})
    fl = c["flags"]
    if fl["n"]:
        out.append({"id": "finance_without_trade_response", "kind": "flags", "n": fl["n"], "flags": fl["items"], "inputs": [f"anomaly_flag:{x['id']}" for x in fl["items"]],
                    "caveat": "the flag rule is the project's own: a commitment above 0.5% of GDP followed by no change in the share of exports to the lender"})
    return out


def build_country(iso: str, *, stm: list[dict], trade_rows: list[dict], flow_finance: list[dict], comp_rows: list[dict], idx_rows: list[dict], fc_rows: list[dict],
                  stance_by_iso: dict, volume_by_iso: dict, gov: list[dict], sd_rows: list[dict], flag_rows: list[dict], known_minerals: list[str], prices: dict,
                  trade_raw: list[dict] | None = None) -> dict:
    rows = [r for r in stm if r["country"] == iso]
    exec_rows = [r for r in rows if r["speaker_bloc"] == BLOC_EXEC and r["speaker_country"] == iso]
    leg_rows = [r for r in rows if r["speaker_bloc"] == BLOC_LEG]
    us_rows = [r for r in rows if r["speaker_bloc"] == BLOC_US]
    cn_rows = [r for r in rows if r["speaker_bloc"] == BLOC_CN]
    gdp_rows = [g for g in gov if g.get("country") == iso and g.get("indicator") == "NY.GDP.MKTP.CD" and _num(g.get("value")) is not None]
    gdp = max(gdp_rows, key=lambda g: int(g["year"])) if gdp_rows else None
    flags = [r for r in flag_rows if r["country"] == iso and r["type"] == "finance_without_trade_response"]
    c = {"iso3": iso, "name": COUNTRIES[iso], "trade": trade_latest(trade_rows, iso, trade_raw), "trade_series": trade_series(trade_rows, iso), "finance": finance_summary(flow_finance, iso),
         "gdp_latest": {"year": int(gdp["year"]), "usd": float(gdp["value"]), "source_id": gdp.get("source_id")} if gdp else None,
         "components_latest": components_latest(comp_rows, idx_rows, iso), "forecast": forecast_paths(fc_rows, iso),
         "words": {"n_statements": len(rows), "n_executive": len(exec_rows), "executive": statement_series(exec_rows),
                   "executive_pooled": {a: pooled_stance(exec_rows, a) for a in ("CN", "US")}, "executive_counts": stance_counts(exec_rows),
                   "legislature": {"n": len(leg_rows), "counts": stance_counts(leg_rows)},
                   "us_officials": {"n": len(us_rows), "counts": stance_counts(us_rows), "by_year": statement_series(us_rows)},
                   "china_officials": {"n": len(cn_rows), "counts": stance_counts(cn_rows), "by_year": statement_series(cn_rows)},
                   "parliament": stance_by_iso.get(iso, []), "media": volume_by_iso.get(iso, []), "minerals_talked": mineral_mentions(exec_rows + leg_rows, known_minerals)},
         "say_do": [{"year": int(r["year"]), "actor": r["actor"], "rhetoric": _num(r["rhetoric"]), "action": _num(r["action"]), "gap": _num(r["gap"]), "n_docs": int(r["n_docs"])}
                    for r in sd_rows if r["country"] == iso],
         "flags": {"n": len(flags), "items": [{"id": r["flag_id"], "year": int(r["year"]), "actor": r["actor"], "evidence_level": r["evidence_level"], "score": _num(r["score"]), "description": r["description"]}
                                              for r in sorted(flags, key=lambda r: -(_num(r["score"]) or 0))]},
         "_prices": prices}
    c["contrasts"] = country_contrasts(c)
    del c["_prices"]
    return c


# ---------------------------------------------------------------- findings (templates with indicator ids and an evidence level)

def _finding(fid: str, title: str, headline: str, section: Section, level: str, basis: str, caveat: str, countries: list[str] | None = None) -> dict:
    return {"id": fid, "title": title, "headline": headline, "sentences": [{"text": s.text, "ids": s.ids} for s in section.sentences],
            "strength": {"level": level, "basis": basis}, "caveat": caveat, "countries": sorted(set(countries or []))}


def _contrast(c: dict, cid: str) -> dict | None:
    return next((x for x in c["contrasts"] if x["id"] == cid), None)


SOURCE_NAME = {"dfc_projects": "the DFC", "exim_authorizations": "EXIM", "aiddata_gcdf": "AidData", "aei_cgit": "AEI's investment tracker", "bu_codf": "BU's CODF"}


def us_finance_sources(tm: dict) -> str:
    """'the DFC is the only US finance source' or 'US finance comes from the DFC and EXIM', from the sources behind the rows."""
    ids = (tm.get("finance") or {}).get("US", {}).get("sources") or []
    names = [SOURCE_NAME.get(i, i) for i in ids]
    if len(names) == 1:
        return f"{names[0]} is the only US finance source"
    if names:
        return f"US finance comes from {', '.join(names[:-1])} and {names[-1]}"
    return "no US finance source is loaded"


def build_findings(countries: list[dict], region: dict, today: str) -> list[dict]:
    out: list[dict] = []
    tm = region["talk_vs_money"]
    bl = {b["bloc"]: b for b in tm["by_bloc"]}
    us, cn = bl.get(BLOC_US), bl.get(BLOC_CN)
    fin = tm["finance"]
    # F1 who talks, who pays
    if us and cn and fin["CN"]["musd"] and fin["US"]["musd"]:
        s = Section("who_talks_who_pays", "Who talks, who pays")
        s.add(f"United States officials account for {us['n']} of the {tm['n_statements']} statements in the dataset and Chinese officials for {cn['n']}; "
              f"{us['stance']['cn']['negative']} of the {_n_positions(us['stance']['cn'])} US statements that take a position on China are negative, while "
              f"{cn['stance']['cn']['positive']} of the {_n_positions(cn['stance']['cn'])} Chinese statements with a position praise China's role.",
              ["statement:count:bloc=United States", "statement:count:bloc=China", "statement:stance_counts:blocs"])
        s.add(f"The money runs the other way: documented commitments from Chinese institutions to the twelve countries reached {_m(fin['CN']['musd'])} in "
              f"{CN_WINDOW[0]}–{CN_WINDOW[1]} ({_m(fin['CN']['mineral_tagged_musd'])} of it tagged to a mineral by the adapters), US DFC commitments {_m(fin['US']['musd'])} "
              f"in the same years and {_m(fin['US_after']['musd'])} in {US_WINDOW[0]}–{US_WINDOW[1]}.",
              [f"flow_finance:CN:{CN_WINDOW[0]}-{CN_WINDOW[1]}", f"flow_finance:US:{CN_WINDOW[0]}-{CN_WINDOW[1]}", f"flow_finance:US:{US_WINDOW[0]}-{US_WINDOW[1]}"])
        r_s, r_m = tm["ratios"]["statements_us_over_cn"], tm["ratios"]["money_cn_over_us_2015_21"]
        s.add(f"That is {r_s:.1f} US statements for every Chinese one, and {r_m:.1f} Chinese dollars committed for every American one over {CN_WINDOW[0]}–{CN_WINDOW[1]}.",
              ["statement:count:bloc=United States", "statement:count:bloc=China", f"flow_finance:CN:{CN_WINDOW[0]}-{CN_WINDOW[1]}", f"flow_finance:US:{CN_WINDOW[0]}-{CN_WINDOW[1]}"])
        out.append(_finding("who_talks_who_pays", "Who talks, who pays", f"Washington out-talks Beijing {r_s:.1f} to 1; Beijing out-lends Washington {r_m:.1f} to 1", s, "moderate",
                            "statement counts from the owner's dataset (dozens per bloc) against documented commitments; both finance sources record every sector",
                            f"AidData ends in 2021 and {us_finance_sources(tm)}, so the comparison runs on the years both sides cover; the statements were gathered by web search, which favours prominent US voices.",
                            IN_SCOPE))
    # F2 warm words, cold trade (per country)
    for c in countries:
        wc, wu = _contrast(c, "words_vs_trade_cn"), _contrast(c, "words_vs_trade_us")
        if not (wc or wu):
            continue
        s = Section("words_vs_trade", "Words and trade")
        parts, ids = [], []
        for x in (wu, wc):
            if x:
                parts.append(f"{x['stance']:+.2f} toward {ACTOR[x['actor']]} over {x['n']} coded statements of {x['years'][0]}–{x['years'][1]}")
                ids += x["inputs"]
        t = c["trade"]
        s.add(f"{c['name']}'s executives score {join(parts)}; in {t['year']} {pct(t['share_us'])} of the country's mineral exports went to the United States and {pct(t['share_cn'])} to China.", ids)
        n = min(x["n"] for x in (wu, wc) if x)
        capital = {"US": "Washington", "CN": "Beijing"}
        label = "; ".join(f"{x['label'].split(' words')[0]} to {capital[x['actor']]}, {pct(x['share'])} of exports" for x in (wu, wc) if x)
        out.append(_finding(f"words_vs_trade_{c['iso3']}", f"{c['name']}: words and trade", f"{c['name']}: {label}", s, "moderate" if n >= 10 else "thin",
                            f"{n} coded executive statements at the thinnest point against reported exports; the stance coding is the dataset's own and not validated",
                            "A warm word costs nothing and a trade share moves slowly; the two can differ for years without anyone being insincere.", [c["iso3"]]))
    # F3 talk vs trade minerals
    for c in countries:
        x = _contrast(c, "talk_vs_trade_minerals")
        if not x:
            continue
        rows = x["rows"]
        top_talk = max(rows, key=lambda r: r["mentions"])
        top_val = rows[0]
        s = Section("talk_vs_trade", "Talk and trade by mineral")
        lead = (f"{_pretty(top_talk['mineral']).capitalize()} draws {pct(top_talk['mention_share'])} of the mineral mentions in {c['name']}'s domestic statements ({top_talk['mentions']} of {x['n_mentions']}) "
                f"and {pct(top_talk['value_share'])} of its reported mineral export value in {x['year']}")
        if top_val["mineral"] != top_talk["mineral"]:
            lead += f"; {_pretty(top_val['mineral'])} is {pct(top_val['value_share'])} of the value and {pct(top_val['mention_share'])} of the mentions"
        else:
            second = sorted((r for r in rows if r["mineral"] != top_talk["mineral"]), key=lambda r: -r["mentions"])
            if second:
                lead += f"; next most named, {_pretty(second[0]['mineral'])} has {pct(second[0]['mention_share'])} of the mentions and {pct(second[0]['value_share'])} of the value"
        s.add(f"{lead} (mismatch {x['mismatch']:.2f} on a 0–1 scale; {x['n_general']} general mentions left out).", x["inputs"])
        head = f"{c['name']} talks {_pretty(top_talk['mineral'])}, ships {_pretty(top_val['mineral'])}" if top_talk["mineral"] != top_val["mineral"] else f"{c['name']} talks and ships {_pretty(top_val['mineral'])}"
        out.append(_finding(f"talk_vs_trade_{c['iso3']}", f"{c['name']}: talk and trade by mineral", head, s, "moderate" if x["n_mentions"] >= 20 else "thin",
                            f"{x['n_mentions']} specific mineral mentions against reported exports by mineral",
                            "Leaders talk about what is new or contested, not about what already earns the most; mentions are counted, not weighted by importance.", [c["iso3"]]))
    # F4 hedgers
    hedgers = [(c, _contrast(c, "hedging")) for c in countries]
    hedgers = [(c, h) for c, h in hedgers if h and h["balance"] >= 0.5 and h["pos_cn"] >= 2 and h["pos_us"] >= 2]
    if hedgers:
        s = Section("hedging", "Hedging")
        for c, h in hedgers:
            s.add(f"{c['name']}'s executives speak positively of China in {h['pos_cn']} coded statements and of the United States in {h['pos_us']} "
                  f"(negatives {h['neg_cn']} and {h['neg_us']}; balance {h['balance']:.2f}).", h["inputs"])
        n = sum(h["pos_cn"] + h["pos_us"] for _, h in hedgers)
        out.append(_finding("hedging", "Hedging", f"Hedging is the regional strategy: {join([c['name'] for c, _ in hedgers])} praise both powers", s, "moderate" if n >= 20 else "thin",
                            f"{n} positive coded positions across {len(hedgers)} countries", "Praise is cheap and audiences differ: a minister praising both may be talking to two rooms, not hedging a bet.",
                            [c["iso3"] for c, _ in hedgers]))
    # F5 parliament vs palace
    pv = [(c, _contrast(c, "parliament_vs_executive")) for c in countries]
    pv = [(c, x) for c, x in pv if x]
    if pv:
        s = Section("parliament_vs_executive", "Parliament and palace")
        agree, diverge = [], []
        for c, x in pv:
            us_part = f"; toward the United States {x['parliament_us']:+.2f} against {x['executive_us']:+.2f}" if x.get("parliament_us") is not None and x.get("executive_us") is not None else ""
            s.add(f"In {x['year']}, {c['name']}'s legislative records score {x['parliament_cn']:+.2f} toward China on the zero-shot scale (−2..+2, {x['n_docs']} records) while the executives' "
                  f"coded statements score {x['executive_cn']:+.2f} on −1..+1 ({x['n_exec_cn']}){us_part}.", x["inputs"])
            gap = x["parliament_cn_rescaled"] - x["executive_cn"]
            (agree if abs(gap) <= 0.25 else diverge).append((c["name"], gap))
        parts = []
        if diverge:
            parts.append("on China, parliament sounds " + join([f"{'warmer' if g > 0 else 'cooler'} than the palace in {n}" for n, g in diverge]))
        if agree:
            parts.append(("the two agree in " if diverge else "On China, parliament and palace agree in ") + join([n for n, _ in agree]))
        head = "; ".join(parts)
        out.append(_finding("parliament_vs_executive", "Parliament and palace", head, s, "thin", "the legislative stance is an unvalidated zero-shot output and the overlap with coded statements is one year per country",
                            "Different scales, different objects (bills versus speeches) and a single overlapping year: a direction is all that can be compared.", [c["iso3"] for c, _ in pv]))
    # F6 money without trade
    flagged = [(c, _contrast(c, "finance_without_trade_response")) for c in countries]
    flagged = [(c, x) for c, x in flagged if x]
    if flagged:
        s = Section("money_without_trade", "Money that did not move the minerals")
        n = sum(x["n"] for _, x in flagged)
        items = sorted(((c, f) for c, x in flagged for f in x["flags"]), key=lambda cf: -(cf[1]["score"] or 0))[:3]
        largest = [f"{c['name']} {f['year']} ({ACTOR[f['actor']]}, {(f['score'] or 0) * 100:.1f}% of GDP)" for c, f in items]
        names = join([c["name"] for c, _ in flagged])
        s.add(f"{n} commitments across {names} were flagged as finance without a trade response: the share of exports to the lender did not move in the two years after. "
              f"The largest relative to GDP: {join(largest)}.", [i for _, x in flagged for i in x["inputs"]])
        out.append(_finding("money_without_trade", "Money that did not move the minerals", f"{n} large commitments were followed by no shift in the minerals' destination", s, "moderate",
                            "documented commitments and reported trade; the flag rule (above 0.5% of GDP, no share change within two years) is the project's own",
                            "Most of this money went to rail, power and budgets rather than mines; a loan can buy influence without changing where ore is sold.", [c["iso3"] for c, _ in flagged]))
    # F7 what it would take
    gaps = [(c, _contrast(c, "parity_gap")) for c in countries]
    gaps = sorted([(c, x) for c, x in gaps if x and x["musd"] > 0 and x["us_musd"] > 0], key=lambda cx: -cx[1]["musd"])[:5]
    if gaps:
        s = Section("parity", "What it would take")
        items = []
        for c, x in gaps:
            reach = f"{_pretty(x['top_mineral'])} alone {'could' if x['reachable_with_top_mineral'] else 'could not'} cover it" if x["top_mineral"] else "no single mineral is recorded"
            items.append(f"{c['name']} {_m(x['musd'])} ({x['multiple_of_us']:g} times what the United States bought in {x['year']}; {reach})")
        s.add("For the United States to buy as much of each country's minerals as China does, these yearly export values would have to change hands: " + join(items) + ".",
              [i for _, x in gaps for i in x["inputs"]])
        c0, x0 = gaps[0]
        out.append(_finding("parity", "What it would take", f"To match China in {c0['name']}, the United States would have to buy {_m(x0['musd'])} more a year", s, "strong",
                            "arithmetic on reported exports in the latest trade year", "Redirected exports need buyers, smelters, ships and contracts the arithmetic ignores; the totals are held constant.",
                            [c["iso3"] for c, _ in gaps]))
    # F8 the 2030 fork
    forks = [(c, _contrast(c, "dependence_2030")) for c in countries]
    forks = sorted([(c, x) for c, x in forks if x and x["share_cn_now"] is not None], key=lambda cx: -cx[1]["share_cn_now"])[:4]
    if forks:
        s = Section("fork_2030", "The 2030 fork")
        for c, x in forks:
            cn, usx = x["cn_2030"], x["us_2030"]
            us_part = f"; the US share {pct(usx['baseline'])} at baseline and {pct(usx['us_reshoring'])} under reshoring" if usx.get("baseline") is not None and usx.get("us_reshoring") is not None else ""
            s.add(f"{c['name']}: China took {pct(x['share_cn_now'])} of mineral exports in {x['year_now']}; the 2030 medians are {pct(cn['baseline'])} at baseline, {pct(cn['china_pull'])} if the China pull accelerates "
                  f"and {pct(cn['us_reshoring'])} if US sourcing rules bite{us_part}.", x["inputs"])
        floor = min(x["min_cn_2030"] for _, x in forks)
        out.append(_finding("fork_2030", "The 2030 fork", f"Under every published path China still takes at least {pct(floor)} of {join([c['name'] for c, _ in forks])}'s minerals in 2030", s, "moderate",
                            "backtested models (persistence where nothing beat it) with scenarios as stated yearly shifts", "Five-year paths from annual series of at most eighteen points carry wide bands; the scenarios are what-ifs with stated assumptions, not predictions.",
                            [c["iso3"] for c, _ in forks]))
    # F9 after the shock
    echoes = sorted([e for e in region["event_echoes"] if e["n"] >= MIN_ECHO_N and e["actor"] == "CN"], key=lambda e: -abs(e["mean"]))[:3]
    if echoes:
        s = Section("shocks", "After the shock")
        for e in echoes:
            n_ev = len(e["events"])
            basis = f"{e['n']} event-country windows from {n_ev} event{'s' if n_ev != 1 else ''}" + (", all still in draft" if e["all_draft"] else "")
            s.add(f"After {e['label']} ({basis}), the share of exports to China moved {pts(e['mean'])} on average within two years (middle half {pts(e['p25'])} to {pts(e['p75'])}).",
                  [f"event_effect:family={e['family']}:{e['actor']}"])
        e0 = echoes[0]
        draft_flags = [w["status"] != "reviewed" for e in echoes for w in e["windows"]]
        any_draft = any(draft_flags)
        draft_text = "; the event list is still in draft" if draft_flags and all(draft_flags) else "; the event list is still partly in draft" if any_draft else "; the events are reviewed"
        out.append(_finding("shocks", "After the shock", f"What followed {e0['label']}: {pts(e0['mean'])} for China's share within two years", s, "thin",
                            "event windows on annual shares with placebo distributions" + draft_text,
                            "Windows overlap, events cluster in the same years and world prices move everything at once: these are echoes, not effects.",
                            sorted({c for e in echoes for c in e["countries"]})))
    # F10 what the panel says
    reg = {(r["spec"], r["term"]): r for r in region["regressions"]["rows"]}
    r1, r2 = reg.get(("exports_to_cn", "finance_flow_lag1")), reg.get(("imports_from_us", "electoral_democracy"))
    if r1 or r2:
        s = Section("panel", "What the panel says")
        if r1:
            s.add(f"Across the panel ({r1['n_countries']} countries, {r1['years']}), Chinese commitments over the previous three years go with a change of {pts(r1['coef'])} in the share of exports to China the next year "
                  f"per standard deviation (wild-cluster p {r1['p_wild']:.2f}; dropping one country at a time keeps it between {pts(r1['jk_min'])} and {pts(r1['jk_max'])}): the money is not followed by more mineral trade, if anything by slightly less.",
                  ["regression_result:exports_to_cn:twfe:finance_flow_lag1"])
        if r2:
            sd = region["regressions"]["regressor_sd"].get("electoral_democracy")
            sd_part = f" (about {sd['sd']:.2f} on the 0–1 V-Dem index, {COUNTRIES.get(sd['min']['country'], sd['min']['country'])} {sd['min']['year']} to {COUNTRIES.get(sd['max']['country'], sd['max']['country'])} {sd['max']['year']} being {sd['max']['value'] - sd['min']['value']:.2f} apart)" if sd else ""
            s.add(f"The one robust political association runs through imports: a country one standard deviation more democratic{sd_part} buys {pts(r2['coef'], signed=False)} more of its mineral imports from the United States "
                  f"(wild-cluster p {r2['p_wild']:.2f}; {pts(r2['jk_min'])} to {pts(r2['jk_max'])} dropping one country at a time).", ["regression_result:imports_from_us:twfe:electoral_democracy", "governance:v2x_polyarchy:sd"])
        head = "Chinese money does not buy export share" + ("; democracy buys American imports" if r2 else "") if r1 else "Democracy buys American imports"
        out.append(_finding("panel", "What the panel says", head, s, "moderate", "two-way fixed-effects panel with cluster-robust and wild-bootstrap inference and leave-one-country-out ranges; associations only",
                            "Eleven clusters and thirteen years: a single country can move a coefficient, and year effects absorb the price swings that drive most of the variation.", IN_SCOPE))
    # F11 attention vs money
    att = region["attention"]
    with_docs = [a for a in att if a["policy_docs"] > 0]
    if len(with_docs) >= 3:
        first, last_full = with_docs[0], max((a for a in with_docs if a["year"] < int(today[:4])), key=lambda a: a["year"], default=with_docs[-1])
        latest = with_docs[-1]
        dfc_years = [a for a in att if a["dfc_musd"] is not None]
        dfc_last = max(dfc_years, key=lambda a: a["year"]) if dfc_years else None
        dfc_peak = max(dfc_years, key=lambda a: a["dfc_musd"]) if dfc_years else None
        s = Section("attention", "Attention and money")
        so_far = f" ({latest['policy_docs']} so far in {latest['year']})" if latest["year"] > last_full["year"] else ""
        dfc_part = f"{_m(dfc_last['dfc_musd'])} in {dfc_last['year']}, the last year the DFC record covers (its largest year on record: {_m(dfc_peak['dfc_musd'])} in {dfc_peak['year']})" if dfc_last and dfc_peak else "not recorded"
        s.add(f"US policy documents on minerals in the warehouse rose from {first['policy_docs']} in {first['year']} to {last_full['policy_docs']} in {last_full['year']}{so_far}, "
              f"and US officials' statements on the region's minerals from {first['us_statements']} to {last_full['us_statements']}; DFC commitments to the twelve countries were {dfc_part}.",
              [f"policy_document:count:{first['year']}", f"policy_document:count:{last_full['year']}", "statement:count:bloc=United States:by_year"] + ([f"flow_finance:US:{dfc_last['year']}"] if dfc_last else []))
        ratio = last_full["policy_docs"] / first["policy_docs"]
        money = f"DFC money peaked at {_m(dfc_peak['dfc_musd'])} in {dfc_peak['year']}" if dfc_peak else "no DFC commitment is recorded"
        out.append(_finding("attention", "Attention and money", f"Washington's paper trail grew {ratio:.0f}-fold since {first['year']}; {money}", s, "strong",
                            "document counts from Congress.gov and the Federal Register and documented DFC commitments", "The document counts depend on the title filters that select mineral-related records, and a bill is not a dollar.",
                            IN_SCOPE))
    # F12 media (thin)
    media = [(c, _contrast(c, "media_vs_executive")) for c in countries]
    media = [(c, x) for c, x in media if x]
    if media:
        s = Section("media", "What the press says")
        for c, x in media:
            tone = [f"{t:+.2f} toward {ACTOR[a]} over {n} headline" + ("s" if n != 1 else "") for a, t, n in (("CN", x["tone_cn"], x["articles_cn"]), ("US", x["tone_us"], x["articles_us"])) if t is not None]
            ex_part = f"; the executives' coded stance that year was {x['executive_cn']:+.2f} toward China" if x.get("executive_cn") is not None else ""
            s.add(f"In {x['year']} the coded headlines of {c['name']}'s press score {join(tone)}{ex_part}.", x["inputs"])
        out.append(_finding("media", "What the press says", f"Press tone exists for {join([c['name'] for c, _ in media])} only, on a handful of headlines", s, "thin",
                            "zero-shot tone over the few coded headlines that name an actor", "Headlines are short, outlets few and the classifier unvalidated: a direction at most.", [c["iso3"] for c, _ in media]))
    # F13 what this page cannot see
    s = Section("cannot_see", "What this page cannot see")
    with_stm = [c["name"] for c in countries if c["words"]["n_statements"]]
    without = [c["name"] for c in countries if not c["words"]["n_statements"]]
    n_latest = sum(a["statements"] for a in tm["by_year"] if a["year"] == max((a["year"] for a in tm["by_year"]), default=0))
    y_latest = max((a["year"] for a in tm["by_year"]), default=None)
    s.add(f"Coded statements exist for {join(with_stm) if with_stm else 'no country'}" + (f" and for none of {join(without)}" if without else "") +
          (f"; {n_latest} of the {tm['n_statements']} statements are from {y_latest}, a year with no reported trade or finance to set them against." if y_latest else "."),
          ["statement:count:by_country", "statement:count:by_year"])
    statuses = [w["status"] for e in region["event_echoes"] for w in e["windows"]]
    n_draft = sum(1 for st in statuses if st != "reviewed")
    events_part = ("the dated events are all in draft" if statuses and n_draft == len(statuses) else f"{n_draft} of the event windows come from draft events" if n_draft else "the dated events are reviewed") if statuses else "no event study has been computed"
    s.add(f"The legislative stance is a zero-shot model output not yet validated, media tone exists for a few country-years, Chinese lending (AidData) ends in 2021, {us_finance_sources(tm)} and {events_part}.",
          ["quant_run:last_year", "quant_run:text_model", "event_effect:status"])
    s.add("Scales differ (statements −1..+1, legislative stance −2..+2, media tone −1..+1, the index 0–100) and are never added together here.", ["insights:scales"])
    out.append(_finding("cannot_see", "What this page cannot see", "The contrasts rest on thin overlaps and four different scales", s, "strong", "coverage counts", "", IN_SCOPE))
    return out


# ---------------------------------------------------------------- entry point

def build_insights(*, flows: dict, idx_rows: list[dict], comp_rows: list[dict], fc_rows: list[dict], effect_rows: list[dict], reg_rows: list[dict], sd_rows: list[dict],
                   flag_rows: list[dict], stm: list[dict], stance_by_iso: dict, volume_by_iso: dict, gov: list[dict], prices: list[dict], policy: list[dict], fin: list[dict],
                   core: list[str], quant_status: dict, today: str, trade_raw: list[dict] | None = None, known_minerals: list[str] | None = None, human_dir: Path = HUMAN_DIR) -> dict:
    """The whole insights.json: per-country blocks with contrasts, the region-wide blocks, the generated findings and the written text."""
    known = sorted(set(core) | set(known_minerals or []) | {r["mineral"] for r in (trade_raw or []) if r.get("mineral") and r["mineral"] != "all"})
    price_series = price_block(prices, known)
    countries = [build_country(iso, stm=stm, trade_rows=flows["trade"], flow_finance=flows["finance"], comp_rows=comp_rows, idx_rows=idx_rows, fc_rows=fc_rows, stance_by_iso=stance_by_iso,
                               volume_by_iso=volume_by_iso, gov=gov, sd_rows=sd_rows, flag_rows=flag_rows, known_minerals=known, prices=price_series, trade_raw=trade_raw) for iso in IN_SCOPE]
    last_year = quant_status.get("last_year") or {}
    tm = talk_vs_money(stm, flows["finance"], fin, last_year)
    docs = {p["year"]: p for p in policy_attention(policy)}
    years = sorted(set(docs) | {a["year"] for a in tm["by_year"]})
    attention = [{"year": y, "policy_docs": docs.get(y, {}).get("n", 0), "policy_by_source": docs.get(y, {}).get("by_source", {}),
                  **{k: v for k, v in next((a for a in tm["by_year"] if a["year"] == y), {"statements": 0, "us_statements": 0, "dfc_musd": None, "cn_musd": None}).items() if k != "year"}} for y in years if y >= 2008]
    region = {"talk_vs_money": tm, "hedgers": [{"iso3": c["iso3"], **{k: v for k, v in h.items() if k not in ("id", "kind")}} for c in countries for h in [_contrast(c, "hedging")] if h],
              "event_echoes": event_echoes(effect_rows), "event_titles": {r["event_id"]: r.get("event_title") for r in effect_rows if r.get("event_id")},
              "regressions": regression_block(reg_rows, gov), "prices": price_series, "attention": attention,
              "scenarios": [{"id": sc["id"], "name": sc["name"], "assumptions": sc["assumptions"], "delta": sc["delta"]} for sc in SCENARIOS],
              "scales": component_scales(comp_rows),
              "index_rules": {"weight": round(1 / len(COMPONENTS), 4), "min_components": MIN_COMPONENTS, "winsor": list(WINSOR),
                              "components": [{"name": n, "group": g, "definition": d, "source_ids": ids} for n, g, d, ids in COMPONENTS],
                              "formula": "normalised = clip(raw, lo, hi) − lo over hi − lo, times 100; index = mean of the available normalised components (at least three)"}}
    findings = build_findings(countries, region, today)
    human = load_human(human_dir / "insights.md")
    forecast_countries = sorted({c["iso3"] for c in countries if c["forecast"]})
    return {"dataset": "REAL", "generated_on": today, "version": INSIGHTS_VERSION,
            "label": "Contrasts computed from the published tables; every contrast and finding lists the indicators it rests on and its evidence level. Scenarios on the page are arithmetic on these numbers, never stored.",
            "meta": {"last_year": quant_status.get("last_year") or {}, "horizon_year": HORIZON_YEAR, "scales": SCALES, "forecast_countries": forecast_countries,
                     "countries_with_statements": [c["iso3"] for c in countries if c["words"]["n_statements"]], "text_model": quant_status.get("text_model_label"),
                     "method_version": quant_status.get("method_version"), "inputs_release": quant_status.get("inputs_release"), "n_statements": tm["n_statements"]},
            "countries": countries, "region": region, "findings": findings, "human": human}
