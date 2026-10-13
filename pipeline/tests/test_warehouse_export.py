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


def _census(reporter, year, month, value, hs6="283691", mineral="lithium"):
    """One monthly US Census import row: the US-side mirror of the reporter's exports, reported by the United States."""
    return {"reporter": reporter, "partner": "USA", "reported_by": "USA", "hs6": hs6, "mineral": mineral, "stage": "intermediate", "year": year, "month": month, "flow": "X", "value_usd": value, "qty": None, "qty_unit": None, "value_type": "mirror", **_prov("us_census_trade")}


def test_census_monthly_mirror_fills_complete_years_only():
    rows = [_trade("CHL", "USA", "CHL", 2024, 1.0e8, "reported"), _trade("CHL", "USA", "USA", 2024, 1.1e8, "mirror"),  # 2024: an annual Comtrade mirror exists
            _trade("CHL", "USA", "CHL", 2025, 1.2e8, "reported")]  # 2025: Comtrade has not published the US side
    rows += [_census("CHL", 2024, m, 5.0e7) for m in range(1, 13)]  # a complete Census year that must not replace Comtrade's row
    rows += [_census("CHL", 2025, m, 1.0e7) for m in range(1, 13)]  # a complete year: fills 2025
    rows += [_census("CHL", 2026, m, 1.0e7) for m in range(1, 10)]  # nine months: never summed
    rows += [_census("PER", 2025, m, 2.0e6, hs6="260300", mineral="copper") for m in range(1, 13)]  # another reporter, mirror only
    annual = warehouse.annual_mirror_from_months(pd.DataFrame(rows))
    assert sorted(zip(annual["reporter"], annual["year"], annual["value_usd"], strict=True)) == [("CHL", 2024, 6.0e8), ("CHL", 2025, 1.2e8), ("PER", 2025, 2.4e7)]
    d = warehouse.trade_discrepancies(pd.DataFrame(rows)).set_index(["reporter", "year"])
    assert d.loc[("CHL", 2024), "mirror_usd"] == 1.1e8 and d.loc[("CHL", 2024), "flag"] == "consistent"
    assert d.loc[("CHL", 2025), "mirror_usd"] == 1.2e8 and d.loc[("CHL", 2025), "flag"] == "consistent"
    assert d.loc[("PER", 2025), "flag"] == "mirror_only" and ("CHL", 2026) not in d.index
    assert warehouse.annual_mirror_from_months(pd.DataFrame([_trade("CHL", "USA", "CHL", 2024, 1.0, "reported")])).empty


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
    trade = pd.DataFrame([_trade("CHL", "CHN", "CHL", 2022, 2.0e9, "reported"), _trade("CHL", "USA", "CHL", 2022, 5.0e8, "reported"), _trade("CHL", "WLD", "CHL", 2022, 4.0e9, "reported"), _trade("CHL", "CHN", "CHN", 2022, 2.1e9, "mirror"),
                          # 2021: a world total and a US row, no China partner row (absent, never 0): ROW cannot be derived
                          _trade("CHL", "USA", "CHL", 2021, 1.0e8, "reported"), _trade("CHL", "WLD", "CHL", 2021, 1.0e9, "reported")])
    (wh / "trade_flow").mkdir(parents=True)
    schema.validate("trade_flow", trade).to_parquet(wh / "trade_flow" / "un_comtrade.parquet", index=False)
    # the monthly US Census mirror: a complete 2023 (Comtrade has no US mirror for it) and nine months of 2024
    census = pd.DataFrame([_census("CHL", 2023, m, 1.0e6) for m in range(1, 13)] + [_census("CHL", 2024, m, 1.0e6) for m in range(1, 10)])
    schema.validate("trade_flow", census).to_parquet(wh / "trade_flow" / "us_census_trade.parquet", index=False)
    fin = pd.DataFrame([
        {"event_id": "e1", "country": "CHL", "date": "2018-12-03", "year": 2018, "actor_from": "Tianqi", "actor_from_origin": "CN", "actor_to": "SQM", "type": "equity", "amount_usd": 4.07e9, "currency": "USD", "sector": "Metals", "mineral": "lithium", "description": "stake", "value_type": "reported", **_prov("aiddata_gcdf", rel="independent_academic")},
        # a swap-line drawdown and a lower-confidence record: both reported apart from the documented commitments in flows.json
        {"event_id": "e2", "country": "CHL", "date": "2020-06-01", "year": 2020, "actor_from": "People's Bank of China", "actor_from_origin": "CN", "actor_to": "Banco Central", "type": "loan", "amount_usd": 1.0e9, "currency": "USD", "sector": None, "mineral": None, "description": "currency swap drawdown", "value_type": "reported", **_prov("aiddata_gcdf", rel="independent_academic")},
        {"event_id": "e3", "country": "CHL", "date": "2021-02-01", "year": 2021, "actor_from": "DFC", "actor_from_origin": "US", "actor_to": "Minera X", "type": "loan", "amount_usd": 2.0e8, "currency": "USD", "sector": None, "mineral": "copper", "description": "project finance", "value_type": "reported", **{**_prov("dfc_projects"), "confidence": "strongly_indicated"}},
    ])
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
    tb = {(b["year"], b["mineral"]): b for b in chl["actions"]["trade"]}
    assert tb[(2022, "lithium")]["exports_musd"] == {"CN": 2000.0, "US": 500.0, "ROW": 1500.0, "WLD": 4000.0} and tb[(2022, "lithium")]["mirror_musd"]["CN"] == 2100.0
    # the world total travels as its own cell; ROW is never derived over an absent partner row
    assert tb[(2021, "lithium")]["exports_musd"] == {"CN": None, "US": 100.0, "ROW": None, "WLD": 1000.0} and tb[(2021, "lithium")]["value_type"] == "reported"
    # a complete Census year fills the US mirror where Comtrade has none, named as its own source; a running year never appears
    assert tb[(2023, "lithium")]["mirror_musd"] == {"CN": None, "US": 12.0} and tb[(2023, "lithium")]["value_type"] == "mirror" and tb[(2023, "lithium")]["sources"]["mirror"]["id"] == "us_census_trade"
    assert (2024, "lithium") not in tb
    assert 2023 in json.loads((out / "meta.json").read_text())["coverage"]["CHL"]["mirror_years"]
    # the step-by-step exports exist even before any text run: no embedded document, no point
    words = json.loads((out / "words.json").read_text())
    assert words["n"] == 0 and words["docs"] == [] and words["layer"] == "model"
    assert "components" in json.loads((out / "components.json").read_text())
    ev = chl["actions"]["events"][0]
    assert ev["actor_side"] == "CN" and ev["amount_musd"] == 4070.0 and ev["source"]["sample"] is False and ev["source"]["reliability"] == "independent_academic"
    assert chl["governance"][0]["indicator"] == "CC.EST"
    assert not (out / "coverage.json").exists(), "coverage lives in meta.json only"
    meta = json.loads((out / "meta.json").read_text())
    cov = meta["coverage"]
    assert cov["CHL"]["trade_years"] == [2021, 2022] and cov["ARG"]["actions"] is False
    region = json.loads((out / "region.json").read_text())
    shares = {(r["year"], r["mineral"]): r for r in region["mineral_shares"]}
    assert shares[(2022, "lithium")] == {"year": 2022, "mineral": "lithium", "share_cn": 0.5, "share_us": 0.125, "share_other": 0.375, "exports_wld_musd": 4000.0, "n_reporters": 1, "n_absent_cn": 0, "n_absent_us": 0}
    assert shares[(2021, "lithium")]["share_cn"] == 0.0 and shares[(2021, "lithium")]["n_absent_cn"] == 1 and shares[(2021, "lithium")]["n_absent_us"] == 0, "the sum over reporters says how many lack the partner row"
    assert meta["layers"]["facts"] == "real" and meta["layers"]["model_outputs"] == "sample"
    flows = json.loads((out / "flows.json").read_text())
    assert flows["dataset"] == "REAL" and res["flows"] == {"finance_rows": 3, "trade_rows": 4}
    by = {(r["year"], r["origin"]): r for r in flows["finance"] if r["iso3"] == "CHL"}
    assert by[(2018, "CN")] == {"iso3": "CHL", "year": 2018, "origin": "CN", "amount_musd": 4070.0, "n_events": 1, "n_with_amount": 1, "n_undocumented": 0, "undocumented_musd": 0.0, "n_swap": 0, "swap_musd": 0.0, "source_ids": ["aiddata_gcdf"]}
    assert by[(2020, "CN")]["amount_musd"] == 0.0 and by[(2020, "CN")]["swap_musd"] == 1000.0 and by[(2020, "CN")]["n_swap"] == 1 and by[(2020, "CN")]["n_with_amount"] == 0
    assert by[(2021, "US")]["amount_musd"] == 0.0 and by[(2021, "US")]["undocumented_musd"] == 200.0 and by[(2021, "US")]["n_undocumented"] == 1
    tr = {(r["year"], r["mineral"]): r for r in flows["trade"] if r["iso3"] == "CHL"}
    assert tr[(2022, "all")]["exports_musd"] == {"US": 500.0, "CN": 2000.0, "ROW": 1500.0, "WLD": 4000.0} and tr[(2022, "lithium")]["exports_musd"]["CN"] == 2000.0 and tr[(2022, "all")]["source_id"] == "un_comtrade"
    assert tr[(2021, "all")]["exports_musd"] == {"US": 100.0, "CN": None, "ROW": None, "WLD": 1000.0}, "an absent partner row leaves ROW null; the world total is still reported"
    assert flows["meta"]["last_year"]["finance_CN"] == 2020 and flows["meta"]["last_year"]["trade"] == 2022
    # the Insights file: every country present, contrasts only where inputs exist, the parity gap from the fixture trade
    ins = json.loads((out / "insights.json").read_text())
    assert ins["dataset"] == "REAL" and [c["iso3"] for c in ins["countries"]] == list(export_site.IN_SCOPE)
    assert res["insights"]["human"] is True and ins["human"]["drafted_by"] == "ai" and ins["human"]["reviewed"] is False  # the repository's AI-drafted insights.md, labelled as such
    chl = next(c for c in ins["countries"] if c["iso3"] == "CHL")
    gap = next(x for x in chl["contrasts"] if x["id"] == "parity_gap")
    assert gap == {"id": "parity_gap", "kind": "parity_gap", "year": 2022, "musd": 750.0, "cn_musd": 2000.0, "us_musd": 500.0, "multiple_of_us": 1.5, "us_ahead": False, "top_mineral": "lithium",
                   "top_mineral_cn_musd": 2000.0, "reachable_with_top_mineral": True, "inputs": ["flow_trade:CHL:all:2022", "flow_trade:CHL:lithium:2022"], "caveat": gap["caveat"]}
    assert chl["finance"]["cn_2015_21"] == 4070.0 and [r for r in chl["trade_series"] if r["year"] == 2022] == [{"year": 2022, "share_cn": 0.5, "share_us": 0.125, "total_musd": 4000.0}]
    assert next(c for c in ins["countries"] if c["iso3"] == "ARG")["contrasts"] == [] and ins["region"]["scales"] == {} and ins["region"]["event_echoes"] == []
    assert [f["id"] for f in ins["findings"]] == ["parity", "cannot_see"] and meta["layers"]["insights"] == "real"


