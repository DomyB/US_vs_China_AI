"""Rule-based anomaly flags with evidence levels (docs/PHASE0_PLAN.md section 4.4). A flag is never a finding:
it points at a movement in the sourced data that deserves a look, says which rows it rests on, and is graded
`documented` (the movement itself is in official data), `strongly_indicated` (two sourced series disagree in a
way that suggests unrecorded activity) or `speculative` (a model output is involved)."""
from __future__ import annotations

import pandas as pd

from .concentration import wide

SHIFT_POINTS = 0.20  # change in an export share, in share units, that counts as sudden
MIN_WLD_USD = 1e8  # exports in both years must reach this for a share change to be flagged
COMMIT_GDP = 0.01  # documented commitments in a year, relative to GDP, that count as large
COMMIT_GDP_FOLLOW = 0.005  # ... and that should show up in trade within two years
FOLLOW_POINTS = 0.02
DEBT_RISE = 0.20  # relative rise of the debt stock owed to China in one year
DEBT_RISE_USD = 1e8
GAP_SD = 2.0  # say–do gap (in standard deviations) that counts as a divergence
ACTOR_NAME = {"US": "the United States", "CN": "China"}
FINANCE_SOURCE = {"US": "dfc_projects", "CN": "aiddata_gcdf"}


def _pct(x: float) -> str:
    return f"{x * 100:.0f}%"


def _musd(x: float) -> str:
    return f"US${x / 1e9:.1f} bn" if x >= 1e9 else f"US${x / 1e6:.0f} m"


