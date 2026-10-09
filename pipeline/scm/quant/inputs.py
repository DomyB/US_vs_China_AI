"""Read the fact tables the quant step needs, as small tidy frames, and record how far each source reaches
in time so a component is reported as unavailable (never as zero) beyond a source's coverage."""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

import pandas as pd

from ..paths import WAREHOUSE_DIR
from ..registry import IN_SCOPE, core_minerals
from ..text.store import pick_classifications
from ..warehouse import table_frames

ACTORS = ("US", "CN")
PARTNER = {"US": "USA", "CN": "CHN"}
UNGA = {"US": "unga_agreement_USA", "CN": "unga_agreement_CHN"}
GDP = "NY.GDP.MKTP.CD"
DEBT_CN = "DT.DOD.DPPG.CD:730"  # IDS: PPG external debt stock owed to China
SWAP_RE = r"(?i)\bswap\b"
# controls for the panel regressions (Phase 4b): indicator id -> short name
CONTROLS = {"v2x_polyarchy": "electoral_democracy", "RL.EST": "rule_of_law", "NY.GDP.MINR.RT.ZS": "mineral_rents_gdp", "BX.KLT.DINV.CD.WD": "fdi_inflows_usd"}


@dataclass
class Inputs:
    trade: pd.DataFrame  # reporter, year, mineral ("all" included), partner (WLD/USA/CHN), flow (X/M), value_usd; annual reported rows
    finance: pd.DataFrame  # event_id, country, year, origin, amount_usd, swap, documented, source_id, actor_from, actor_to, description
    gdp: pd.DataFrame  # country, year, value (current USD)
    unga: pd.DataFrame  # country, year, actor, value (voting agreement, 0-1)
    debt_cn: pd.DataFrame  # country, year, value (USD)
    stance: pd.DataFrame  # doc_id, country, year, actor, stance, source_id (legislative records with a scored stance)
    text_status: dict  # the classifier's status block (method, label, validated ...)
    controls: pd.DataFrame = field(default_factory=lambda: pd.DataFrame(columns=["country", "year", "name", "value"]))  # panel controls
    last_year: dict[str, int | None] = field(default_factory=dict)  # last year each source covers
    minerals: list[str] = field(default_factory=list)  # minerals the index is also computed for

    @property
    def years(self) -> list[int]:
        if self.trade.empty:
            return []
        return sorted(int(y) for y in self.trade["year"].unique())


def _empty(cols: list[str]) -> pd.DataFrame:
    return pd.DataFrame({c: pd.Series(dtype=object) for c in cols})


def _last_year(df: pd.DataFrame) -> int | None:
    return int(df["year"].max()) if not df.empty and df["year"].notna().any() else None


def load_trade(warehouse: Path = WAREHOUSE_DIR) -> pd.DataFrame:
    t = table_frames("trade_flow", warehouse)
    cols = ["reporter", "year", "mineral", "partner", "flow", "value_usd"]
    if t.empty:
        return _empty(cols)
    t = t[(t["value_type"] == "reported") & t["reporter"].isin(IN_SCOPE) & t["partner"].isin(["WLD", "USA", "CHN"])]
    if "month" in t.columns:
        t = t[t["month"].isna()]
    if t.empty:
        return _empty(cols)
    t = t.assign(year=t["year"].astype(int), value_usd=t["value_usd"].astype(float))
    by_mineral = t.groupby(["reporter", "year", "mineral", "partner", "flow"], as_index=False)["value_usd"].sum()
    overall = t.groupby(["reporter", "year", "partner", "flow"], as_index=False)["value_usd"].sum().assign(mineral="all")
    return pd.concat([by_mineral, overall[cols]], ignore_index=True)[cols]


def load_finance(warehouse: Path = WAREHOUSE_DIR) -> pd.DataFrame:
    f = table_frames("finance_event", warehouse)
    cols = ["event_id", "country", "year", "origin", "amount_usd", "swap", "documented", "source_id", "actor_from", "actor_to", "description"]
    if f.empty:
        return _empty(cols)
    f = f[f["actor_from_origin"].isin(ACTORS) & f["country"].isin(IN_SCOPE)].copy()
    if f.empty:
        return _empty(cols)
    text = f["description"].fillna("").astype(str) + " " + f["type"].fillna("").astype(str)
    out = pd.DataFrame({
        "event_id": f["event_id"].astype(str), "country": f["country"], "year": f["year"].astype(int), "origin": f["actor_from_origin"],
        "amount_usd": pd.to_numeric(f["amount_usd"], errors="coerce"), "swap": text.str.contains(SWAP_RE, regex=True),
        "documented": f["confidence"].eq("documented"), "source_id": f["source_id"], "actor_from": f["actor_from"], "actor_to": f["actor_to"],
        "description": f["description"].fillna("").astype(str),
    })
    return out.reset_index(drop=True)