def _doc(country, doc_type, date, title, sid, url, prec="day", summary=None, outlet=None, native=None, minerals=None, cn=False, us=False):
    from scm.ingest.feeds import normalize_url

    return {"doc_id": f"{sid}-{native or url}"[:60], "country": country, "doc_type": doc_type, "date": date, "date_precision": prec, "year": int(date[:4]),
            "title_original": title, "language": "pt" if country == "BRA" else "es", "venue": "Câmara dos Deputados" if doc_type != "news" else (outlet or sid),
            "outlet_source_id": outlet, "author": None, "summary": summary, "status": None, "native_id": native, "url_norm": normalize_url(url),
            "keywords_matched": "litio", "minerals": minerals, "mentions_us": us, "mentions_cn": cn, "mining_related": True, "filter_version": "2026.10",
            "full_text_stored": False, "value_type": "reported", **_prov(sid, rel="official" if doc_type != "news" else "independent_academic"), "source_record_url": url}


def test_export_parliament_and_media_layers(tmp_path):
    wh = tmp_path / "wh"
    docs = pd.DataFrame([
        _doc("BRA", "bill", "2024-07-04", "PL 2780/2024: Política Nacional de Minerais Críticos", "bra_camara_api", "https://www.camara.leg.br/p?id=1", summary="Institui...", native="1", cn=True),
        _doc("BRA", "news", "2026-10-01", "China amplia compras de nióbio", "bra_folha", "https://www1.folha.uol.com.br/x.shtml?utm_source=rss", outlet="bra_folha", minerals="niobium", cn=True),
        _doc("BRA", "news", "2026-10-02", "China amplia compras de nióbio", "gdelt", "https://www1.folha.uol.com.br/x.shtml", prec="seen", outlet="bra_folha", minerals="niobium", cn=True),
    ])
    (wh / "document").mkdir(parents=True)
    schema.validate("document", docs.iloc[[0]].copy()).to_parquet(wh / "document" / "bra_camara_api.parquet", index=False)
    schema.validate("document", docs.iloc[[1]].copy()).to_parquet(wh / "document" / "bra_folha.parquet", index=False)
    schema.validate("document", docs.iloc[[2]].copy()).to_parquet(wh / "document" / "gdelt.parquet", index=False)
    votes = pd.DataFrame([{"vote_id": "v1", "doc_id": docs.iloc[0]["doc_id"], "country": "BRA", "chamber": "Câmara dos Deputados", "date": "2025-03-11", "year": 2025, "title_original": "Aprovado",
                           "result": "aprovado", "yes": 380, "no": 20, "abstain": None, "absent": None, "total": 405, "native_id": "100", "value_type": "reported", **_prov("bra_camara_api")}])
    (wh / "vote").mkdir()
    schema.validate("vote", votes).to_parquet(wh / "vote" / "bra_camara_api.parquet", index=False)
    members = pd.DataFrame([{"vote_id": "v1", "country": "BRA", "member_id": "1", "member_name": "A", "party": "PT", "region": "SP", "choice": "yes", "choice_original": "Sim", **_prov("bra_camara_api")},
                            {"vote_id": "v1", "country": "BRA", "member_id": "2", "member_name": "B", "party": "PL", "region": "RJ", "choice": "abstain", "choice_original": "Abstenção", **_prov("bra_camara_api")}])
    (wh / "vote_member").mkdir()
    schema.validate("vote_member", members).to_parquet(wh / "vote_member" / "bra_camara_api.parquet", index=False)
    runs = pd.DataFrame([{"run_id": "r", "source_id": "bra_camara_api", "started_at": "t", "finished_at": "t", "status": "ok", "rows": "{}", "error": None, "snapshot_dir": None}])
    (wh / "ingest_run").mkdir()
    schema.validate("ingest_run", runs).to_parquet(wh / "ingest_run" / "x.parquet", index=False)

    warehouse.build(wh)
    out = tmp_path / "site"
    export_site.run(wh, out)
    parl = json.loads((out / "parliament" / "BRA.json").read_text())
    d = parl["documents"][0]
    assert d["stance_us"] is None and d["title_en"] is None and d["classification"] == "not_yet_classified" and d["summary"] == "Institui..."
    assert d["vote"]["yes"] == 380 and d["vote"]["abstain"] == 1 and d["vote"]["members_recorded"] == 2 and d["vote"]["result"] == "aprovado"
    media = json.loads((out / "media" / "BRA.json").read_text())
    assert len(media["articles"]) == 1, "RSS and GDELT copies of the same URL must be merged"
    a = media["articles"][0]
    assert a["date"] == "2026-10-01" and a["via"] == "rss" and a["also_reported_by"] == ["gdelt"] and a["outlet"].startswith("Folha") and a["orientation"]
    assert a["tone"] is None and "summary" not in a and "text" not in a
    assert media["outlets"]["bra_folha"]["orientation"]
    assert media["freshness"]["headlines_window"] == [], "no Media Cloud run: no cut headline list"
    meta = json.loads((out / "meta.json").read_text())
    cov = meta["coverage"]
    assert cov["BRA"]["parliament_available"] and cov["BRA"]["parliament_votes"] == 1 and cov["BRA"]["media_available"] and cov["BRA"]["media_from"] == 2026
    assert cov["BOL"]["parliament_available"] is False and "Asamblea" in cov["BOL"]["parliament_note"] and cov["BRA"]["parliament_note"] is None
    assert cov["URY"]["parliament_available"] is False and "catalogue" in cov["URY"]["parliament_note"]
    assert cov["ECU"]["parliament_available"] is False and "adapter ran and returned no records" in cov["ECU"]["parliament_note"]
    assert meta["layers"]["parliament"] == "facts_only" and meta["layers"]["media"] == "facts_only" and meta["tables"]["document"] == 3
    assert not (out / "parliament" / "CHL.json").exists()


