"""Phase 4 quant step on a small synthetic warehouse: shares, the index and its band, missing stays missing,
swap drawdowns excluded, flags, the network, and the export of the analysis block."""
from __future__ import annotations

import json

import pandas as pd

from scm import export_site, schema, warehouse
from scm.quant import concentration as conc_mod
from scm.quant import inputs as inputs_mod
from scm.quant import run as quant_run
from scm.quant.index import MIN_COMPONENTS, NAMES, components, index, normalise
from tests.test_warehouse_export import _doc, _prov, _trade

GDP_CHL = 300e9


def _write(wh, table, slot, rows):
    (wh / table).mkdir(parents=True, exist_ok=True)
    schema.validate(table, pd.DataFrame(rows)).to_parquet(wh / table / f"{slot}.parquet", index=False)


def _gov(country, year, indicator, value, sid):
    return {"country": country, "year": year, "indicator": indicator, "indicator_name": indicator, "value": value, "value_type": "reported", **_prov(sid)}


def _fin(event_id, country, year, lender, recipient, amount, origin="CN", desc="loan", conf="documented", sid="aiddata_gcdf"):
    return {"event_id": event_id, "country": country, "date": None, "year": year, "actor_from": lender, "actor_from_origin": origin, "actor_to": recipient,
            "type": "loan", "amount_usd": amount, "currency": "USD", "sector": "ENERGY", "mineral": None, "description": desc, "value_type": "reported",
            **{**_prov(sid, rel="independent_academic"), "confidence": conf}}


def _synthetic_warehouse(tmp_path):
    wh = tmp_path / "wh"
    trade = []
    shares = {2020: 0.3, 2021: 0.3, 2022: 0.6, 2023: 0.6}  # the 2022 jump is a sudden shift
    for year, cn in shares.items():
        wld = 2.0e9
        trade += [_trade("CHL", "WLD", "CHL", year, wld, "reported"), _trade("CHL", "CHN", "CHL", year, wld * cn, "reported"), _trade("CHL", "USA", "CHL", year, wld * 0.1, "reported")]
        trade += [{**_trade("CHL", "WLD", "CHL", year, 5.0e8, "reported"), "flow": "M"}, {**_trade("CHL", "CHN", "CHL", year, 2.0e8, "reported"), "flow": "M"}]
    # a second reporter so the pooled RCA has a basket; it exports copper only (no USA row: read as no flow)
    for year in shares:
        trade += [{**_trade("PER", "WLD", "PER", year, 1.0e9, "reported"), "hs6": "260300", "mineral": "copper", "stage": "concentrate"},
                  {**_trade("PER", "CHN", "PER", year, 5.0e8, "reported"), "hs6": "260300", "mineral": "copper", "stage": "concentrate"}]
    _write(wh, "trade_flow", "un_comtrade", trade)
    fin = [_fin("e1", "CHL", 2021, "China Development Bank (CDB)", "Government of Chile", 3.0e9),
           _fin("e2", "CHL", 2021, "People's Bank of China (PBC)", "Banco Central de Chile", 5.0e9, desc="drawdown under currency swap agreement"),
           _fin("e3", "CHL", 2020, "Unspecified Chinese Government Institution", None, 1.0e8),
           _fin("e4", "CHL", 2022, "US International Development Finance Corporation", "Codelco", 2.0e8, origin="US", sid="dfc_projects"),
           _fin("e5", "CHL", 2021, "China Eximbank", "Government of Chile", 9.0e9, conf="strongly_indicated")]
    _write(wh, "finance_event", "x", fin)
    gov = []
    for year in range(2019, 2024):
        gov += [_gov("CHL", year, "NY.GDP.MKTP.CD", GDP_CHL, "wb_wdi"), _gov("CHL", year, "unga_agreement_CHN", 0.7, "unga_votes"), _gov("CHL", year, "unga_agreement_USA", 0.3, "unga_votes"),
                _gov("CHL", year, "DT.DOD.DPPG.CD:730", 1.0e9 * (year - 2018), "wb_ids"), _gov("PER", year, "NY.GDP.MKTP.CD", 200e9, "wb_wdi"), _gov("PER", year, "unga_agreement_CHN", 0.6, "unga_votes")]
    _write(wh, "governance", "x", gov)
    docs = [_doc("BRA", "bill", f"2023-0{i + 1}-01", f"PL {i}/2023: acordo com a China", "bra_camara_api", f"https://www.camara.leg.br/p?id={i}", native=str(i), cn=True) for i in range(5)]
    _write(wh, "document", "bra_camara_api", docs)
    base = {"run_id": "zero_shot-1", "method": "zero_shot", "model": "nli", "codebook_version": "v1", "frame": None, "created_at": "2026-10-04T00:00:00+00:00"}
    cls = [{"doc_id": d["doc_id"], "stance_us": pd.NA, "stance_us_conf": None, "stance_cn": 1 if i < 4 else -1, "stance_cn_conf": 0.8, "tone": None, "tone_conf": None, **base} for i, d in enumerate(docs)]
    warehouse.upsert("doc_classification", "zero_shot", pd.DataFrame(cls), wh)
    _write(wh, "ingest_run", "x", [{"run_id": "r", "source_id": "un_comtrade", "started_at": "t", "finished_at": "t", "status": "ok", "rows": "{}", "error": None, "snapshot_dir": None}])
    return wh