def _indicator(gov: pd.DataFrame, indicator: str) -> pd.DataFrame:
    cols = ["country", "year", "value"]
    if gov.empty:
        return _empty(cols)
    g = gov[(gov["indicator"] == indicator) & gov["country"].isin(IN_SCOPE) & gov["value"].notna()]
    if g.empty:
        return _empty(cols)
    g = g.assign(year=g["year"].astype(int), value=g["value"].astype(float))
    # one value per country-year (the newest retrieval wins when a source was fetched twice)
    g = g.sort_values(["country", "year", "retrieved_at"]).drop_duplicates(["country", "year"], keep="last")
    return g[cols].reset_index(drop=True)


def load_stance(warehouse: Path = WAREHOUSE_DIR) -> tuple[pd.DataFrame, dict]:
    """Legislative records (not news) with a scored stance toward an actor, using the same classifier choice as the
    site (trained head only once it beats the baseline), plus the classifier's status block."""
    cols = ["doc_id", "country", "year", "actor", "stance", "source_id"]
    docs = table_frames("document", warehouse)
    cls = table_frames("doc_classification", warehouse)
    metrics = table_frames("validation_metric", warehouse)
    if docs.empty or cls.empty:
        _, status = pick_classifications([], [], int(len(docs)))
        return _empty(cols), status
    chosen, status = pick_classifications(cls.to_dict("records"), metrics.to_dict("records") if not metrics.empty else [], int(len(docs)))
    if not chosen:
        return _empty(cols), status
    c = pd.DataFrame(list(chosen.values()))[["doc_id", "stance_us", "stance_cn"]]
    d = docs[(docs["doc_type"] != "news") & docs["country"].isin(IN_SCOPE)][["doc_id", "country", "year", "source_id"]].merge(c, on="doc_id")
    parts = []
    for actor, col in (("US", "stance_us"), ("CN", "stance_cn")):
        s = d[d[col].notna()]
        if not s.empty:
            parts.append(pd.DataFrame({"doc_id": s["doc_id"], "country": s["country"], "year": s["year"].astype(int), "actor": actor,
                                       "stance": s[col].astype(float), "source_id": s["source_id"]}))
    out = pd.concat(parts, ignore_index=True) if parts else _empty(cols)
    return out[cols], status


def load_inputs(warehouse: Path = WAREHOUSE_DIR) -> Inputs:
    trade = load_trade(warehouse)
    finance = load_finance(warehouse)
    gov = table_frames("governance", warehouse)
    gdp = _indicator(gov, GDP)
    unga_parts = []
    for actor, ind in UNGA.items():
        u = _indicator(gov, ind)
        if not u.empty:
            unga_parts.append(u.assign(actor=actor))
    unga = pd.concat(unga_parts, ignore_index=True) if unga_parts else _empty(["country", "year", "value", "actor"])
    debt_cn = _indicator(gov, DEBT_CN)
    stance, text_status = load_stance(warehouse)
    ctrl_parts = [_indicator(gov, ind).assign(name=name) for ind, name in CONTROLS.items()]
    controls = pd.concat([c for c in ctrl_parts if not c.empty], ignore_index=True) if any(not c.empty for c in ctrl_parts) else pd.DataFrame(columns=["country", "year", "value", "name"])
    last_year = {
        "trade": _last_year(trade), "gdp": _last_year(gdp), "unga": _last_year(unga), "debt_CN": _last_year(debt_cn), "stance": _last_year(stance),
        "finance_US": _last_year(finance[finance["origin"] == "US"]) if not finance.empty else None,
        "finance_CN": _last_year(finance[finance["origin"] == "CN"]) if not finance.empty else None,
    }
    return Inputs(trade=trade, finance=finance, gdp=gdp, unga=unga, debt_cn=debt_cn, stance=stance, text_status=text_status,
                  controls=controls[["country", "year", "name", "value"]], last_year=last_year, minerals=core_minerals())