def test_stats_guard_catches_a_regressed_warehouse(tmp_path):
    wh = tmp_path / "wh"
    (wh / "trade_flow").mkdir(parents=True)
    (wh / "document").mkdir()
    schema.validate("trade_flow", pd.DataFrame([_trade("ARG", "CHN", "ARG", 2022, 100.0, "reported")] * 4)).to_parquet(wh / "trade_flow" / "a.parquet", index=False)
    schema.validate("document", pd.DataFrame([_doc("ARG", "bill", "2024-01-01", "Minería y litio", "arg_hcdn", "https://x.test/1")])).to_parquet(wh / "document" / "a.parquet", index=False)
    cur = warehouse.summary(wh)
    assert cur == {"trade_flow": 4, "document": 1, "_files": 2}
    assert warehouse.check_not_below(cur, cur) == []
    assert warehouse.check_not_below(cur, {"trade_flow": 5, "document": 1, "_files": 2}) == []  # within the 25% tolerance
    probs = warehouse.check_not_below(cur, {"trade_flow": 10, "document": 1, "production": 3, "ingest_run": 50, "_files": 3})
    assert len(probs) == 3 and any("production" in p for p in probs) and any("parquet files" in p for p in probs)
    assert warehouse.check_not_below({"_files": 0}, cur)  # an empty warehouse never replaces a full one


