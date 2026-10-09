"""Written analysis generated from named indicators (Phase 6), plus the owner's own text.

Every sentence here is produced by a template that fires only when the indicators it cites exist in the
tables computed by `scm analyse`, and every sentence carries the ids of those indicators
(`table:field:actor:year`, `anomaly_flag:<flag_id>`, `forecast:<target>:<actor>:<year>` ...), so the site
can show what each statement rests on. Nothing is estimated or softened: where a table has no row the
brief says so. Model outputs are always named as such in the sentence. The owner's interpretation is read
from Markdown files under data/manual/interpretation/ and stored apart, marked as human-written; the
pipeline never writes those files."""
from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from pathlib import Path

import pandas as pd

from ..paths import PIPELINE_DIR
from ..registry import COUNTRIES, IN_SCOPE

TEMPLATE_VERSION = "2026.10"
HUMAN_DIR = PIPELINE_DIR.parent / "data" / "manual" / "interpretation"
ACTOR = {"US": "the United States", "CN": "China"}
ADJ = {"US": "US", "CN": "Chinese"}
OUTCOME = {"export_share_cn": "the share of exports going to China", "export_share_us": "the share of exports going to the United States",
           "import_share_cn": "the share of imports coming from China", "import_share_us": "the share of imports coming from the United States"}
FLAT_INDEX = 2.0  # index points over five years below which the change is "broadly flat"
FLAT_SHARE = 0.03  # share change (3 points) below which the change is "broadly flat"
TOP_MINERALS = 3
TOP_EVENTS = 3


@dataclass
class Sentence:
    text: str
    ids: list[str]


@dataclass
class Section:
    key: str
    title: str
    sentences: list[Sentence] = field(default_factory=list)

    def add(self, text: str, ids: list[str]) -> None:
        if text:
            self.sentences.append(Sentence(text, sorted(set(ids))))


# ---------------------------------------------------------------- formatting

def pct(x: float) -> str:
    v = float(x) * 100
    return f"{v:.1f}%" if v < 10 else f"{v:.0f}%"


def pts(x: float, signed: bool = True) -> str:
    v = float(x) * 100
    return f"{v:+.1f} points" if signed else f"{abs(v):.1f} points"


def musd(x: float) -> str:
    x = float(x)
    return f"US${x / 1e9:.1f} bn" if x >= 1e9 else f"US${x / 1e6:.0f} m"


def idx1(x: float) -> str:
    return f"{float(x):.1f}"


def trend(delta: float, flat: float, unit: str) -> str:
    if abs(delta) < flat:
        return "was broadly flat"
    return f"{'rose' if delta > 0 else 'fell'} by {unit}"


def join(items: list[str]) -> str:
    items = [i for i in items if i]
    if len(items) <= 1:
        return "".join(items)
    return ", ".join(items[:-1]) + " and " + items[-1]


# ---------------------------------------------------------------- country briefs

def _latest_index(idx: pd.DataFrame, iso: str) -> tuple[int | None, dict[str, dict]]:
    d = idx[(idx["country"] == iso) & (idx["index_name"] == "influence") & (idx["mineral"] == "all") & idx["value"].notna()]
    if d.empty:
        return None, {}
    years = d.groupby("year")["actor"].nunique()
    both = years[years == 2]
    y = int(both.index.max()) if not both.empty else int(d["year"].max())
    rows = {r.actor: r._asdict() for r in d[d["year"] == y].itertuples(index=False)}
    return y, rows


def _value(idx: pd.DataFrame, iso: str, actor: str, year: int, name: str = "influence") -> float | None:
    d = idx[(idx["country"] == iso) & (idx["index_name"] == name) & (idx["mineral"] == "all") & (idx["actor"] == actor) & (idx["year"] == year)]
    v = d["value"].iloc[0] if not d.empty else None
    return None if v is None or pd.isna(v) else float(v)