def test_concentration_shares_and_notes(tmp_path):
    wh = _synthetic_warehouse(tmp_path)
    conc = conc_mod.concentration(inputs_mod.load_trade(wh))
    chl = conc[(conc["country"] == "CHL") & (conc["mineral"] == "lithium") & (conc["year"] == 2023)].set_index("metric")["value"]
    assert chl["share_cn_x"] == 0.6 and chl["share_us_x"] == 0.1 and chl["big2_share_x"] == 0.7 and abs(chl["share_other_x"] - 0.3) < 1e-9
    assert chl["share_cn_m"] == 0.4 and chl["exports_wld_usd"] == 2.0e9
    hhi = conc[(conc["country"] == "CHL") & (conc["metric"] == "hhi_export_dest")]
    assert hhi["value"].isna().all() and hhi["note"].str.startswith("not computable").all()
    per = conc[(conc["country"] == "PER") & (conc["mineral"] == "copper") & (conc["year"] == 2023)].set_index("metric")
    assert per.loc["share_us_x", "value"] == 0.0 and "no row for this partner" in per.loc["share_us_x", "note"]
    # RCA against the pooled basket: Chile exports lithium only, Peru copper only
    assert conc[(conc["metric"] == "rca_pool") & (conc["country"] == "CHL") & (conc["year"] == 2023)]["value"].iloc[0] > 1
    assert "all" in set(conc["mineral"])


def test_index_components_missing_stays_missing_and_swaps_excluded(tmp_path):
    wh = _synthetic_warehouse(tmp_path)
    inp = inputs_mod.load_inputs(wh)
    assert inp.last_year["finance_CN"] == 2021 and inp.last_year["finance_US"] == 2022
    conc = conc_mod.concentration(inp.trade)
    comp = normalise(components(inp, conc))
    chl = comp[(comp["country"] == "CHL") & (comp["mineral"] == "all") & (comp["actor"] == "CN")].set_index(["year", "component"])
    # documented, non-swap commitments only: 1e8 (2020) + 3e9 (2021); the 5e9 swap and the 9e9 strongly-indicated row are out
    assert abs(chl.loc[(2021, "finance_flow"), "raw_value"] - 3.1e9 / GDP_CHL) < 1e-12
    assert not chl.loc[(2022, "finance_flow"), "available"] and "coverage ends 2021" in chl.loc[(2022, "finance_flow"), "note"]
    assert chl.loc[(2023, "debt_stock"), "raw_value"] == 5e9 / GDP_CHL
    us = comp[(comp["country"] == "CHL") & (comp["mineral"] == "all") & (comp["actor"] == "US") & (comp["component"] == "debt_stock")]
    assert not us["available"].any() and us["note"].str.contains("United States").all()
    # nothing is invented for a country without data
    ury = comp[(comp["country"] == "URY") & comp["available"]]
    assert ury.empty
    assert set(comp["component"]) == set(NAMES)
    idx, stability = index(comp, draws=50, seed=1)
    inf = idx[idx["index_name"] == "influence"]
    assert set(inf["country"]) <= {"CHL", "PER", "BRA"}  # rows only where something is available
    chl_cn = inf[(inf["country"] == "CHL") & (inf["actor"] == "CN") & (inf["mineral"] == "all")].set_index("year")
    assert chl_cn.loc[2021, "n_components"] >= MIN_COMPONENTS and chl_cn.loc[2021, "value"] is not None
    ok = inf[inf["value"].notna()]
    assert ((ok["lower"] <= ok["value"]) & (ok["value"] <= ok["upper"])).all() and ok["value"].between(0, 100).all()
    assert (inf[inf["n_components"] < MIN_COMPONENTS]["value"].isna()).all()
    sub = idx[idx["index_name"] == "economic_ties"]
    assert not sub.empty and sub["value"].notna().all()
    # the mineral-specific composite exists only where the country traded the mineral
    assert set(idx[idx["mineral"] == "lithium"]["country"]) == {"CHL"} and set(idx[idx["mineral"] == "copper"]["country"]) == {"PER"}
    assert stability is None  # fewer than six ranked countries