def anomalies(conc: pd.DataFrame, finance: pd.DataFrame, gdp: pd.DataFrame, debt_cn: pd.DataFrame, say_do_df: pd.DataFrame,
              stance: pd.DataFrame, last_year: dict) -> pd.DataFrame:
    cols = ["flag_id", "country", "year", "actor", "type", "evidence_level", "description", "evidence_source_ids", "score"]
    rows: list[dict] = []

    def add(country: str, year: int, actor: str | None, kind: str, level: str, text: str, sources: list[str], score: float | None) -> None:
        rows.append({"flag_id": f"{country}-{kind}-{year}-{actor or 'any'}", "country": country, "year": int(year), "actor": actor, "type": kind,
                     "evidence_level": level, "description": text, "evidence_source_ids": ",".join(dict.fromkeys(sources)), "score": score})

    ex = wide(conc, "x")
    gdp_l = dict(zip(map(tuple, gdp[["country", "year"]].itertuples(index=False, name=None)), gdp["value"], strict=True)) if not gdp.empty else {}

    # 1. sudden shifts in an export share (documented: the movement is in the reporter's own customs data)
    if not ex.empty:
        ex = ex.sort_values(["country", "mineral", "year"])
        for (iso, mineral), g in ex.groupby(["country", "mineral"]):
            g = g.set_index("year")
            for actor in ("US", "CN"):
                col = f"share_{actor.lower()}"
                s = g[col].dropna()
                for year in s.index:
                    if year - 1 not in s.index:
                        continue
                    if any(pd.isna(g.loc[y, "wld"]) or g.loc[y, "wld"] < MIN_WLD_USD for y in (year - 1, year)):
                        continue  # too little trade in either year for a share change to mean much
                    delta = float(s[year] - s[year - 1])
                    if abs(delta) >= SHIFT_POINTS:
                        what = "the country's mineral exports" if mineral == "all" else f"{mineral.replace('_', ' ')} exports"
                        add(iso, year, actor, "sudden_trade_shift", "documented",
                            f"Exports to {ACTOR_NAME[actor]} {'rose' if delta > 0 else 'fell'} from {_pct(s[year - 1])} to {_pct(s[year])} of {what} between {year - 1} and {year} (reported by {iso} to UN Comtrade).",
                            ["un_comtrade"], round(abs(delta), 3))

    # 2. large documented commitments and 3. swap-line drawdowns (documented)
    if not finance.empty:
        doc = finance[finance["documented"] & finance["amount_usd"].notna()]
        by = doc[~doc["swap"]].groupby(["country", "origin", "year"])
        for (iso, actor, year), g in by:
            total = float(g["amount_usd"].sum())
            gd = gdp_l.get((iso, int(year)))
            if gd and total / gd >= COMMIT_GDP:
                top = g.sort_values("amount_usd", ascending=False).iloc[0]
                add(iso, year, actor, "large_commitment", "documented",
                    f"Documented commitments from {ACTOR_NAME[actor]}'s institutions reached {_musd(total)} in {int(year)}, {_pct(total / gd)} of GDP; the largest: {top['actor_from']} ({_musd(float(top['amount_usd']))}).",
                    [FINANCE_SOURCE[actor], "wb_wdi"], round(total / gd, 4))
        for (iso, actor, year), g in doc[doc["swap"]].groupby(["country", "origin", "year"]):
            total = float(g["amount_usd"].sum())
            add(iso, year, actor, "rescue_lending", "documented",
                f"Central-bank swap-line drawdowns of {_musd(total)} recorded in {int(year)}; counted here as emergency liquidity and left out of the finance component of the index.",
                [FINANCE_SOURCE[actor]], None)
        # 4. commitment without a trade response (strongly indicated: finance and mineral trade decoupled)
        if not ex.empty:
            all_ex = ex[ex["mineral"] == "all"].set_index(["country", "year"])
            for (iso, actor, year), g in by:
                total = float(g["amount_usd"].sum())
                gd = gdp_l.get((iso, int(year)))
                if not gd or total / gd < COMMIT_GDP_FOLLOW:
                    continue
                col = f"share_{actor.lower()}"
                before, after = all_ex[col].get((iso, int(year) - 1)), all_ex[col].get((iso, int(year) + 2))
                if before is None or after is None or pd.isna(before) or pd.isna(after):
                    continue
                if abs(float(after) - float(before)) < FOLLOW_POINTS:
                    add(iso, year, actor, "finance_without_trade_response", "strongly_indicated",
                        f"Commitments of {_musd(total)} ({_pct(total / gd)} of GDP) in {int(year)} were not followed by a change in the share of mineral exports going to {ACTOR_NAME[actor]} ({_pct(float(before))} in {int(year) - 1}, {_pct(float(after))} in {int(year) + 2}): the finance is tied to other sectors, or its mineral side is not in the trade record.",
                        [FINANCE_SOURCE[actor], "un_comtrade", "wb_wdi"], round(total / gd, 4))

    # 5. debt stock owed to China rising with no commitment recorded that year (strongly indicated: unrecorded lending or disbursement of earlier loans)
    if not debt_cn.empty:
        ly = last_year.get("finance_CN")
        cn_years = set(map(tuple, finance[(finance["origin"] == "CN") & finance["documented"]][["country", "year"]].itertuples(index=False, name=None))) if not finance.empty else set()
        d = debt_cn.sort_values(["country", "year"])
        for iso, g in d.groupby("country"):
            s = g.set_index("year")["value"]
            for year in s.index:
                if year - 1 not in s.index or (ly is not None and year > ly):
                    continue
                prev, cur = float(s[year - 1]), float(s[year])
                if prev > 0 and cur - prev >= DEBT_RISE_USD and (cur - prev) / prev >= DEBT_RISE and (iso, int(year)) not in cn_years:
                    add(iso, year, "CN", "debt_without_recorded_commitment", "strongly_indicated",
                        f"Public external debt owed to China rose from {_musd(prev)} to {_musd(cur)} in {int(year)} while no commitment from Chinese institutions is recorded for that year: lending not captured by the finance database, or disbursement of earlier commitments.",
                        ["wb_ids", "aiddata_gcdf"], round((cur - prev) / prev, 3))

    # 6. say–do divergence (speculative: rests on the text model)
    if not say_do_df.empty:
        leg = stance.groupby("country")["source_id"].agg(lambda s: sorted(set(s))).to_dict() if not stance.empty else {}
        for r in say_do_df[say_do_df["gap"].notna()].itertuples(index=False):
            if abs(float(r.gap)) >= GAP_SD:
                direction = "warmer" if r.gap > 0 else "cooler"
                add(r.country, r.year, r.actor, "say_do_divergence", "speculative",
                    f"Legislative stance toward {ACTOR_NAME[r.actor]} in {int(r.year)} ({r.n_docs} scored records) was {direction} than the movement of economic ties would suggest (gap {float(r.gap):+.1f} standard deviations); the stance values come from the text model ({r.text_model_status}).",
                    [*leg.get(r.country, []), "un_comtrade", FINANCE_SOURCE[r.actor]], round(abs(float(r.gap)), 3))

    out = pd.DataFrame(rows, columns=cols)
    if not out.empty:
        out = out.drop_duplicates("flag_id").sort_values(["country", "year", "type"]).reset_index(drop=True)
    return out
