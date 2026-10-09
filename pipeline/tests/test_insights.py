"""The Insights page's builder: contrasts, echoes, scales, findings and the labelled written text (pure functions on small row lists)."""
from __future__ import annotations

import numpy as np

from scm import insights
from scm.quant.briefs import load_human
from scm.quant.index import NAMES

CORE = ["copper", "lithium", "gold", "iron_ore"]


def _stm(i, year, country="ARG", bloc="LatAm executive", speaker_country="ARG", cn="not_mentioned", us="not_mentioned", minerals="lithium"):
    score = {"positive": 1.0, "neutral": 0.0, "mixed": 0.0, "negative": -1.0}
    return {"statement_id": f"PS-{i}", "year": year, "country": country, "speaker_bloc": bloc, "speaker_country": speaker_country, "stance_cn": cn, "stance_us": us,
            "stance_cn_score": score.get(cn), "stance_us_score": score.get(us), "minerals": minerals}


def _trade(iso, year, mineral, us, cn, row):
    return {"iso3": iso, "year": year, "mineral": mineral, "exports_musd": {"US": us, "CN": cn, "ROW": row}, "source_id": "un_comtrade"}


def _fin(iso, year, origin, musd, n=1):
    return {"iso3": iso, "year": year, "origin": origin, "amount_musd": musd, "n_events": n, "n_with_amount": n, "n_undocumented": 0, "undocumented_musd": 0.0, "n_swap": 0, "swap_musd": 0.0, "source_ids": ["x"]}


def test_pooled_stance_uses_latest_years_and_minimum_n():
    rows = [_stm(1, 2019, cn="positive"), _stm(2, 2024, cn="negative"), _stm(3, 2025, cn="neutral"), _stm(4, 2026, cn="positive"), _stm(5, 2026, us="positive")]
    p = insights.pooled_stance(rows, "CN")
    assert p == {"mean": 0.0, "n": 3, "years": [2024, 2026], "n_statements": 4}  # 2019 falls outside the three latest statement years
    assert insights.pooled_stance(rows, "US") is None  # one position only
    series = insights.statement_series(rows)
    assert series[0] == {"year": 2019, "n": 1, "stance_cn": 1.0, "n_cn": 1, "stance_us": None, "n_us": 0}


def test_mineral_mentions_map_to_core_ids():
    rows = [_stm(1, 2025, minerals="lithium,critical_minerals_general"), _stm(2, 2025, minerals="antimony,tantalum,copper"), _stm(3, 2025, minerals="mining_general")]
    assert insights.mineral_mentions(rows, CORE + ["gallium_germanium_antimony"]) == {"lithium": 1, "general": 2, "gallium_germanium_antimony": 1, "other": 1, "copper": 1}


def test_trade_latest_and_parity_arithmetic():
    trade = [_trade("ARG", 2024, "all", 10.0, 90.0, 100.0), _trade("ARG", 2025, "all", 50.0, 450.0, 500.0), _trade("ARG", 2025, "lithium", 1.0, 400.0, 1.0), _trade("ARG", 2025, "gold", 49.0, 50.0, 499.0),
             _trade("ARG", 2026, "all", 1.0, 1.0, None)]  # no world total: not a usable year
    t = insights.trade_latest(trade, "ARG")
    assert t["year"] == 2025 and t["share_cn"] == 0.45 and t["share_us"] == 0.05 and t["minerals"][0]["mineral"] == "gold"
    assert [r["year"] for r in insights.trade_series(trade, "ARG")] == [2024, 2025]
    c = _country(trade=trade)
    gap = next(x for x in c["contrasts"] if x["id"] == "parity_gap")
    assert gap["musd"] == 200.0 and gap["multiple_of_us"] == 4.0 and gap["top_mineral"] == "lithium" and gap["reachable_with_top_mineral"] is True


def _country(trade=None, stm=None, fc=None, flags=None, stance=None, media=None):
    trade = trade if trade is not None else [_trade("ARG", 2025, "all", 50.0, 450.0, 500.0), _trade("ARG", 2025, "lithium", 1.0, 400.0, 1.0)]
    stm = stm if stm is not None else []
    return insights.build_country("ARG", stm=stm, trade_rows=trade, flow_finance=[_fin("ARG", 2016, "CN", 1000.0), _fin("ARG", 2023, "US", 10.0)], comp_rows=[], idx_rows=[], fc_rows=fc or [],
                                  stance_by_iso=stance or {}, volume_by_iso=media or {}, gov=[{"country": "ARG", "year": 2024, "indicator": "NY.GDP.MKTP.CD", "value": 6.0e11}],
                                  sd_rows=[], flag_rows=flags or [], known_minerals=CORE, prices={})