def test_run_writes_tables_flags_network_and_export(tmp_path):
    wh = _synthetic_warehouse(tmp_path)
    res = quant_run.run(wh, draws=40, seed=3, release="test-release")
    assert res["inputs_release"] == "test-release" and res["rows"]["index_value"] > 0 and res["rows"]["quant_run"] == 1
    flags = warehouse.load_slot("anomaly_flag", "quant", wh)
    kinds = set(zip(flags["type"], flags["evidence_level"], strict=True))
    assert ("sudden_trade_shift", "documented") in kinds and ("large_commitment", "documented") in kinds and ("rescue_lending", "documented") in kinds
    shift = flags[(flags["type"] == "sudden_trade_shift") & (flags["actor"] == "CN")].iloc[0]
    assert shift["year"] == 2022 and "30% to 60%" in shift["description"] and shift["evidence_source_ids"] == "un_comtrade"
    assert (flags["inputs_release"] == "test-release").all()
    nodes = warehouse.load_slot("network_metric", "quant", wh)
    edges = warehouse.load_slot("network_edge", "quant", wh)
    assert "lender:China Development Bank (CDB)" in set(nodes["node_id"]) and "recipient:CHL:Government of Chile" in set(nodes["node_id"])
    assert res["unattributed_finance_events"] == 1 and len(edges) == 4
    cdb = nodes.set_index("node_id").loc["lender:China Development Bank (CDB)"]
    assert cdb["degree"] == 1 and cdb["weighted_degree"] == 3.0e9
    nodes2, edges2, _ = __import__("scm.quant.network", fromlist=["network"]).network(inputs_mod.load_finance(wh))
    assert nodes2.drop(columns=[]).equals(nodes.drop(columns=["method_version", "run_id", "inputs_release"])) and len(edges2) == len(edges)
    sd = warehouse.load_slot("say_do_gap", "quant", wh)
    assert len(sd) == 1 and sd.iloc[0]["country"] == "BRA" and sd.iloc[0]["n_docs"] == 5 and sd.iloc[0]["text_model_status"] == "zero-shot baseline, not yet validated"
    assert pd.isna(sd.iloc[0]["action"])  # no economic-ties index for Brazil in the synthetic set: no action value, no gap
    # re-running replaces, never accumulates
    quant_run.run(wh, draws=40, seed=3, release="test-release")
    assert len(warehouse.load_slot("anomaly_flag", "quant", wh)) == len(flags)

    warehouse.build(wh)
    out = tmp_path / "site"
    export_site.run(wh, out)
    chl = json.loads((out / "country" / "CHL.json").read_text())
    a = chl["analysis"]
    assert a["quant_model"]["status"] == "computed" and a["quant_model"]["inputs_release"] == "test-release"
    assert any(r["index_name"] == "influence" and r["actor"] == "CN" and r["value"] is not None for r in a["index"])
    drivers = next(c for c in a["components"] if c["year"] == 2022 and c["actor"] == "CN")["components"]
    fin = next(c for c in drivers if c["name"] == "finance_flow")
    assert fin["available"] is False and "coverage ends 2021" in fin["note"]
    shift_flag = next(f for f in a["flags"] if f["type"] == "sudden_trade_shift")
    assert shift_flag["evidence"][0]["id"] == "un_comtrade" and shift_flag["evidence"][0]["sample"] is False and shift_flag["evidence_level"] == "documented"
    assert any(c["mineral"] == "lithium" and c["share_cn_x"] == 0.6 and c["hhi_export_dest"] is None for c in a["concentration"])
    assert any(n["label"] == "China Development Bank (CDB)" for n in a["network"]["nodes"]) and a["network"]["unattributed_events"] == 1
    assert chl["freshness"]["analysis"]["source_ids"]
    assert "analysis" not in json.loads((out / "country" / "URY.json").read_text())
    idx = json.loads((out / "index.json").read_text())
    assert idx["layer"] == "real" and all(0 <= r["lower"] <= r["value"] <= r["upper"] <= 100 for r in idx["rows"]) and {r["mineral"] for r in idx["rows"]} >= {"all", "lithium"}
    meta = json.loads((out / "meta.json").read_text())
    assert meta["layers"]["analysis"] == "real" and meta["tables"]["index_value"] > 0 and meta["quant_model"]["draws"] == 40
    cov = json.loads((out / "coverage.json").read_text())["countries"]
    assert cov["CHL"]["analysis_available"] and cov["CHL"]["analysis_years"] == [2020, 2023] and cov["ARG"]["analysis_available"] is False
    q = json.loads((out / "quant.json").read_text())
    assert q["status"] == "computed" and q["rules"]["min_components"] == MIN_COMPONENTS and q["flags_by_type"]["sudden_trade_shift"]["documented"] >= 1
    assert next(c for c in q["components"] if c["name"] == "debt_stock")["availability"]["US"]["available"] == 0