def test_export_with_model_outputs(tmp_path):
    wh = tmp_path / "wh"
    docs = pd.DataFrame([
        _doc("BRA", "bill", "2024-07-04", "PL 2780/2024: Política Nacional de Minerais Críticos", "bra_camara_api", "https://www.camara.leg.br/p?id=1", native="1", cn=True),
        _doc("BRA", "bill", "2023-02-01", "PL 1/2023: Acordo com os Estados Unidos", "bra_camara_api", "https://www.camara.leg.br/p?id=2", native="2", us=True),
        _doc("BRA", "news", "2026-10-01", "China amplia compras de nióbio", "bra_folha", "https://www1.folha.uol.com.br/x.shtml", outlet="bra_folha", minerals="niobium", cn=True),
    ])
    (wh / "document").mkdir(parents=True)
    schema.validate("document", docs.copy()).to_parquet(wh / "document" / "x.parquet", index=False)
    ids = list(docs["doc_id"])
    base = {"run_id": "zero_shot-1", "method": "zero_shot", "model": "nli-model", "codebook_version": "v1", "frame": "tone:sent-model", "created_at": "2026-10-04T00:00:00+00:00"}
    cls = pd.DataFrame([
        {"doc_id": ids[0], "stance_us": pd.NA, "stance_us_conf": None, "stance_cn": 1, "stance_cn_conf": 0.81, "tone": 0.2, "tone_conf": 0.6, **base},
        {"doc_id": ids[1], "stance_us": 2, "stance_us_conf": 0.9, "stance_cn": pd.NA, "stance_cn_conf": None, "tone": 0.5, "tone_conf": 0.7, **base},
        {"doc_id": ids[2], "stance_us": pd.NA, "stance_us_conf": None, "stance_cn": -1, "stance_cn_conf": 0.55, "tone": -0.3, "tone_conf": 0.5, **base},
    ])
    warehouse.upsert("doc_classification", "zero_shot", cls, wh)
    warehouse.upsert("doc_translation", "opus_mt", pd.DataFrame([{"doc_id": ids[0], "field": "title", "lang_from": "pt", "lang_to": "en", "text": "PL 2780/2024: National Critical Minerals Policy", "method": "mt", "model": "opus", "created_at": "t"}]), wh)
    warehouse.replace_slot("topic", "parliament", pd.DataFrame([{"run_id": "tp", "topic_id": 0, "label": "minerais · política", "keywords": "minerais,politica", "example_doc_ids": ids[0], "n_docs": 2}]), wh)
    warehouse.replace_slot("doc_topic", "parliament", pd.DataFrame([{"doc_id": ids[0], "run_id": "tp", "topic_id": 0, "prob": 0.9}, {"doc_id": ids[1], "run_id": "tp", "topic_id": 0, "prob": 0.8}]), wh)
    # the embeddings' vector column comes back from DuckDB as a numpy array per row: the export must turn it into a list
    warehouse.upsert("doc_embedding", "minilm", pd.DataFrame([{"doc_id": d, "model": "minilm", "dim": 3, "vector": v} for d, v in zip(ids, [[1.0, 0.0, 0.0], [0.9, 0.1, 0.0], [0.0, 0.0, 1.0]], strict=True)]), wh)
    (wh / "ingest_run").mkdir()
    schema.validate("ingest_run", pd.DataFrame([{"run_id": "r", "source_id": "bra_camara_api", "started_at": "t", "finished_at": "t", "status": "ok", "rows": "{}", "error": None, "snapshot_dir": None}])).to_parquet(wh / "ingest_run" / "x.parquet", index=False)

    warehouse.build(wh)
    out = tmp_path / "site"
    export_site.run(wh, out)
    parl = json.loads((out / "parliament" / "BRA.json").read_text())
    by_id = {d["id"]: d for d in parl["documents"]}
    d0, d1 = by_id[ids[0]], by_id[ids[1]]
    assert d0["classification"] == "coded" and d0["stance_cn"] == 1 and d0["stance_us"] is None and d0["classifier"]["method"] == "zero_shot" and d0["classifier"]["confidence"] == 0.81
    assert d0["title_en"].startswith("PL 2780/2024: National") and d0["translation"] == {"method": "mt", "model": "opus"} and d1["title_en"] is None and d1["translation"] is None
    assert parl["stance_series"] == [{"year": 2023, "stance_us_mean": 2.0, "stance_cn_mean": None, "n_docs": 1}, {"year": 2024, "stance_us_mean": None, "stance_cn_mean": 1.0, "n_docs": 1}]
    assert parl["text_model"]["validated"] is False and "not yet validated" in parl["text_model"]["label"] and parl["text_model"]["n_classified"] == 3
    media = json.loads((out / "media" / "BRA.json").read_text())
    a = media["articles"][0]
    assert a["tone"] == -0.3 and a["stance_cn"] == -1 and a["classification"] == "coded" and a["headline_en"] is None
    assert media["volume"] == [{"year": 2026, "basis": "kept_headlines", "articles_us": 0, "articles_cn": 1, "articles_us_mediacloud": 0, "articles_cn_mediacloud": 0, "total_articles": 1, "tone_us": None, "tone_cn": -0.3}]
    assert media["volume_basis"] == "kept_headlines"
    assert media["narratives"] == [] and "narratives" in media  # parliament topics never feed the press narratives chart
    meta = json.loads((out / "meta.json").read_text())
    assert meta["layers"]["parliament"] == "real" and meta["layers"]["media"] == "real" and meta["layers"]["model_outputs"] == "zero_shot_baseline"
    assert meta["coverage"]["BRA"]["parliament_classified"] == 2 and meta["coverage"]["BRA"]["parliament_translated"] == 1 and not meta["coverage"]["BRA"]["narratives_available"]
    val = json.loads((out / "validation.json").read_text())
    assert val["status"] == "not_yet_measured" and val["selected_method"] == "zero_shot" and val["text_model"]["method"] == "zero_shot"
    words = json.loads((out / "words.json").read_text())
    assert words["n"] == 3 and words["dim"] == 3 and words["model"] == "minilm"
    w0 = next(d for d in words["docs"] if d["id"] == ids[0])
    assert w0["nn"][0] == ids[1] and w0["e"].startswith("PL 2780/2024: National") and w0["sc"] == 1 and w0["k"] == 0
    assert words["featured"][0]["id"] == ids[0] and words["featured"][0]["vector"] == [1.0, 0.0, 0.0] and words["featured"][0]["near"][0]["id"] == ids[1]


