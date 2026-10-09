"""Run every Phase 4 computation on the warehouse and replace the quant tables."""
from __future__ import annotations

import json
import os
from datetime import UTC, datetime
from pathlib import Path

import pandas as pd

from ..paths import WAREHOUSE_DIR
from ..schema import QUANT_TABLES
from ..warehouse import replace_slot
from . import METHOD_VERSION, WEIGHTS_VERSION
from .anomalies import anomalies
from .concentration import concentration, wide
from .events import EVENTS_FILE, event_effects, load_events
from .index import COMPONENTS, components, index, normalise
from .inputs import load_inputs
from .network import network
from .panel import build_panel, panel_regressions
from .say_do import say_do

SLOT = "quant"


def inputs_release() -> str:
    """The data release the warehouse was restored from (set by .github/scripts/restore_release.sh), else `local`."""
    tag = os.environ.get("RESTORED_TAG")
    if tag:
        return tag
    p = Path("/tmp/restored.json")
    if p.exists():
        try:
            return str(json.loads(p.read_text(encoding="utf-8")).get("_release") or "restored")
        except (OSError, ValueError):
            return "restored"
    return "local"


def run(warehouse: Path = WAREHOUSE_DIR, draws: int = 500, seed: int = 20261009, release: str | None = None, n_boot: int = 999,
        events_path: Path = EVENTS_FILE) -> dict:
    run_id = f"quant-{datetime.now(UTC).strftime('%Y%m%dT%H%M%SZ')}"
    release = release or inputs_release()
    stamp = {"method_version": METHOD_VERSION, "run_id": run_id, "inputs_release": release}
    inp = load_inputs(warehouse)
    conc = concentration(inp.trade)
    comp = normalise(components(inp, conc))
    idx, stability = index(comp, draws=draws, seed=seed)
    sd = say_do(inp.stance, idx, inp.text_status.get("label"))
    flags = anomalies(conc, inp.finance, inp.gdp, inp.debt_cn, sd, inp.stance, inp.last_year)
    nodes, edges, unattributed = network(inp.finance)
    events = load_events(events_path)
    ex_all = wide(conc, "x")
    effects = event_effects(events, ex_all[ex_all["mineral"] == "all"][["country", "year", "share_us", "share_cn"]] if not ex_all.empty else ex_all, seed=seed)
    regressions = panel_regressions(build_panel(conc, comp, inp.controls), n_boot=n_boot, seed=seed)
    k = len(COMPONENTS)
    comp_out = comp.drop(columns=["rank_value"]).assign(weight=1.0 / k, weights_version=WEIGHTS_VERSION)
    idx_out = idx.assign(weights_version=WEIGHTS_VERSION)
    notes = {"unattributed_finance_events": int(unattributed), "last_year": inp.last_year, "text_model": inp.text_status.get("label"),
             "countries_with_trade": sorted(inp.trade["reporter"].unique().tolist()) if not inp.trade.empty else [],
             "events": {"total": len(events), "reviewed": sum(1 for e in events if e["status"] == "reviewed"), "draft": sum(1 for e in events if e["status"] != "reviewed")},
             "n_boot": int(n_boot)}
    qrun = pd.DataFrame([{"created_at": datetime.now(UTC).isoformat(timespec="seconds"), "weights_version": WEIGHTS_VERSION, "draws": int(draws),
                          "rank_stability": stability, "notes": json.dumps(notes, default=str)}])
    frames = {"concentration": conc, "index_value": idx_out, "index_component": comp_out, "say_do_gap": sd, "anomaly_flag": flags,
              "network_metric": nodes, "network_edge": edges, "event_effect": effects, "regression_result": regressions, "quant_run": qrun}
    written: dict[str, int] = {}
    for table in QUANT_TABLES:
        df = frames[table]
        if not df.empty:
            df = df.assign(**stamp)
        written[table] = replace_slot(table, SLOT, df, warehouse)
    return {"run_id": run_id, "inputs_release": release, "rows": written, "rank_stability": stability, **notes}