def where_it_stands(iso: str, idx: pd.DataFrame, comp: pd.DataFrame) -> Section:
    s = Section("where_it_stands", "Where it stands")
    name = COUNTRIES[iso]
    y, rows = _latest_index(idx, iso)
    if y is None:
        notes = comp[(comp["country"] == iso) & (comp["mineral"] == "all") & ~comp["available"]]["note"].value_counts()
        reason = notes.index[0] if len(notes) else "no component available"
        s.add(f"No influence index can be computed for {name}: {reason}.", [f"index_component:{iso}"])
        return s
    parts, ids = [], []
    for actor in ("CN", "US"):
        r = rows.get(actor)
        if r:
            parts.append(f"{idx1(r['value'])} for {ACTOR[actor]} (band {idx1(r['lower'])}–{idx1(r['upper'])}, from {int(r['n_components'])} of six components)")
            ids.append(f"index_value:influence:{actor}:{y}")
    text = f"In {y}, the influence index stands at " + join(parts) + "."
    if "CN" in rows and "US" in rows:
        net = float(rows["CN"]["value"]) - float(rows["US"]["value"])
        text += f" The net lean is {net:+.1f} points toward {'China' if net > 0 else 'the United States'}." if abs(net) >= 1 else " The two are level."
    s.add(text, ids)
    changes, cids = [], []
    for actor in ("CN", "US"):
        now, before = _value(idx, iso, actor, y), _value(idx, iso, actor, y - 5)
        if now is not None and before is not None:
            d = now - before
            changes.append(f"the index for {ACTOR[actor]} {trend(d, FLAT_INDEX, f'{abs(d):.1f} points')}")
            cids += [f"index_value:influence:{actor}:{y}", f"index_value:influence:{actor}:{y - 5}"]
    if changes:
        s.add(f"Over the five years to {y}, " + join(changes) + ".", cids)
    for actor in ("CN", "US"):
        r = rows.get(actor)
        if r:
            names = [c.replace("_", " ") for c in str(r["components_available"]).split(",") if c]
            s.add(f"The value for {ACTOR[actor]} rests on {join(names)}; every component is a recorded tie (trade shares, finance, debt, UN votes, legislative stance), not a judgement.",
                  [f"index_component:{c}:{actor}:{y}" for c in str(r["components_available"]).split(",") if c])
    return s


def trade(iso: str, conc_x: pd.DataFrame, conc: pd.DataFrame, flags: pd.DataFrame) -> Section:
    s = Section("trade", "Trade")
    name = COUNTRIES[iso]
    d = conc_x[(conc_x["country"] == iso) & (conc_x["mineral"] == "all") & conc_x["share_cn"].notna()]
    if d.empty:
        s.add(f"No reported mineral trade for {name} in UN Comtrade: the trade-based indicators are absent, not zero.", [f"concentration:{iso}"])
        return s
    y = int(d["year"].max())
    r = d[d["year"] == y].iloc[0]
    big2 = float(r["share_cn"]) + float(r["share_us"])
    s.add(f"In {y}, {pct(r['share_cn'])} of {name}'s mineral exports (US Comtrade value {musd(r['wld'])}) went to China and {pct(r['share_us'])} to the United States; together {pct(big2)}, the rest to other destinations.".replace("US Comtrade", "UN Comtrade"),
          [f"concentration:share_cn_x:all:{y}", f"concentration:share_us_x:all:{y}", f"concentration:exports_wld_usd:all:{y}"])
    prev = d[d["year"] == y - 5]
    if not prev.empty:
        dc = float(r["share_cn"]) - float(prev.iloc[0]["share_cn"])
        du = float(r["share_us"]) - float(prev.iloc[0]["share_us"])
        s.add(f"Since {y - 5} the share going to China {trend(dc, FLAT_SHARE, pts(dc, signed=False))} and the share going to the United States {trend(du, FLAT_SHARE, pts(du, signed=False))}.",
              [f"concentration:share_cn_x:all:{y}", f"concentration:share_cn_x:all:{y - 5}", f"concentration:share_us_x:all:{y}", f"concentration:share_us_x:all:{y - 5}"])
    rca = conc[(conc["country"] == iso) & (conc["metric"] == "rca_pool") & (conc["year"] == y) & conc["value"].notna()].sort_values("value", ascending=False)
    rca = rca[rca["value"] > 1].head(TOP_MINERALS)
    if not rca.empty:
        s.add("Relative to the twelve-country export basket, its exports are specialised in " + join([f"{m.replace('_', ' ')} (RCA {v:.1f})" for m, v in zip(rca["mineral"], rca["value"], strict=True)]) + ".",
              [f"concentration:rca_pool:{m}:{y}" for m in rca["mineral"]])
    shifts = flags[(flags["country"] == iso) & (flags["type"] == "sudden_trade_shift")].sort_values("year", ascending=False)
    if not shifts.empty:
        latest = shifts.iloc[0]
        s.add(f"{len(shifts)} sudden shift{'s' if len(shifts) != 1 else ''} in export shares {'are' if len(shifts) != 1 else 'is'} flagged from the customs data, the latest in {int(latest['year'])}: {latest['description']}",
              [f"anomaly_flag:{f}" for f in shifts["flag_id"].head(5)])
    return s