def _volume(sid, country, period, total, mining, cn, us):
    return {"country": country, "period": period, "items_total": total, "items_mining": mining, "items_cn": cn, "items_us": us,
            **_prov(sid, rel="independent_academic"), "source_record_url": f"https://x.test/{sid}/{period}"}


def test_media_monthly_sums_windows_and_counts_a_feed_once_a_month():
    from scm.text.series import media_monthly

    mv = pd.DataFrame([
        _volume("gdelt", "BRA", "2024-03-01", 100, 10, 4, 2),  # first half-month window
        _volume("gdelt", "BRA", "2024-03-16", 50, 5, 1, 1),  # second half-month window
        _volume("bra_folha", "BRA", "2024-03-07", 30, 3, 1, 0),  # a feed fetch (the same rolling list of ~30 items ...)
        _volume("bra_folha", "BRA", "2024-03-14", 20, 2, 1, 1),  # ... fetched again a week later: never added up)
        _volume("mediacloud", "BRA", "2024-02-01", 900, 40, 12, 9),  # already monthly
        _volume("gdelt", "CHL", "2024-03-01", 7, 1, 1, 0),
    ])
    out = media_monthly(mv)
    # windows are summed; a feed counts once, at its fullest fetch, and says how many fetches the month had
    assert out["BRA"] == [
        {"period": "2024-02", "source_id": "mediacloud", "items_total": 900, "items_mining": 40, "items_cn": 12, "items_us": 9},
        {"period": "2024-03", "source_id": "bra_folha", "items_total": 30, "items_mining": 3, "items_cn": 1, "items_us": 0, "n_fetches": 2},
        {"period": "2024-03", "source_id": "gdelt", "items_total": 150, "items_mining": 15, "items_cn": 5, "items_us": 3},
    ]
    assert out["CHL"] == [{"period": "2024-03", "source_id": "gdelt", "items_total": 7, "items_mining": 1, "items_cn": 1, "items_us": 0}]
    assert media_monthly(None) == {} and media_monthly(pd.DataFrame()) == {}


def test_media_series_totals_leave_the_media_cloud_collection_out():
    from scm.text.series import media_series

    docs = pd.DataFrame([{"doc_id": "d1", "country": "BRA", "year": 2024, "doc_type": "news", "mentions_us": False, "mentions_cn": True},
                         {"doc_id": "d2", "country": "BRA", "year": 2012, "doc_type": "news", "mentions_us": True, "mentions_cn": False}])
    mv = pd.DataFrame([_volume("gdelt", "BRA", "2024-03-01", 100, 10, 4, 2), _volume("bra_folha", "BRA", "2024-03-07", 30, 3, 1, 0), _volume("bra_folha", "BRA", "2024-03-14", 20, 2, 1, 0),
                       _volume("mediacloud", "BRA", "2024-03-01", 60000, 40, 12, 9), _volume("mediacloud", "BRA", "2012-05-01", 50000, 30, 5, 8)])
    out, basis = media_series(docs, pd.DataFrame(), mv)
    assert basis == "feed_totals"
    by_year = {r["year"]: r for r in out["BRA"]}
    assert by_year[2024]["total_articles"] == 130 and by_year[2024]["basis"] == "feed_totals", "the feed (once a month) and GDELT totals, never the whole Media Cloud collection"
    assert by_year[2012]["total_articles"] == 1 and by_year[2012]["basis"] == "kept_headlines", "a year with Media Cloud counts only falls back to the kept headlines"
    # without a source_id column every kept headline is counted (the fixtures of the text tests have none)
    assert by_year[2024]["articles_cn"] == 1 and by_year[2024]["articles_cn_mediacloud"] == 0


def test_media_series_keeps_media_cloud_headlines_out_of_a_feed_denominator():
    from scm.text.series import media_series

    docs = pd.DataFrame([
        {"doc_id": "d1", "country": "BRA", "year": 2024, "doc_type": "news", "mentions_us": False, "mentions_cn": True, "source_id": "bra_folha"},
        {"doc_id": "d2", "country": "BRA", "year": 2024, "doc_type": "news", "mentions_us": True, "mentions_cn": True, "source_id": "mediacloud"},
        {"doc_id": "d3", "country": "BRA", "year": 2024, "doc_type": "news", "mentions_us": True, "mentions_cn": False, "source_id": "mediacloud"},
        {"doc_id": "d4", "country": "BRA", "year": 2012, "doc_type": "news", "mentions_us": True, "mentions_cn": False, "source_id": "mediacloud"},
    ])
    mv = pd.DataFrame([_volume("gdelt", "BRA", "2024-03-01", 100, 10, 4, 2), _volume("mediacloud", "BRA", "2024-03-01", 60000, 40, 12, 9), _volume("mediacloud", "BRA", "2012-05-01", 50000, 30, 5, 8)])
    out, _ = media_series(docs, pd.DataFrame(), mv)
    by_year = {r["year"]: r for r in out["BRA"]}
    # 2024 has a GDELT denominator: the numerator counts the feed/GDELT headlines only; the Media Cloud ones are reported apart, not dropped
    assert by_year[2024] == {"year": 2024, "basis": "feed_totals", "articles_us": 0, "articles_cn": 1, "articles_us_mediacloud": 2, "articles_cn_mediacloud": 1, "total_articles": 100, "tone_us": None, "tone_cn": None}
    # 2012 has no feed/GDELT total: the kept headlines are the denominator, so every headline counts
    assert by_year[2012] == {"year": 2012, "basis": "kept_headlines", "articles_us": 1, "articles_cn": 0, "articles_us_mediacloud": 1, "articles_cn_mediacloud": 0, "total_articles": 1, "tone_us": None, "tone_cn": None}