def test_export_without_quant_tables_keeps_analysis_sample(tmp_path):
    wh = tmp_path / "wh"
    _write(wh, "trade_flow", "un_comtrade", [_trade("CHL", "WLD", "CHL", 2022, 1.0e9, "reported")])
    _write(wh, "ingest_run", "x", [{"run_id": "r", "source_id": "un_comtrade", "started_at": "t", "finished_at": "t", "status": "ok", "rows": "{}", "error": None, "snapshot_dir": None}])
    warehouse.build(wh)
    out = tmp_path / "site"
    export_site.run(wh, out)
    meta = json.loads((out / "meta.json").read_text())
    assert meta["layers"]["analysis"] == "sample" and meta["quant_model"]["status"] == "not_yet_computed"
    assert json.loads((out / "index.json").read_text())["rows"] == [] and json.loads((out / "quant.json").read_text())["status"] == "not_yet_computed"


def test_event_effects_window_and_did(tmp_path):
    from scm.quant import events as ev

    years = list(range(2010, 2024))
    rows = []
    for iso in ["CHL", "PER", "ARG", "BRA", "COL"]:
        for y in years:
            base = 0.4 if iso == "CHL" else 0.2
            jump = 0.2 if (iso == "CHL" and y >= 2018) else 0.0  # Chile's share to China steps up after 2017
            rows.append({"country": iso, "year": y, "share_us": 0.1, "share_cn": base + jump})
    shares = pd.DataFrame(rows)
    path = tmp_path / "events.yaml"
    path.write_text("""events:
  - {id: chl_event, date: 2017-06-01, actor: CHL, scope: [CHL], type: strategy, title: Chile event, source_id: chl_corfo_lithium, status: reviewed, verify: false}
  - {id: global_event, date: 2017-06-01, actor: US, scope: all, type: law, title: Global event, source_id: federal_register, status: draft, verify: true}
  - {id: late_event, date: 2023-06-01, actor: CN, scope: all, type: export_control, title: No post years yet, source_id: mofcom_export_controls, status: draft, verify: false}
""", encoding="utf-8")
    events = ev.load_events(path)
    assert len(events) == 3 and events[0]["countries"] == ["CHL"] and events[1]["scope_all"] and events[1]["status"] == "draft"
    out = ev.event_effects(events, shares, n_perm=200, seed=1)
    chl = out[(out["event_id"] == "chl_event") & (out["country"] == "CHL") & (out["actor"] == "CN")].iloc[0]
    assert chl["design"] == "window" and abs(chl["diff"] - 0.2) < 1e-9 and chl["placebo_p"] is not None and chl["placebo_p"] < 0.2
    did = out[(out["event_id"] == "chl_event") & (out["design"] == "did") & (out["actor"] == "CN")].iloc[0]
    assert abs(did["diff"] - 0.2) < 1e-9 and did["treated_countries"] == "CHL" and did["control_countries"] == "ARG,BRA,COL,PER" and did["placebo_p"] <= 0.25
    assert out[(out["event_id"] == "global_event") & (out["design"] == "did")].empty  # no control group for a global event
    late = out[out["event_id"] == "late_event"]
    assert late["diff"].isna().all() and late["note"].str.contains("not covered").all()
    assert set(out["event_status"]) == {"reviewed", "draft"}