def finance_and_debt(iso: str, finance: pd.DataFrame, comp: pd.DataFrame, flags: pd.DataFrame, nodes: pd.DataFrame, edges: pd.DataFrame, last_year: dict) -> Section:
    s = Section("finance_and_debt", "Finance and debt")
    name = COUNTRIES[iso]
    f = finance[(finance["country"] == iso)] if not finance.empty else finance
    for actor, source in (("CN", "AidData records"), ("US", "The DFC and OPIC records show")):
        g = f[(f["origin"] == actor) & f["documented"] & ~f["swap"] & f["amount_usd"].notna()] if not f.empty else f
        ly = last_year.get(f"finance_{actor}")
        if g.empty:
            s.add(f"{source} no documented commitment from {ADJ[actor]} institutions to {name}{f' through {ly}' if ly else ''}.", [f"finance_event:{actor}:{iso}"])
            continue
        total, n, y0, y1 = float(g["amount_usd"].sum()), len(g), int(g["year"].min()), int(g["year"].max())
        span = f"in {y0}" if y0 == y1 else f"over {y0}–{y1}"
        s.add(f"{source} {musd(total)} of documented commitments from {ADJ[actor]} institutions to {name} {span} ({n} event{'s' if n != 1 else ''}{f'; the source ends in {ly}' if ly and ly < 2024 else ''}).",
              [f"finance_event:{actor}:{iso}:{y}" for y in sorted(g["year"].unique())][:12])
    swaps = flags[(flags["country"] == iso) & (flags["type"] == "rescue_lending")]
    if not swaps.empty:
        s.add(f"Central-bank swap-line drawdowns are recorded in {len(swaps)} year{'s' if len(swaps) != 1 else ''} ({int(swaps['year'].min())}–{int(swaps['year'].max())}); they are emergency liquidity and are kept out of the finance component.",
              [f"anomaly_flag:{f}" for f in swaps["flag_id"]])
    debt = comp[(comp["country"] == iso) & (comp["mineral"] == "all") & (comp["actor"] == "CN") & (comp["component"] == "debt_stock") & comp["available"]].sort_values("year")
    if not debt.empty:
        r = debt.iloc[-1]
        s.add(f"Public and publicly guaranteed external debt owed to China was {pct(r['raw_value'])} of GDP in {int(r['year'])} (World Bank IDS); no comparable series exists for debt owed to the United States.",
              [f"index_component:debt_stock:CN:{int(r['year'])}"])
    e = edges[edges["country"] == iso] if not edges.empty else edges
    if not e.empty:
        lenders = e.groupby("source_node")["weight_usd"].sum().sort_values(ascending=False).head(3)
        labels = nodes.set_index("node_id")["label"] if not nodes.empty else pd.Series(dtype=str)
        s.add("The lenders with the largest recorded commitments to named recipients here are " + join([f"{labels.get(n, n.split(':', 1)[-1])} ({musd(v)})" for n, v in lenders.items()]) + ".",
              [f"network_metric:{n}" for n in lenders.index])
    for kind, text in (("large_commitment", "documented commitments reached at least 1% of GDP in a year"), ("finance_without_trade_response", "large commitments were not followed by any change in the mineral trade share with the lender"),
                       ("debt_without_recorded_commitment", "the debt stock owed to China rose with no commitment recorded that year")):
        k = flags[(flags["country"] == iso) & (flags["type"] == kind)]
        if not k.empty:
            years = sorted(int(y) for y in k["year"].unique())
            s.add(f"Flags: {text} in {join([str(y) for y in years[:6]])}{' and other years' if len(years) > 6 else ''} ({k['evidence_level'].iloc[0].replace('_', ' ')}).", [f"anomaly_flag:{f}" for f in k["flag_id"].head(6)])
    return s