def test_article_cap_keeps_the_newest_per_source_evenly():
    def art(sid, date):
        return {"id": f"{sid}-{date}", "date": date, "source": {"id": sid}}

    gdelt = [art("gdelt", f"2025-0{m}-01") for m in range(1, 7)]  # six recent GDELT headlines
    mc = [art("mediacloud", f"201{y}-06-01") for y in range(0, 4)]  # four old Media Cloud headlines
    rss = [art("bra_folha", "2025-09-01")]
    kept = export_site._cap_per_source(gdelt + mc + rss, 6)
    assert [a["date"] for a in kept] == sorted((a["date"] for a in kept), reverse=True)
    ids = {a["source"]["id"] for a in kept}
    assert ids == {"gdelt", "mediacloud", "bra_folha"}, "the oldest source must survive the cap"
    # ranks fill in order: the newest of each source (3), then the second newest of the two that have one (2), then one more
    assert sum(1 for a in kept if a["source"]["id"] == "gdelt") == 3 and sum(1 for a in kept if a["source"]["id"] == "mediacloud") == 2
    assert kept[0]["source"]["id"] == "bra_folha" and all(a["date"] >= "2025-04-01" for a in kept if a["source"]["id"] == "gdelt")
    assert len(export_site._cap_per_source(gdelt, 100)) == 6 and export_site._cap_per_source([], 5) == []


def test_media_file_carries_history_without_coding(tmp_path):
    wh = tmp_path / "wh"
    docs = pd.DataFrame([_doc("BRA", "news", "2026-10-02", "China amplia compras de nióbio", "gdelt", "https://www1.folha.uol.com.br/x.shtml", prec="seen", outlet="bra_folha", minerals="niobium", cn=True)])
    (wh / "document").mkdir(parents=True)
    schema.validate("document", docs).to_parquet(wh / "document" / "gdelt.parquet", index=False)
    # the feed's own kept headlines: two in October (one seen at both of the month's fetches is one row), one dated September
    folha = pd.DataFrame([_doc("BRA", "news", "2026-10-05", "Lítio: acordo com os Estados Unidos", "bra_folha", "https://www1.folha.uol.com.br/a.shtml", outlet="bra_folha", minerals="lithium", us=True),
                          _doc("BRA", "news", "2026-10-09", "Mineração de nióbio e a China", "bra_folha", "https://www1.folha.uol.com.br/b.shtml", outlet="bra_folha", minerals="niobium", cn=True),
                          _doc("BRA", "news", "2026-09-28", "Cobre: exportações à China", "bra_folha", "https://www1.folha.uol.com.br/c.shtml", outlet="bra_folha", minerals="copper", cn=True)])
    schema.validate("document", folha).to_parquet(wh / "document" / "bra_folha.parquet", index=False)
    mv = pd.DataFrame([_volume("gdelt", "BRA", "2026-09-16", 40, 4, 1, 0), _volume("gdelt", "BRA", "2026-10-01", 60, 6, 2, 1),
                       _volume("bra_folha", "BRA", "2026-10-03", 25, 2, 1, 0), _volume("bra_folha", "BRA", "2026-10-10", 20, 3, 2, 1),  # two fetches of the feed in October
                       _volume("mediacloud", "BRA", "2012-05-01", 500, 30, 5, 8), _volume("mediacloud", "CHL", "2011-01-01", 300, 9, 2, 1)])
    (wh / "media_volume").mkdir()
    schema.validate("media_volume", mv).to_parquet(wh / "media_volume" / "x.parquet", index=False)
    (wh / "ingest_run").mkdir()
    # the Media Cloud run record carries the story-list windows: Brazil's 2026 list was cut at the cap, Chile's 2011 was not
    windows = {"BRA/2026": {"from": "2026-09-14", "to": "2026-10-10", "kept": 2000, "matched": 13809, "truncated": True},
               "CHL/2011": {"from": "2011-01-02", "to": "2011-12-30", "kept": 700, "matched": 700, "truncated": False}}
    older = {"BRA/2026": {"from": "2026-01-01", "to": "2026-01-09", "kept": 2000, "matched": 169451, "truncated": True}}  # an earlier run of the same year: superseded
    schema.validate("ingest_run", pd.DataFrame([
        {"run_id": "r", "source_id": "gdelt", "started_at": "t", "finished_at": "t", "status": "ok", "rows": "{}", "error": None, "snapshot_dir": None},
        {"run_id": "m1", "source_id": "mediacloud", "started_at": "2026-10-04", "finished_at": "2026-10-04", "status": "ok", "rows": json.dumps({"document": 30, "headlines_window": older}), "error": None, "snapshot_dir": None},
        {"run_id": "m2", "source_id": "mediacloud", "started_at": "2026-10-11", "finished_at": "2026-10-11", "status": "ok", "rows": json.dumps({"document": 33, "headlines_window": windows}), "error": None, "snapshot_dir": None},
    ])).to_parquet(wh / "ingest_run" / "x.parquet", index=False)

    warehouse.build(wh)
    out = tmp_path / "site"
    export_site.run(wh, out)
    media = json.loads((out / "media" / "BRA.json").read_text())
    assert "narratives" not in media and "text_model" not in media, "model outputs stay absent until something is coded"
    # the feed's month: its fullest fetch (25 items, with that fetch's own mineral / China / US counts), two fetches
    assert media["history"] == [
        {"period": "2012-05", "source_id": "mediacloud", "items_total": 500, "items_mining": 30, "items_cn": 5, "items_us": 8},
        {"period": "2026-09", "source_id": "gdelt", "items_total": 40, "items_mining": 4, "items_cn": 1, "items_us": 0},
        {"period": "2026-10", "source_id": "bra_folha", "items_total": 25, "items_mining": 2, "items_cn": 1, "items_us": 0, "n_fetches": 2},
        {"period": "2026-10", "source_id": "gdelt", "items_total": 60, "items_mining": 6, "items_cn": 2, "items_us": 1},
    ]
    assert media["media_sources"] == ["bra_folha", "gdelt", "mediacloud"] and media["history_from"] == "2012-05"
    assert media["volume"] == [{"year": 2026, "basis": "feed_totals", "articles_us": 1, "articles_cn": 3, "articles_us_mediacloud": 0, "articles_cn_mediacloud": 0, "total_articles": 125, "tone_us": None, "tone_cn": None}]
    assert media["volume_basis"] == "feed_totals"
    assert media["freshness"]["headlines_window"] == [{"source_id": "mediacloud", "year": 2026, "from": "2026-09-14", "to": "2026-10-10", "kept": 2000, "matched": 13809}], "the newest run's window of the cut year"
    # Media Cloud counts alone (no kept headline yet) still give the country a media file and a history
    chl = json.loads((out / "media" / "CHL.json").read_text())
    assert chl["articles"] == [] and chl["history"][0]["source_id"] == "mediacloud" and chl["volume"] == [] and chl["history_from"] == "2011-01"
    assert chl["freshness"]["headlines_window"] == [], "a list that was not cut has no window"
    cov = json.loads((out / "meta.json").read_text())["coverage"]
    assert cov["BRA"]["media_sources"] == ["bra_folha", "gdelt", "mediacloud"] and cov["BRA"]["media_history_from"] == "2012-05"
    assert cov["CHL"]["media_available"] and cov["CHL"]["media_articles"] == 0 and cov["CHL"]["media_from"] is None
    assert cov["ARG"]["media_available"] is False and cov["ARG"]["media_sources"] == [] and cov["ARG"]["media_history_from"] is None


