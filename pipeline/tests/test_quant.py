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