def test_panel_regression_recovers_a_planted_effect():
    import numpy as np

    from scm.quant import panel as pn

    rng = np.random.default_rng(0)
    rows = []
    for i, iso in enumerate(["ARG", "BOL", "BRA", "CHL", "COL", "ECU", "PER", "GUY"]):
        for y in range(2009, 2022):
            x = rng.normal()
            z = rng.normal()
            # outcome: country effect + year effect + 0.05 per 1 SD of x + noise; z and the others carry nothing
            rows.append({"country": iso, "year": y, "actor": "CN", "share_x": 0.3 + 0.02 * i + 0.01 * (y - 2009) + 0.05 * x + rng.normal(scale=0.01), "share_m": np.nan,
                         "finance_flow_lag1": x, "diplomatic_alignment": z, "electoral_democracy": rng.normal(), "rule_of_law": rng.normal(), "mineral_rents_gdp": rng.normal()})
    panel = pd.DataFrame(rows)
    out = pn.panel_regressions(panel, n_boot=99, seed=1)
    main = out[(out["spec"] == "exports_to_cn") & (out["variant"] == "twfe")].set_index("term")
    assert abs(main.loc["finance_flow_lag1", "coef"] - 0.05) < 0.01 and main.loc["finance_flow_lag1", "p_wild"] < 0.05 and main.loc["finance_flow_lag1", "p_cluster"] < 0.01
    assert main.loc["finance_flow_lag1", "jk_min"] <= main.loc["finance_flow_lag1", "coef"] <= main.loc["finance_flow_lag1", "jk_max"]
    assert abs(main.loc["diplomatic_alignment", "coef"]) < 0.01 and main.loc["diplomatic_alignment", "p_wild"] > 0.05
    assert main["n_obs"].iloc[0] == 104 and main["n_countries"].iloc[0] == 8 and main["r2_within"].iloc[0] > 0.5
    assert out[(out["spec"] == "imports_from_cn")].empty  # no import outcome in the synthetic panel
    assert set(out["variant"]) == {"twfe", "country_fe"}


def test_run_exports_event_effects_and_regressions(tmp_path):
    wh = _synthetic_warehouse(tmp_path)
    path = tmp_path / "events.yaml"
    path.write_text("events:\n  - {id: chl_event, date: 2021-03-01, actor: CHL, scope: [CHL], type: strategy, title: Chile event, source_id: chl_corfo_lithium, status: draft, verify: true}\n", encoding="utf-8")
    res = quant_run.run(wh, draws=20, seed=3, release="t", n_boot=19, events_path=path)
    assert res["rows"]["event_effect"] >= 2 and res["events"] == {"total": 1, "reviewed": 0, "draft": 1}
    eff = warehouse.load_slot("event_effect", "quant", wh)
    chl_cn = eff[(eff["country"] == "CHL") & (eff["actor"] == "CN")].iloc[0]
    assert chl_cn["pre_mean"] == 0.3 and chl_cn["post_mean"] == 0.6 and abs(chl_cn["diff"] - 0.3) < 1e-9 and chl_cn["event_status"] == "draft"
    assert res["rows"]["regression_result"] == 0  # two countries: below the panel minimum, nothing invented
    warehouse.build(wh)
    out = tmp_path / "site"
    export_site.run(wh, out)
    chl = json.loads((out / "country" / "CHL.json").read_text())["analysis"]
    e = next(r for r in chl["event_effects"] if r["actor"] == "CN" and r["design"] == "window")
    assert e["title"] == "Chile event" and e["status"] == "draft" and e["verify"] is True and e["source"]["id"] == "chl_corfo_lithium" and abs(e["diff"] - 0.3) < 1e-9
    q = json.loads((out / "quant.json").read_text())
    assert q["events"]["total"] == 1 and q["events"]["with_window"] >= 2 and q["regressions"]["rows"] == [] and "not computed" in q["regressions"]["note"]