def test_export_cells_never_derive_row_over_an_absent_partner():
    assert export_site.export_cells(5.0e8, 2.0e9, 4.0e9) == {"US": 500.0, "CN": 2000.0, "ROW": 1500.0, "WLD": 4000.0}
    assert export_site.export_cells(5.0e8, None, 4.0e9) == {"US": 500.0, "CN": None, "ROW": None, "WLD": 4000.0}
    assert export_site.export_cells(None, None, 4.0e9) == {"US": None, "CN": None, "ROW": None, "WLD": 4000.0}
    assert export_site.export_cells(5.0e8, 2.0e9, None) == {"US": 500.0, "CN": 2000.0, "ROW": None, "WLD": None}
    # six decimals: a US$367 flow is 0.000367 m, never a reported 0.0
    assert export_site.export_cells(367.0, 0.0, 191000.0) == {"US": 0.000367, "CN": 0.0, "ROW": 0.190633, "WLD": 0.191}
    rows = export_site.build_flows([], [_trade("PRY", "WLD", "PRY", 2025, 65_400.0, "reported"), _trade("PRY", "USA", "PRY", 2025, 420.0, "reported")], ["lithium"], {}, "2026-10-11")["trade"]
    assert {(r["year"], r["mineral"]): r["exports_musd"] for r in rows} == {(2025, "all"): {"US": 0.00042, "CN": None, "ROW": None, "WLD": 0.0654}, (2025, "lithium"): {"US": 0.00042, "CN": None, "ROW": None, "WLD": 0.0654}}


def test_region_mineral_shares_count_the_reporters_without_a_partner_row():
    trade = [_trade("CHL", "WLD", "CHL", 2000, 8.0e8, "reported"), _trade("CHL", "CHN", "CHL", 2000, 1.0e8, "reported"), _trade("CHL", "USA", "CHL", 2000, 2.0e8, "reported"),
             _trade("ARG", "WLD", "ARG", 2000, 2.0e8, "reported"), _trade("ARG", "USA", "ARG", 2000, 5.0e7, "reported"),  # no China row
             _trade("BOL", "WLD", "BOL", 2000, 1.0e8, "reported"),  # neither partner
             _trade("CHL", "CHN", "CHN", 2000, 1.2e8, "mirror")]  # mirrors never enter the reporters' sum
    rows = export_site.region_mineral_shares(trade, ["lithium"])
    assert rows == [{"year": 2000, "mineral": "lithium", "share_cn": round(1.0e8 / 1.1e9, 4), "share_us": round(2.5e8 / 1.1e9, 4), "share_other": round(1 - 1.0e8 / 1.1e9 - 2.5e8 / 1.1e9, 4),
                     "exports_wld_musd": 1100.0, "n_reporters": 3, "n_absent_cn": 2, "n_absent_us": 1}]
    assert export_site.region_mineral_shares(trade, ["copper"]) == []


def _idx(country, year, actor, name, value, mineral="all", comps="trade_export_share,trade_import_share,finance_flow,diplomatic_alignment", n=4, lower=None, upper=None):
    return {"country": country, "year": year, "actor": actor, "mineral": mineral, "index_name": name, "value": value, "lower": lower, "upper": upper, "n_components": n, "components_available": comps}


def _comp(country, year, actor, name, norm, available=True):
    return {"country": country, "year": year, "actor": actor, "mineral": "all", "component": name, "normalized_value": norm, "available": available}