def politics(iso: str, comp: pd.DataFrame, sd: pd.DataFrame, text_label: str | None) -> Section:
    s = Section("politics", "Politics")
    c = comp[(comp["country"] == iso) & (comp["mineral"] == "all")]
    dip = c[(c["component"] == "diplomatic_alignment") & c["available"]]
    if not dip.empty:
        y = int(dip["year"].max())
        parts, ids = [], []
        for actor in ("CN", "US"):
            r = dip[(dip["actor"] == actor) & (dip["year"] == y)]
            if not r.empty:
                parts.append(f"{pct(r.iloc[0]['raw_value'])} with {ACTOR[actor]}")
                ids.append(f"index_component:diplomatic_alignment:{actor}:{y}")
        if parts:
            s.add(f"In the UN General Assembly, voting agreement in {y} was " + join(parts) + ".", ids)
        prev = dip[dip["year"] == y - 5]
        if not prev.empty:
            ch, cids = [], []
            for actor in ("CN", "US"):
                a, b = dip[(dip["actor"] == actor) & (dip["year"] == y)], prev[prev["actor"] == actor]
                if not a.empty and not b.empty:
                    d = float(a.iloc[0]["raw_value"]) - float(b.iloc[0]["raw_value"])
                    ch.append(f"agreement with {ACTOR[actor]} {trend(d, FLAT_SHARE, pts(d, signed=False))}")
                    cids += [f"index_component:diplomatic_alignment:{actor}:{y}", f"index_component:diplomatic_alignment:{actor}:{y - 5}"]
            if ch:
                s.add(f"Since {y - 5}, " + join(ch) + ".", cids)
    st = c[(c["component"] == "legislative_stance") & c["available"]]
    if st.empty:
        s.add(f"Too few mineral-related legislative records naming either actor have been scored for a stance series (five per year are needed); the text model is {text_label or 'not yet run'}.", [f"index_component:legislative_stance:{iso}"])
    else:
        y = int(st["year"].max())
        parts, ids = [], []
        for actor in ("CN", "US"):
            r = st[(st["actor"] == actor) & (st["year"] == y)]
            if not r.empty:
                v = float(r.iloc[0]["raw_value"])
                parts.append(f"{v:+.2f} toward {ACTOR[actor]}")
                ids.append(f"index_component:legislative_stance:{actor}:{y}")
        s.add(f"The legislature's mean stance in {y} (scale −2 to +2) was " + join(parts) + f"; these are outputs of the text model ({text_label or 'status unknown'}).", ids)
    g = sd[(sd["country"] == iso) & sd["gap"].notna()].sort_values("year")
    if not g.empty:
        r = g.iloc[-1]
        s.add(f"The say–do gap toward {ACTOR[r['actor']]} in {int(r['year'])} was {float(r['gap']):+.1f} standard deviations ({'words warmer than the flows' if r['gap'] > 0 else 'flows ahead of the words'}; {int(r['n_docs'])} scored records; rhetoric from the text model).",
              [f"say_do_gap:{r['actor']}:{int(r['year'])}"])
    return s


def events(iso: str, effects: pd.DataFrame) -> Section:
    s = Section("events", "Dated events")
    e = effects[(effects["country"] == iso) & effects["diff"].notna()] if not effects.empty else effects
    if e.empty:
        s.add("No dated event has both pre- and post-event trade years for this country yet.", [f"event_effect:{iso}"])
        return s
    e = e.assign(absdiff=e["diff"].abs()).sort_values("absdiff", ascending=False).head(TOP_EVENTS)
    for r in e.itertuples(index=False):
        draft = " (event list still in draft)" if r.event_status != "reviewed" else ""
        placebo = f"placebo p {float(r.placebo_p):.2f} against the series' other years" if r.placebo_p is not None and not pd.isna(r.placebo_p) else "no placebo years available for a p-value"
        s.add(f"After {r.event_title} ({r.event_date[:7]}), the share of exports to {ACTOR[r.actor]} moved {pts(r.diff)} ({pct(r.pre_mean)} before, {pct(r.post_mean)} after); {placebo}{draft}. An association, not a cause.",
              [f"event_effect:{r.event_id}:{r.actor}:window"])
    did = effects[(effects["design"] == "did") & effects["diff"].notna() & effects["treated_countries"].str.contains(iso)] if not effects.empty else effects
    for r in did.head(2).itertuples(index=False):
        pval = f"permutation p {float(r.placebo_p):.2f}" if r.placebo_p is not None and not pd.isna(r.placebo_p) else "no permutation p"
        s.add(f"Relative to the countries outside its scope, {r.event_title} is followed by a {pts(r.diff)} difference-in-differences in the share of exports to {ACTOR[r.actor]} ({pval}).",
              [f"event_effect:{r.event_id}:{r.actor}:did"])
    return s