def test_words_vs_trade_quadrants_hedging_and_mineral_mismatch():
    stm = [_stm(i, 2024 + i % 3, cn="positive" if i % 2 else "neutral", us="positive", minerals="lithium,copper" if i < 6 else "gold") for i in range(10)]
    stm += [_stm(20, 2025, bloc="United States", speaker_country="USA", cn="negative", us="positive")]
    c = _country(stm=stm)
    byid = {x["id"]: x for x in c["contrasts"]}
    assert byid["words_vs_trade_us"]["label"] == "warm words, small trade" and byid["words_vs_trade_us"]["n"] == 10 and byid["words_vs_trade_us"]["share"] == 0.05
    assert byid["words_vs_trade_cn"]["label"] == "warm words, large trade" and byid["words_vs_trade_cn"]["stance"] == 0.5
    h = byid["hedging"]
    assert h["pos_cn"] == 5 and h["pos_us"] == 10 and h["balance"] == round(1 - 5 / 15, 3)
    m = byid["talk_vs_trade_minerals"]
    assert m["n_mentions"] == 16 and m["mismatch"] > 0 and {r["mineral"] for r in m["rows"]} == {"lithium", "copper", "gold", "other"}  # 'other': the 98 of 500 not reported by mineral
    u = byid["us_words_vs_us_money"]
    assert u["n_us_statements"] == 1 and u["n_cn_negative"] == 1 and u["us_2022_24_musd"] == 10.0 and u["cn_2015_21_musd"] == 1000.0
    assert c["words"]["executive_counts"]["us"]["positive"] == 10 and c["gdp_latest"]["usd"] == 6.0e11


def test_component_scales_reproduce_the_published_normalisation():
    rng = np.random.default_rng(1)
    raw = rng.normal(size=60)
    lo, hi = np.percentile(raw, 2.5), np.percentile(raw, 97.5)
    rows = [{"component": "trade_export_share", "available": True, "raw_value": float(v), "normalized_value": float((np.clip(v, lo, hi) - lo) / (hi - lo) * 100)} for v in raw]
    rows.append({"component": "trade_export_share", "available": False, "raw_value": None, "normalized_value": None})
    s = insights.component_scales(rows)
    assert set(s) == {"trade_export_share"} and s["trade_export_share"]["n"] == 60
    for r in rows[:60]:
        got = (min(max(r["raw_value"], s["trade_export_share"]["lo"]), s["trade_export_share"]["hi"]) - s["trade_export_share"]["lo"]) / (s["trade_export_share"]["hi"] - s["trade_export_share"]["lo"]) * 100
        assert abs(got - r["normalized_value"]) < 0.01
    assert all(n not in s for n in NAMES if n != "trade_export_share")


def test_event_echoes_group_by_family_and_actor():
    rows = [{"design": "window", "event_id": "e1", "event_actor": "CN", "event_type": "export_control", "event_title": "t", "event_year": 2023, "event_status": "draft", "country": "CHL", "actor": "CN", "diff": 0.02, "placebo_p": 0.3},
            {"design": "window", "event_id": "e2", "event_actor": "CN", "event_type": "export_control", "event_title": "t", "event_year": 2024, "event_status": "draft", "country": "PER", "actor": "CN", "diff": 0.06, "placebo_p": 0.1},
            {"design": "window", "event_id": "e1", "event_actor": "CN", "event_type": "export_control", "event_title": "t", "event_year": 2023, "event_status": "draft", "country": "CHL", "actor": "US", "diff": -0.01, "placebo_p": None},
            {"design": "window", "event_id": "e3", "event_actor": "US", "event_type": "tariff", "event_title": "t", "event_year": 2018, "event_status": "draft", "country": "CHL", "actor": "CN", "diff": None, "placebo_p": None},
            {"design": "did", "event_id": "e3", "event_actor": "US", "event_type": "tariff", "event_title": "t", "event_year": 2018, "event_status": "draft", "country": "treated", "actor": "CN", "diff": 0.5, "placebo_p": 0.2}]
    e = insights.event_echoes(rows)
    assert [(x["family"], x["actor"], x["n"]) for x in e] == [("CN:export_control", "CN", 2), ("CN:export_control", "US", 1)]
    assert e[0]["mean"] == 0.04 and e[0]["events"] == ["e1", "e2"] and e[0]["all_draft"] and e[0]["label"] == "Chinese export control measures"