def test_index_rows_name_the_index_and_the_component_carrying_the_lean():
    idx = [_idx("CHL", 2000, "CN", "influence", 24.77, lower=16.22, upper=56.98), _idx("CHL", 2000, "US", "influence", 11.91, lower=9.12, upper=53.38),
           _idx("CHL", 2000, "CN", "economic_ties", 3.04, comps="trade_export_share,trade_import_share,finance_flow", n=3), _idx("CHL", 2000, "US", "economic_ties", 4.66, comps="trade_export_share,trade_import_share,finance_flow", n=3),
           _idx("CHL", 2000, "CN", "political_alignment", 89.95, comps="diplomatic_alignment", n=1), _idx("CHL", 2000, "US", "political_alignment", 33.66, comps="diplomatic_alignment", n=1),
           _idx("CHL", 2000, "CN", "influence", 30.0, mineral="copper"), _idx("CHL", 2000, "CN", "economic_ties", 5.0, mineral="copper", n=3),  # a per-mineral sub-index stays in the country file
           _idx("CHL", 2001, "CN", "influence", None, n=2), _idx("ARG", 2000, "CN", "influence", 21.75)]  # a cell without a value has no row
    comps = [_comp("CHL", 2000, "CN", "trade_export_share", 8.21), _comp("CHL", 2000, "US", "trade_export_share", 0.91),
             _comp("CHL", 2000, "CN", "trade_import_share", 8.96), _comp("CHL", 2000, "US", "trade_import_share", 5.01),
             _comp("CHL", 2000, "CN", "finance_flow", 0.0), _comp("CHL", 2000, "US", "finance_flow", 0.0),
             _comp("CHL", 2000, "CN", "debt_stock", 40.0), _comp("CHL", 2000, "US", "debt_stock", None, available=False),  # one actor only: never the lead
             _comp("CHL", 2000, "CN", "diplomatic_alignment", 89.95), _comp("CHL", 2000, "US", "diplomatic_alignment", 33.66),
             _comp("ARG", 2000, "CN", "diplomatic_alignment", 86.43)]  # no shared component: lead null
    rows = export_site._index_rows(idx, comps)
    by = {(r["iso3"], r["year"], r["actor"], r["index"], r["mineral"]): r for r in rows}
    assert len(rows) == 8 and {r["index"] for r in rows} == {"composite", "economic_ties", "political_alignment"}
    cn = by[("CHL", 2000, "CN", "composite", "all")]
    assert cn == {"iso3": "CHL", "year": 2000, "actor": "CN", "mineral": "all", "value": 24.77, "lower": 16.22, "upper": 56.98, "n_components": 4, "index": "composite",
                  "components_available": ["trade_export_share", "trade_import_share", "finance_flow", "diplomatic_alignment"],
                  "lead": "diplomatic_alignment", "lead_gap": 56.29, "lead_cn": 89.95, "lead_us": 33.66}
    us = by[("CHL", 2000, "US", "composite", "all")]
    assert (us["lead"], us["lead_gap"], us["lead_cn"], us["lead_us"]) == ("diplomatic_alignment", 56.29, 89.95, 33.66), "the same lead on both actors' rows"
    pol = by[("CHL", 2000, "CN", "political_alignment", "all")]
    assert pol["value"] == 89.95 and pol["lower"] is None and pol["n_components"] == 1 and pol["components_available"] == ["diplomatic_alignment"] and "lead" not in pol
    assert by[("CHL", 2000, "CN", "economic_ties", "all")]["components_available"] == ["trade_export_share", "trade_import_share", "finance_flow"]
    assert "lead" not in by[("CHL", 2000, "CN", "composite", "copper")] and ("CHL", 2000, "CN", "economic_ties", "copper") not in by
    arg = by[("ARG", 2000, "CN", "composite", "all")]
    assert arg["lead"] is None and arg["lead_gap"] is None and arg["lead_cn"] is None and arg["lead_us"] is None
    assert ("CHL", 2001, "CN", "composite", "all") not in by


def test_forecast_block_carries_the_skip_reason_of_a_target():
    fc = [{"country": "ARG", "target": "influence_index", "actor": "CN", "horizon_year": 2030, "last_observed_year": 2024, "model": "naive", "scenario_id": "baseline", "point": 50.0, "p05": 40.0, "p25": 45.0, "p75": 55.0, "p95": 60.0}]
    reason = "4 reported years in the latest unbroken run (2022–2025), fewer than 8; 7 years with no partner row left out (absent, not zero)"
    status = {"forecast": {"targets": {"influence_index:CN": {"countries": ["ARG", "CHL"], "model": "naive"},
                                       "export_share:CN": {"countries": ["CHL"], "model": "pooled_drift", "skipped": {"ARG": reason}},
                                       "export_share:US": {"countries": ["CHL"], "model": "naive", "skipped": {}}}}}
    block = export_site._forecast_block("ARG", fc, status)
    assert set(block["model_status"]) == {"influence_index:CN", "export_share:CN"}
    assert block["model_status"]["export_share:CN"] == {"countries": [], "model": None, "skipped": reason}
    assert block["model_status"]["influence_index:CN"]["model"] == "naive" and "skipped" not in block["model_status"]["influence_index:CN"]
    assert export_site._forecast_block("VEN", fc, status) is None, "no forecast rows: no block (the layer stays absent, not an empty one)"


def test_brief_data_release_reads_the_front_matter(tmp_path):
    (tmp_path / "CHL.md").write_text("---\ntitle: Chile\ndrafted_by: ai\ndata_release: data-v2026.10.11.61\n---\n\nText.\n", encoding="utf-8")
    (tmp_path / "ARG.md").write_text("---\ntitle: Argentina\n---\n\nText.\n", encoding="utf-8")
    (tmp_path / "regional.md").write_text("No front matter.\n", encoding="utf-8")
    assert export_site.brief_data_release("country", "CHL", tmp_path) == "data-v2026.10.11.61"
    assert export_site.brief_data_release("country", "ARG", tmp_path) is None and export_site.brief_data_release("regional", None, tmp_path) is None
    assert export_site.brief_data_release("country", "BOL", tmp_path) is None
    rows = [{"scope": "country", "country": "CHL", "section": "human", "position": 99, "title": "Chile", "text_md": "Text.", "sentences_json": "[]", "supporting_indicator_ids": "",
             "template_version": "1", "model": "human", "author": "x", "reviewed_by_human": False, "changed_since_previous": False, "previous_date": None, "generated_on": "2026-10-09", "drafted_by": "ai"}]
    human = export_site._interpretation_block([{**rows[0], "data_release": "data-v2026.10.12.1"}], "country", "CHL")["human"]
    assert human["data_release"] == "data-v2026.10.12.1" and human["drafted_by"] == "ai", "the table's column wins when it exists"


def test_headline_windows_keep_the_newest_cut_per_country_year():
    runs = [{"rows": json.dumps({"document": 1, "headlines_window": {"ARG/2026": {"from": "2026-09-14", "to": "2026-10-11", "kept": 2000, "matched": 13809, "truncated": True},
                                                                       "BOL/2026": {"from": "2026-01-19", "to": "2026-08-08", "kept": 70, "matched": 70, "truncated": False}}})},
            {"rows": json.dumps({"document": 1, "headlines_window": {"ARG/2026": {"from": "2026-01-01", "to": "2026-01-09", "kept": 2000, "matched": 169451, "truncated": True},
                                                                       "ARG/2025": {"from": "2025-11-20", "to": "2025-12-31", "kept": 2000, "matched": 150000, "truncated": True}}})},
            {"rows": "{}"}, {"rows": None}, {"rows": "not json"}]
    assert export_site.headline_windows(runs) == {"ARG": [{"source_id": "mediacloud", "year": 2025, "from": "2025-11-20", "to": "2025-12-31", "kept": 2000, "matched": 150000},
                                                          {"source_id": "mediacloud", "year": 2026, "from": "2026-09-14", "to": "2026-10-11", "kept": 2000, "matched": 13809}]}
    assert export_site.headline_windows([]) == {}