def outlook(iso: str, fc: pd.DataFrame, fc_status: dict) -> Section:
    s = Section("outlook", "Outlook to 2030")
    f = fc[(fc["country"] == iso) & (fc["scenario_id"] == "baseline")] if not fc.empty else fc
    if f.empty:
        s.add("No forecast: the series are too short or not current enough (eight contiguous years reaching 2023 are needed).", [f"forecast:{iso}"])
        return s
    targets = fc_status.get("targets", {})
    for target, label, fmt in (("export_share", "share of mineral exports going to", pct), ("influence_index", "influence index of", idx1)):
        for actor in ("CN", "US"):
            g = f[(f["target"] == target) & (f["actor"] == actor)].sort_values("horizon_year")
            if g.empty:
                continue
            last = g.iloc[-1]
            st = targets.get(f"{target}:{actor}", {})
            model_text = (f"{st.get('label', last['model'])}, which beat naive persistence by {round((1 - float(st.get('crps_ratio', 1))) * 100)}% CRPS in backtests" if st.get("beats_naive")
                          else "naive persistence, because no model beat it in backtests")
            s.add(f"The published forecast for the {label} {ACTOR[actor]} in {int(last['horizon_year'])} is {fmt(last['point'])} (90% band {fmt(last['p05'])}–{fmt(last['p95'])}), from {model_text}; the last observed year is {int(last['last_observed_year'])}.",
                  [f"forecast:{target}:{actor}:{int(last['horizon_year'])}", f"backtest:{target}:{actor}:{last['model']}"])
    sc = fc[(fc["country"] == iso) & (fc["target"] == "export_share") & (fc["actor"] == "CN") & (fc["horizon_year"] == fc["horizon_year"].max())] if not fc.empty else fc
    if not sc.empty and set(sc["scenario_id"]) >= {"china_pull", "us_reshoring"}:
        a = sc.set_index("scenario_id")["point"]
        s.add(f"Under the stated scenarios the 2030 median share to China ranges from {pct(a['us_reshoring'])} (US sourcing rules bite) to {pct(a['china_pull'])} (accelerated China pull); these are what-ifs with a fixed yearly shift, not predictions.",
              [f"forecast:export_share:CN:{int(sc['horizon_year'].iloc[0])}:china_pull", f"forecast:export_share:CN:{int(sc['horizon_year'].iloc[0])}:us_reshoring"])
    return s


def data_caveats(iso: str, comp: pd.DataFrame, last_year: dict, effects: pd.DataFrame, text_label: str | None) -> Section:
    s = Section("data_caveats", "What the data cannot say")
    c = comp[(comp["country"] == iso) & (comp["mineral"] == "all")]
    if not c.empty:
        y = int(c["year"].max())
        missing = c[(c["year"] == y) & ~c["available"]]
        if not missing.empty:
            reasons = missing.groupby("note")["component"].apply(lambda x: join(sorted(set(n.replace("_", " ") for n in x))))
            s.add(f"In {y}, unavailable components: " + "; ".join(f"{comps} ({note})" for note, comps in reasons.items()) + ".",
                  [f"index_component:{r.component}:{r.actor}:{y}" for r in missing.itertuples(index=False)])
    cov = [f"Chinese official finance to {last_year.get('finance_CN')}" if last_year.get("finance_CN") else "", f"US finance to {last_year.get('finance_US')}" if last_year.get("finance_US") else "",
           f"debt by creditor to {last_year.get('debt_CN')}" if last_year.get("debt_CN") else "", f"UN votes to {last_year.get('unga')}" if last_year.get("unga") else "", f"trade to {last_year.get('trade')}" if last_year.get("trade") else ""]
    s.add("Source coverage ends at different years: " + join([x for x in cov if x]) + "; components beyond a source's coverage are unavailable, not zero.", ["quant_run:last_year"])
    if not effects.empty:
        drafts = effects[(effects["country"] == iso) & (effects["event_status"] != "reviewed")]["event_id"].nunique()
        if drafts:
            s.add(f"{drafts} of the dated events used above are still in the draft event list awaiting the project owner's review.", ["event_effect:status"])
    s.add(f"Stance values come from the text model ({text_label or 'not yet run'}); the rest of this brief rests on official statistics and the registered databases, each cited on its chart.", ["quant_run:text_model"])
    return s


def country_brief(iso: str, frames: dict, inp_finance: pd.DataFrame, last_year: dict, text_label: str | None, fc_status: dict) -> list[Section]:
    conc, conc_x, comp, idx = frames["concentration"], frames["conc_x"], frames["index_component"], frames["index_value"]
    return [
        where_it_stands(iso, idx, comp),
        trade(iso, conc_x, conc, frames["anomaly_flag"]),
        finance_and_debt(iso, inp_finance, comp, frames["anomaly_flag"], frames["network_metric"], frames["network_edge"], last_year),
        politics(iso, comp, frames["say_do_gap"], text_label),
        events(iso, frames["event_effect"]),
        outlook(iso, frames["forecast"], fc_status),
        data_caveats(iso, comp, last_year, frames["event_effect"], text_label),
    ]


# ---------------------------------------------------------------- regional synthesis