def test_prices_prefer_the_monthly_series_and_average_by_year():
    prices = [{"mineral": "copper", "source_id": "wb_pink_sheet", "series": "Copper", "year": 2025, "month": m, "price": 9000.0 + m, "unit": "($/mt)"} for m in (1, 2)]
    prices += [{"mineral": "copper", "source_id": "usgs_mcs", "series": "USGS copper", "year": 2025, "month": None, "price": 4.5, "unit": "cents per pound"},
               {"mineral": "lithium", "source_id": "usgs_mcs", "series": "USGS lithium", "year": 2024, "month": None, "price": 14000.0, "unit": "dollars per metric ton"},
               {"mineral": "lithium", "source_id": "usgs_mcs", "series": "USGS lithium", "year": 2007, "month": None, "price": 1.0, "unit": "dollars per metric ton"}]
    p = insights.price_block(prices, CORE)
    assert p["copper"]["source_id"] == "wb_pink_sheet" and p["copper"]["latest"] == {"year": 2025, "avg": 9001.5, "n_obs": 2}
    assert p["lithium"]["annual"] == [{"year": 2024, "avg": 14000.0, "n_obs": 1}] and "gold" not in p


def test_findings_fire_only_with_inputs_and_carry_ids_and_strength(tmp_path):
    stm = [_stm(i, 2025, cn="positive" if i % 2 else "negative", us="positive") for i in range(12)]
    stm += [_stm(100 + i, 2025, bloc="United States", speaker_country="USA", cn="negative", us="positive", country="REG") for i in range(4)]
    stm += [_stm(200, 2025, bloc="China", speaker_country="CHN", cn="positive", country="REG")]
    flows = {"finance": [_fin("ARG", 2016, "CN", 1000.0), _fin("ARG", 2020, "US", 100.0), _fin("ARG", 2023, "US", 10.0)],
             "trade": [_trade("ARG", 2025, "all", 50.0, 450.0, 500.0), _trade("ARG", 2025, "lithium", 1.0, 400.0, 1.0), _trade("CHL", 2025, "all", 600.0, 300.0, 100.0)]}
    fin = [{"actor_from_origin": "CN", "country": "ARG", "year": 2016, "confidence": "documented", "amount_usd": 1.0e9, "description": "mine loan", "type": "loan", "mineral": "lithium"}]
    (tmp_path / "insights.md").write_text("---\ntitle: My reading\nauthor: AI-drafted; not yet reviewed\ndate: 2026-10-09\nreviewed: false\ndrafted_by: ai\n---\n\n## Contrasts\n\nA claim [who_talks_who_pays].\n", encoding="utf-8")
    out = insights.build_insights(flows=flows, idx_rows=[], comp_rows=[], fc_rows=[], effect_rows=[], reg_rows=[], sd_rows=[], flag_rows=[], stm=stm, stance_by_iso={}, volume_by_iso={}, gov=[],
                                  prices=[], policy=[{"jurisdiction": "US", "year": y, "source_id": "congress_gov"} for y in (2015, 2015, 2020, 2025, 2025, 2025)], fin=fin, core=CORE,
                                  quant_status={"last_year": {"trade": 2025}}, today="2026-10-09", human_dir=tmp_path)
    assert len(out["countries"]) == 12 and out["meta"]["countries_with_statements"] == ["ARG"] and out["meta"]["n_statements"] == 17
    ids = [f["id"] for f in out["findings"]]
    assert ids[0] == "who_talks_who_pays" and "words_vs_trade_ARG" in ids and "parity" in ids and "attention" in ids and ids[-1] == "cannot_see"
    assert "fork_2030" not in ids and "panel" not in ids and "shocks" not in ids  # no forecasts, regressions or events in the inputs
    assert "hedging" in ids  # ARG's executives praise both: 6 positive toward China, 12 toward the United States
    f1 = out["findings"][0]
    assert f1["strength"]["level"] == "moderate" and all(s["ids"] for s in f1["sentences"]) and "4.0 US statements for every Chinese one" in f1["sentences"][2]["text"]
    tm = out["region"]["talk_vs_money"]
    assert tm["finance"]["CN"]["musd"] == 1000.0 and tm["finance"]["CN"]["mineral_tagged_musd"] == 1000.0 and tm["finance"]["US"]["musd"] == 100.0 and tm["finance"]["US_after"]["musd"] == 10.0
    assert tm["ratios"] == {"statements_us_over_cn": 4.0, "money_cn_over_us_2015_21": 10.0}
    parity = next(f for f in out["findings"] if f["id"] == "parity")
    assert parity["countries"] == ["ARG"] and parity["strength"]["level"] == "strong"  # Chile is not in the list: the United States already buys more there
    att = {a["year"]: a for a in out["region"]["attention"]}
    assert att[2015]["policy_docs"] == 2 and att[2025]["policy_docs"] == 3 and att[2025]["us_statements"] == 4
    assert out["human"]["drafted_by"] == "ai" and out["human"]["reviewed"] is False and out["human"]["title"] == "My reading"
    assert out["region"]["index_rules"]["min_components"] == 3 and out["region"]["scales"] == {}


def test_load_human_defaults_drafted_by_to_owner(tmp_path):
    p = tmp_path / "CHL.md"
    p.write_text("---\ntitle: T\nreviewed: true\n---\n\nText.\n", encoding="utf-8")
    assert load_human(p)["drafted_by"] == "owner"