def test_forecast_models_backtest_and_selection():
    import numpy as np

    from scm.quant import forecast as fc

    rng = np.random.default_rng(0)
    # CRPS identity: a point mass at the outcome scores zero, a point mass away scores the distance
    assert fc.crps(np.full(500, 3.0), 3.0) == 0.0 and abs(fc.crps(np.full(500, 3.0), 5.0) - 2.0) < 1e-12
    # simulators respect the horizon and the bounds
    y = np.array([0.30, 0.32, 0.35, 0.37, 0.40, 0.42, 0.45, 0.47, 0.50, 0.52, 0.55, 0.57, 0.60])
    for name, sim in fc.SIMULATORS.items():
        paths = sim(y, 3, 200, rng)
        assert paths.shape == (200, 3), name
    pooled = fc.pooled_drift({"CHL": y, "PER": y[::-1], "ARG": y * 0.5}, "CHL")
    assert 0 <= pooled <= float(np.diff(y).mean())  # shrunk toward the (lower) cross-country mean
    # a steadily trending series: the drift family beats naive persistence in the expanding-window backtest
    years = {"CHL": np.arange(2010, 2010 + len(y)), "PER": np.arange(2010, 2010 + len(y))}
    series = {"CHL": y, "PER": y + 0.05}
    bt = fc.backtest(series, years, (0.0, 1.0), rng, n=200)
    summary = fc.summarise(bt)
    assert set(summary["model"]) == set(fc.MODELS) and (summary[summary["h"] == 0]["n"] > 0).all()
    pooled_scores = summary[summary["h"] == 0].set_index("model")["crps"]
    assert pooled_scores["drift"] < pooled_scores["naive"]
    assert fc.select_model(summary) != "naive"
    # no model beats naive -> naive is selected and labelled as such
    flat = summary.copy()
    flat.loc[flat["model"] != "naive", "crps"] = flat["crps_naive"] * 1.5
    assert fc.select_model(flat) == "naive"


def test_forecasts_rows_scenarios_and_no_series_too_short():
    import numpy as np

    from scm.quant import forecast as fc

    years = list(range(2012, 2026))
    rows = []
    for iso, start in [("CHL", 0.3), ("PER", 0.4), ("ARG", 0.1)]:
        for i, y in enumerate(years):
            rows.append({"country": iso, "year": y, "share_us": 0.1, "share_cn": start + 0.015 * i})
    rows += [{"country": "URY", "year": y, "share_us": 0.0, "share_cn": 0.0} for y in (2008, 2009, 2010, 2011)]  # too short, not current
    shares = pd.DataFrame(rows)
    idx = pd.DataFrame(columns=["country", "year", "actor", "mineral", "index_name", "value"])
    out, bt, status = fc.forecasts(idx, shares, seed=1, n_sims=300, n_backtest=100)
    assert set(out["country"]) == {"CHL", "PER", "ARG"} and set(out["scenario_id"]) == {"baseline", "china_pull", "us_reshoring"}
    chl = out[(out["country"] == "CHL") & (out["actor"] == "CN") & (out["scenario_id"] == "baseline")].sort_values("horizon_year")
    assert list(chl["horizon_year"]) == [2026, 2027, 2028, 2029, 2030] and (chl["last_observed_year"] == 2025).all()
    assert ((chl["p05"] <= chl["p25"]) & (chl["p25"] <= chl["point"]) & (chl["point"] <= chl["p75"]) & (chl["p75"] <= chl["p95"])).all()
    assert chl["p95"].between(0, 1).all()
    pull = out[(out["country"] == "CHL") & (out["actor"] == "CN") & (out["scenario_id"] == "china_pull")].sort_values("horizon_year")
    assert float(pull["point"].iloc[-1]) > float(chl["point"].iloc[-1])  # the stated shift moves the scenario path
    assert status["targets"]["export_share:CN"]["model"] in fc.MODELS and status["targets"]["influence_index:CN"]["model"] is None
    assert not bt[(bt["target"] == "export_share") & (bt["actor"] == "CN") & bt["selected"]].empty
    assert np.isclose(bt[(bt["model"] == "naive") & (bt["h"] == 0)]["crps_ratio"], 1.0).all()