def regional_brief(frames: dict, inp_finance: pd.DataFrame, last_year: dict, text_label: str | None, fc_status: dict) -> list[Section]:
    idx, conc_x = frames["index_value"], frames["conc_x"]
    out: list[Section] = []
    # ranking and movers
    s = Section("ranking", "Ranking by net lean")
    m = Section("movers", "Largest five-year movements")
    inf = idx[(idx["index_name"] == "influence") & (idx["mineral"] == "all") & idx["value"].notna()]
    if not inf.empty:
        piv = inf.pivot_table(index=["country", "year"], columns="actor", values="value").dropna().reset_index()
        counts = piv.groupby("year")["country"].nunique()
        ok = counts[counts >= 6]
        if not ok.empty:
            y = int(ok.index.max())
            r = piv[piv["year"] == y].assign(net=lambda d: d["CN"] - d["US"]).sort_values("net", ascending=False)
            top = [f"{COUNTRIES[c]} ({n:+.0f})" for c, n in zip(r["country"].head(3), r["net"].head(3), strict=True)]
            bottom = [f"{COUNTRIES[c]} ({n:+.0f})" for c, n in zip(r["country"].tail(2), r["net"].tail(2), strict=True)]
            s.add(f"In {y}, the index leans most toward China in {join(top)} and least in {join(bottom)} (net lean, China minus the United States, in index points); {len(r)} of the twelve countries have an index that year.",
                  [f"index_value:influence:{a}:{y}:{c}" for c in r["country"] for a in ("CN", "US")])
            missing = [COUNTRIES[c] for c in IN_SCOPE if c not in set(r["country"])]
            if missing:
                s.add(f"No index for {join(missing)} in {y}: fewer than three components are available (no reported trade, or sources that end earlier).", [f"index_component:{c}" for c in IN_SCOPE if COUNTRIES[c] in missing])
            prev = piv[piv["year"] == y - 5][["country", "CN", "US"]].rename(columns={"CN": "CN0", "US": "US0"})
            mv = r.merge(prev, on="country")
            if not mv.empty:
                mv["dCN"] = mv["CN"] - mv["CN0"]
                up = mv.sort_values("dCN", ascending=False).head(2)
                down = mv.sort_values("dCN").head(2)
                m.add(f"Between {y - 5} and {y} the Chinese index rose most in {join([f'{COUNTRIES[c]} ({d:+.1f})' for c, d in zip(up['country'], up['dCN'], strict=True)])} and fell most in {join([f'{COUNTRIES[c]} ({d:+.1f})' for c, d in zip(down['country'], down['dCN'], strict=True)])}.",
                      [f"index_value:influence:CN:{yy}:{c}" for c in list(up["country"]) + list(down["country"]) for yy in (y, y - 5)])
            out += [s, m]
    if not out:
        s.add("No year has an influence index for at least six countries, so no ranking is reported.", ["index_value:influence"])
        m.add("No five-year movement can be reported without a ranking year.", ["index_value:influence"])
        out += [s, m]
    elif not m.sentences:
        m.add("No country has an index both in the ranking year and five years earlier, so no movement is reported.", ["index_value:influence"])
    # trade pattern
    t = Section("trade_pattern", "Regional trade pattern")
    ex = conc_x[(conc_x["mineral"] != "all") & conc_x["wld"].notna() & (conc_x["wld"] > 0)]
    if not ex.empty:
        y = int(ex["year"].max())
        g = ex[ex["year"] == y].assign(cn=lambda d: d["share_cn"] * d["wld"], us=lambda d: d["share_us"] * d["wld"]).groupby("mineral").agg(cn=("cn", "sum"), us=("us", "sum"), wld=("wld", "sum"))
        g = g[g["wld"] >= 1e8]
        g["cn_share"], g["us_share"] = g["cn"] / g["wld"], g["us"] / g["wld"]
        top_cn = g.sort_values("cn_share", ascending=False).head(3)
        top_us = g.sort_values("us_share", ascending=False).head(3)
        t.add(f"Across the reporting countries in {y}, the minerals whose exports go most to China are {join([f'{m.replace(chr(95), chr(32))} ({pct(v)})' for m, v in top_cn['cn_share'].items()])}; those going most to the United States are {join([f'{m.replace(chr(95), chr(32))} ({pct(v)})' for m, v in top_us['us_share'].items()])} (minerals with at least US$100 m of exports).",
              [f"concentration:share_cn_x:{m}:{y}" for m in top_cn.index] + [f"concentration:share_us_x:{m}:{y}" for m in top_us.index])
    else:
        t.add("No reported trade by mineral in the warehouse.", ["concentration"])
    t.add("A Herfindahl index of destinations is not computed: the warehouse holds partner totals for the United States, China and the world only.", ["concentration:hhi_export_dest"])
    out.append(t)
    # finance pattern
    f = Section("finance_pattern", "Finance pattern")
    fin = inp_finance[inp_finance["documented"] & ~inp_finance["swap"] & inp_finance["amount_usd"].notna()] if not inp_finance.empty else inp_finance
    if not fin.empty:
        by = fin.groupby("origin")["amount_usd"].sum()
        parts, ids = [], []
        for actor in ("CN", "US"):
            if actor in by.index:
                g = fin[fin["origin"] == actor]
                parts.append(f"{musd(by[actor])} from {ADJ[actor]} institutions over {int(g['year'].min())}–{int(g['year'].max())} ({len(g)} events)")
                ids.append(f"finance_event:{actor}")
        f.add("Documented commitments to the twelve countries total " + join(parts) + "; swap-line drawdowns are excluded and the two sources end in different years (see the caveats).", ids)
    nodes = frames["network_metric"]
    if not nodes.empty:
        lenders = nodes[nodes["node_type"] == "lender"].sort_values("degree", ascending=False).head(4)
        f.add("The most connected lenders in the finance network are " + join([f"{r.label} ({int(r.degree)} recipients)" for r in lenders.itertuples(index=False)]) + ".", [f"network_metric:{n}" for n in lenders["node_id"]])
    out.append(f)
    # evidence
    e = Section("evidence", "What the statistical evidence supports")
    reg = frames["regression_result"]
    if not reg.empty:
        sig = reg[(reg["variant"] == "twfe") & reg["p_wild"].notna() & (reg["p_wild"] < 0.05)]
        if sig.empty:
            e.add("In the two-way fixed-effects panel regressions no coefficient passes the wild cluster bootstrap at the 5% level: with eleven countries and annual data, the recorded ties do not move together in a way the data can pin down.",
                  [f"regression_result:{r.spec}:twfe:{r.term}" for r in reg[reg["variant"] == "twfe"].itertuples(index=False)][:10])
        for r in sig.itertuples(index=False):
            e.add(f"In the panel regressions, {OUTCOME.get(r.outcome, r.outcome.replace('_', ' '))} moves {pts(r.coef)} per standard deviation of {r.term.replace('_', ' ')} (cluster p {'<0.01' if float(r.p_cluster) < 0.005 else f'{float(r.p_cluster):.2f}'}, wild bootstrap p {float(r.p_wild):.2f}; dropping one country at a time keeps it between {pts(r.jk_min)} and {pts(r.jk_max)}); an association with country and year effects, not a causal estimate.",
                  [f"regression_result:{r.spec}:{r.variant}:{r.term}"])
    eff = frames["event_effect"]
    if not eff.empty:
        w = eff[(eff["design"] == "window") & eff["placebo_p"].notna()].sort_values(["placebo_p", "event_date"]).head(3)
        if not w.empty:
            items = [f"{COUNTRIES.get(r.country, r.country)} after {r.event_title} ({r.event_date[:4]}), where the share of exports to {ACTOR[r.actor]} moved {pts(r.diff)} (placebo p {float(r.placebo_p):.2f})" for r in w.itertuples(index=False)]
            draft = any(r.event_status != "reviewed" for r in w.itertuples(index=False))
            e.add("The event windows least like the rest of their own series are " + join(items) + ("; the event list is still in draft." if draft else "."),
                  [f"event_effect:{r.event_id}:{r.actor}:window:{r.country}" for r in w.itertuples(index=False)])
    if not e.sentences:
        e.add("No panel regression or event study has been computed yet.", ["regression_result", "event_effect"])
    out.append(e)
    # outlook
    o = Section("outlook", "Outlook")
    for key, st in (fc_status.get("targets") or {}).items():
        target, actor = key.split(":")
        if st.get("model"):
            fmt = (lambda v: f"{float(v) * 100:.2f} points") if target == "export_share" else (lambda v: f"{float(v):.2f}")
            o.add(f"For the {target.replace('_', ' ')} toward {ACTOR[actor]}, the published model is {st.get('label')}: CRPS {fmt(st.get('crps'))} against {fmt(st.get('crps_naive'))} for naive persistence over {st.get('n_tests')} backtest cases, with 80% bands covering {pct(st.get('coverage_80', 0))} of outcomes.",
                  [f"backtest:{target}:{actor}:{st.get('model')}"])
    if not o.sentences:
        o.add("No forecast has been computed yet.", ["forecast"])
    out.append(o)
    # caveats
    c = Section("data_caveats", "What the data cannot say")
    no_trade = [COUNTRIES[i] for i in IN_SCOPE if i not in set(conc_x["country"])] if not conc_x.empty else [COUNTRIES[i] for i in IN_SCOPE]
    if no_trade:
        c.add(f"{join(no_trade)} report{'s' if len(no_trade) == 1 else ''} no mineral trade to UN Comtrade in the covered years, so every trade-based indicator is absent there.", [f"concentration:{i}" for i in IN_SCOPE if COUNTRIES[i] in no_trade])
    c.add(f"Chinese official finance (AidData) ends in {last_year.get('finance_CN')}, US finance is DFC/OPIC only, debt by creditor exists for China only, and the legislative stance comes from the text model ({text_label or 'not yet run'}).", ["quant_run:last_year", "quant_run:text_model"])
    if not eff.empty:
        c.add(f"{eff['event_id'].nunique()} dated events are in the event list, {eff[eff['event_status'] != 'reviewed']['event_id'].nunique()} of them still in draft.", ["event_effect:status"])
    out.append(c)
    return out


