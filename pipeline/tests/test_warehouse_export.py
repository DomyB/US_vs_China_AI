from __future__ import annotations

import json

import pandas as pd

from scm import export_site, schema, warehouse


def _prov(sid, lang="en", rel="official"):
    return {"source_id": sid, "source_url": "https://x.test", "source_record_url": None, "retrieved_at": "2026-10-01T00:00:00+00:00", "original_language": lang, "reliability": rel, "confidence": "documented"}


def _trade(reporter, partner, reported_by, year, value, vt):
    return {"reporter": reporter, "partner": partner, "reported_by": reported_by, "hs6": "283691", "mineral": "lithium", "stage": "intermediate", "year": year, "month": pd.NA, "flow": "X", "value_usd": value, "qty": None, "qty_unit": None, "value_type": vt, **_prov("un_comtrade")}


def test_trade_discrepancy_flags():
    t = pd.DataFrame([_trade("ARG", "CHN", "ARG", 2022, 100.0, "reported"), _trade("ARG", "CHN", "CHN", 2022, 350.0, "mirror"), _trade("ARG", "USA", "ARG", 2022, 50.0, "reported")])
    d = warehouse.trade_discrepancies(t)
    assert d[d["partner"] == "CHN"].iloc[0]["flag"] == "large_discrepancy"
    assert d[d["partner"] == "USA"].iloc[0]["flag"] == "reported_only"


def test_finance_clusters_merge_only_across_sources():
    base = {"date": None, "actor_from": "CDB", "actor_from_origin": "CN", "actor_to": "x", "type": "loan", "currency": "USD", "sector": None, "mineral": None, "description": "d", "value_type": "reported"}
    rows = [
        {"event_id": "a", "country": "ECU", "year": 2016, "amount_usd": 1.5e9, **base, **_prov("aiddata_gcdf")},
        {"event_id": "b", "country": "ECU", "year": 2016, "amount_usd": 1.55e9, **base, **_prov("bu_codf")},
        {"event_id": "c", "country": "ECU", "year": 2016, "amount_usd": 1.52e9, **base, **_prov("aiddata_gcdf")},
        {"event_id": "d", "country": "ECU", "year": 2017, "amount_usd": 1.5e9, **base, **_prov("bu_codf")},
    ]
    f = warehouse.finance_clusters(pd.DataFrame(rows))
    by_id = f.set_index("event_id")
    assert by_id.loc["a", "dedup_cluster_id"] == by_id.loc["b", "dedup_cluster_id"]
    assert by_id.loc["a", "source_ids"] == "aiddata_gcdf,bu_codf"
    assert by_id.loc["c", "dedup_cluster_id"] != by_id.loc["a", "dedup_cluster_id"]
    assert by_id.loc["d", "dedup_cluster_id"] != by_id.loc["b", "dedup_cluster_id"]


def test_build_and_export_end_to_end(tmp_path):
    wh = tmp_path / "wh"
    trade = pd.DataFrame([_trade("CHL", "CHN", "CHL", 2022, 2.0e9, "reported"), _trade("CHL", "USA", "CHL", 2022, 5.0e8, "reported"), _trade("CHL", "WLD", "CHL", 2022, 4.0e9, "reported"), _trade("CHL", "CHN", "CHN", 2022, 2.1e9, "mirror")])
    (wh / "trade_flow").mkdir(parents=True)
    schema.validate("trade_flow", trade).to_parquet(wh / "trade_flow" / "un_comtrade.parquet", index=False)
    fin = pd.DataFrame([{"event_id": "e1", "country": "CHL", "date": "2018-12-03", "year": 2018, "actor_from": "Tianqi", "actor_from_origin": "CN", "actor_to": "SQM", "type": "equity", "amount_usd": 4.07e9, "currency": "USD", "sector": "Metals", "mineral": "lithium", "description": "stake", "value_type": "reported", **_prov("aiddata_gcdf", rel="independent_academic")}])
    (wh / "finance_event").mkdir()
    schema.validate("finance_event", fin).to_parquet(wh / "finance_event" / "aiddata_gcdf.parquet", index=False)
    gov = pd.DataFrame([{"country": "CHL", "year": 2022, "indicator": "CC.EST", "indicator_name": "Control of corruption", "value": 1.0, "value_type": "reported", **_prov("wb_wgi")}])
    (wh / "governance").mkdir()
    schema.validate("governance", gov).to_parquet(wh / "governance" / "wb_wgi.parquet", index=False)
    runs = pd.DataFrame([{"run_id": "r", "source_id": "un_comtrade", "started_at": "t", "finished_at": "t", "status": "ok", "rows": "{}", "error": None, "snapshot_dir": None}])
    (wh / "ingest_run").mkdir()
    schema.validate("ingest_run", runs).to_parquet(wh / "ingest_run" / "un_comtrade.parquet", index=False)

    warehouse.build(wh)
    out = tmp_path / "site"
    res = export_site.run(wh, out)
    assert res["countries"] == 12
    chl = json.loads((out / "country" / "CHL.json").read_text())
    tb = chl["actions"]["trade"][0]
    assert tb["exports_musd"] == {"CN": 2000.0, "US": 500.0, "ROW": 1500.0} and tb["mirror_musd"]["CN"] == 2100.0
    ev = chl["actions"]["events"][0]
    assert ev["actor_side"] == "CN" and ev["amount_musd"] == 4070.0 and ev["source"]["sample"] is False and ev["source"]["reliability"] == "independent_academic"
    assert chl["governance"][0]["indicator"] == "CC.EST"
    cov = json.loads((out / "coverage.json").read_text())["countries"]
    assert cov["CHL"]["trade_years"] == [2022] and cov["ARG"]["actions"] is False
    region = json.loads((out / "region.json").read_text())
    assert region["mineral_shares"][0]["share_cn"] == 0.5
    meta = json.loads((out / "meta.json").read_text())
    assert meta["layers"]["facts"] == "real" and meta["layers"]["model_outputs"] == "sample"