def test_run_exports_forecast_block(tmp_path):
    wh = _synthetic_warehouse(tmp_path)
    # extend Chile's trade to a series long enough to forecast (2014–2025), China's share drifting up
    rows = []
    for i, year in enumerate(range(2014, 2026)):
        wld = 2.0e9
        rows += [_trade("CHL", "WLD", "CHL", year, wld, "reported"), _trade("CHL", "CHN", "CHL", year, wld * (0.3 + 0.02 * i), "reported"), _trade("CHL", "USA", "CHL", year, wld * 0.1, "reported")]
    _write(wh, "trade_flow", "un_comtrade", rows)
    res = quant_run.run(wh, draws=20, seed=3, release="t", n_boot=19, n_sims=200, n_backtest=50)
    assert res["rows"]["forecast"] > 0 and res["rows"]["backtest"] > 0
    assert res["forecast"]["targets"]["export_share:CN"]["countries"] == ["CHL"]
    warehouse.build(wh)
    out = tmp_path / "site"
    export_site.run(wh, out)
    chl = json.loads((out / "country" / "CHL.json").read_text())
    f = chl["forecast"]
    base = [r for r in f["series"] if r["scenario_id"] == "baseline" and r["target"] == "export_share" and r["actor"] == "CN"]
    assert [r["year"] for r in base] == [2026, 2027, 2028, 2029, 2030] and base[0]["model"] in f["models"]
    assert f["model_status"]["export_share:CN"]["n_tests"] > 0 and len(f["scenarios"]) == 3 and f["scenarios"][1]["assumptions"]
    assert chl["freshness"]["forecast"]["schedule"].startswith("monthly")
    assert "forecast" not in json.loads((out / "country" / "ARG.json").read_text())
    meta = json.loads((out / "meta.json").read_text())
    assert meta["layers"]["forecast"] == "real" and meta["coverage"]["CHL"]["forecast_available"] and not meta["coverage"]["ARG"]["forecast_available"]
    q = json.loads((out / "quant.json").read_text())["forecast"]
    assert q["status"] == "computed" and q["countries"] == ["CHL"] and any(r["selected"] for r in q["backtest"])


