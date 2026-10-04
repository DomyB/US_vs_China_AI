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
    cov = json.loads((out / "coverage.json").read_text())["countries"]
    assert cov["BRA"]["parliament_available"] and cov["BRA"]["parliament_votes"] == 1 and cov["BRA"]["media_available"] and cov["BRA"]["media_from"] == 2026
    assert cov["BOL"]["parliament_available"] is False and "Asamblea" in cov["BOL"]["parliament_note"] and cov["BRA"]["parliament_note"] is None
    assert cov["URY"]["parliament_available"] is False and "catalogue" in cov["URY"]["parliament_note"]
    meta = json.loads((out / "meta.json").read_text())
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