# ---------------------------------------------------------------- human-written layer

FRONT_RE = re.compile(r"\A---\s*\n(.*?)\n---\s*\n", re.S)


def load_human(path: Path) -> dict | None:
    """A Markdown file with optional front matter (author, date, reviewed, title) -> row dict, or None."""
    if not path.exists():
        return None
    raw = path.read_text(encoding="utf-8")
    meta: dict = {}
    m = FRONT_RE.match(raw)
    body = raw
    if m:
        body = raw[m.end():]
        for line in m.group(1).splitlines():
            if ":" in line:
                k, v = line.split(":", 1)
                meta[k.strip().lower()] = v.strip().strip('"').strip("'")
    body = body.strip()
    if not body:
        return None
    reviewed = str(meta.get("reviewed", "false")).lower() in ("true", "yes", "1")
    return {"title": meta.get("title") or "Written interpretation", "author": meta.get("author") or "project owner", "date": meta.get("date") or "", "reviewed": reviewed, "text_md": body}


# ---------------------------------------------------------------- orchestration

def generate(frames: dict, inp_finance: pd.DataFrame, last_year: dict, text_label: str | None, fc_status: dict, previous: pd.DataFrame | None, generated_on: str,
             human_dir: Path = HUMAN_DIR) -> pd.DataFrame:
    """analysis_text rows for every country and the region: generated sections (with sentences and their indicator ids)
    and the owner's text where a file exists; `changed_since_previous` compares with the previous run's rows."""
    cols = ["scope", "country", "section", "position", "title", "text_md", "sentences_json", "supporting_indicator_ids", "template_version", "model", "author",
            "reviewed_by_human", "changed_since_previous", "previous_date", "generated_on"]
    prev: dict[tuple, tuple[str, str]] = {}
    if previous is not None and not previous.empty:
        for r in previous.itertuples(index=False):
            prev[(r.scope, r.country if isinstance(r.country, str) else None, r.section)] = (r.text_md, r.generated_on)
    rows: list[dict] = []

    def emit(scope: str, country: str | None, sections: list[Section]) -> None:
        for pos, sec in enumerate(sections):
            text = "\n".join(s.text for s in sec.sentences)
            ids = sorted({i for s in sec.sentences for i in s.ids})
            old = prev.get((scope, country, sec.key))
            rows.append({"scope": scope, "country": country, "section": sec.key, "position": pos, "title": sec.title, "text_md": text,
                         "sentences_json": json.dumps([{"text": s.text, "ids": s.ids} for s in sec.sentences], ensure_ascii=False), "supporting_indicator_ids": ",".join(ids),
                         "template_version": TEMPLATE_VERSION, "model": f"template-{TEMPLATE_VERSION}", "author": None, "reviewed_by_human": False,
                         "changed_since_previous": old is None or old[0] != text, "previous_date": old[1] if old else None, "generated_on": generated_on})

    def emit_human(scope: str, country: str | None, path: Path) -> None:
        h = load_human(path)
        if h:
            old = prev.get((scope, country, "human"))
            rows.append({"scope": scope, "country": country, "section": "human", "position": 99, "title": h["title"], "text_md": h["text_md"], "sentences_json": "[]",
                         "supporting_indicator_ids": "", "template_version": TEMPLATE_VERSION, "model": "human", "author": h["author"], "reviewed_by_human": h["reviewed"],
                         "changed_since_previous": old is None or old[0] != h["text_md"], "previous_date": old[1] if old else None, "generated_on": h["date"] or generated_on})

    for iso in IN_SCOPE:
        emit("country", iso, country_brief(iso, frames, inp_finance, last_year, text_label, fc_status))
        emit_human("country", iso, human_dir / f"{iso}.md")
    emit("regional", None, regional_brief(frames, inp_finance, last_year, text_label, fc_status))
    emit_human("regional", None, human_dir / "regional.md")
    return pd.DataFrame(rows, columns=cols)