def test_briefs_sentences_cite_indicators_and_missing_data_is_said(tmp_path):
    from scm.quant import briefs

    wh = _synthetic_warehouse(tmp_path)
    rows = []
    for i, year in enumerate(range(2014, 2026)):
        wld = 2.0e9
        rows += [_trade("CHL", "WLD", "CHL", year, wld, "reported"), _trade("CHL", "CHN", "CHL", year, wld * (0.3 + 0.02 * i), "reported"), _trade("CHL", "USA", "CHL", year, wld * 0.1, "reported")]
    _write(wh, "trade_flow", "un_comtrade", rows)
    human_dir = tmp_path / "interp"
    human_dir.mkdir()
    (human_dir / "CHL.md").write_text("---\ntitle: Chile, my reading\nauthor: Owner\ndate: 2026-10-10\nreviewed: true\n---\n\n## Alignment\n\nMy own view, with a claim.\n", encoding="utf-8")
    (human_dir / "BRA.md").write_text("---\nreviewed: false\n---\n", encoding="utf-8")  # empty body: ignored
    (human_dir / "regional.md").write_text("---\ntitle: Region, drafted\nauthor: AI-drafted; not yet reviewed\ndate: 2026-10-11\nreviewed: false\ndrafted_by: ai\n---\n\nA regional reading [ranking].\n", encoding="utf-8")
    res = quant_run.run(wh, draws=20, seed=3, release="t", n_boot=19, n_sims=200, n_backtest=50, human_dir=human_dir)
    assert res["briefs"]["sections"] == 12 * 7 + 7 + 2 and res["briefs"]["human"] == 2 and res["briefs"]["changed"] == res["briefs"]["sections"]
    text = warehouse.load_slot("analysis_text", "quant", wh)
    gen = text[text["model"] != "human"]
    assert set(gen["scope"]) == {"country", "regional"} and (gen["template_version"] == briefs.TEMPLATE_VERSION).all()
    # every generated sentence carries at least one indicator id
    for r in gen.itertuples(index=False):
        for s in json.loads(r.sentences_json):
            assert s["ids"], (r.section, s["text"])
    chl = gen[(gen["country"] == "CHL")].set_index("section")
    assert "52%" in chl.loc["trade", "text_md"]  # the 2025 share to China (0.3 + 0.02*11)
    assert "concentration:share_cn_x:all:2025" in chl.loc["trade", "supporting_indicator_ids"]
    assert "swap-line" in chl.loc["finance_and_debt", "text_md"].lower()
    ven = gen[(gen["country"] == "VEN")].set_index("section")
    assert "No reported mineral trade" in ven.loc["trade", "text_md"] and "No influence index" in ven.loc["where_it_stands", "text_md"]
    assert "%" not in ven.loc["trade", "text_md"]  # nothing invented
    regional = gen[gen["scope"] == "regional"].set_index("section")
    assert "Herfindahl" in regional.loc["trade_pattern", "text_md"]
    human = text[text["model"] == "human"].set_index("scope")
    assert len(human) == 2 and human.loc["country", "country"] == "CHL" and human.loc["country", "reviewed_by_human"] and human.loc["country", "author"] == "Owner" and human.loc["country", "title"] == "Chile, my reading"
    assert human.loc["country", "text_md"].startswith("## Alignment") and human.loc["country", "drafted_by"] == "owner"
    assert human.loc["regional", "drafted_by"] == "ai" and not human.loc["regional", "reviewed_by_human"] and human.loc["regional", "title"] == "Region, drafted"
    assert gen["drafted_by"].isna().all()
    # an identical re-run changes nothing; the diff flags turn false
    res2 = quant_run.run(wh, draws=20, seed=3, release="t", n_boot=19, n_sims=200, n_backtest=50, human_dir=human_dir)
    assert res2["briefs"]["changed"] == 0
    text2 = warehouse.load_slot("analysis_text", "quant", wh)
    assert not text2["changed_since_previous"].any() and text2["previous_date"].notna().all()

    warehouse.build(wh)
    out = tmp_path / "site"
    export_site.run(wh, out)
    c = json.loads((out / "country" / "CHL.json").read_text())
    interp = c["interpretation"]
    assert [g["section"] for g in interp["generated"]] == ["where_it_stands", "trade", "finance_and_debt", "politics", "events", "outlook", "data_caveats"]
    assert interp["generated"][1]["sentences"][0]["ids"] and interp["human"]["author"] == "Owner" and interp["human"]["reviewed"] is True
    assert not interp["generated"][1]["changed_since_previous"] and interp["generated"][1]["previous_date"]
    v = json.loads((out / "country" / "VEN.json").read_text())["interpretation"]
    assert v["human"] is None and "No reported mineral trade" in v["generated"][1]["sentences"][0]["text"]
    region = json.loads((out / "region.json").read_text())["interpretation"]
    assert region["generated"][0]["section"] == "ranking" and region["human"]["drafted_by"] == "ai" and region["human"]["reviewed"] is False and region["human"]["author"] == "AI-drafted; not yet reviewed"
    assert interp["human"]["drafted_by"] == "owner"
    meta = json.loads((out / "meta.json").read_text())
    assert meta["layers"]["interpretation"] == "generated+human" and meta["coverage"]["CHL"]["human_interpretation"] and not meta["coverage"]["VEN"]["human_interpretation"]
    assert meta["interpretation_briefs"] == {"total": 2, "reviewed": 1, "ai_drafted": 1}


def test_load_human_front_matter(tmp_path):
    from scm.quant.briefs import load_human

    assert load_human(tmp_path / "missing.md") is None
    p = tmp_path / "x.md"
    p.write_text("Just a paragraph, no front matter.\n", encoding="utf-8")
    h = load_human(p)
    assert h["text_md"] == "Just a paragraph, no front matter." and h["reviewed"] is False and h["author"] == "project owner"
