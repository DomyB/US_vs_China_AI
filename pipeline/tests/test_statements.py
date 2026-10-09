from __future__ import annotations

import json

import pandas as pd
import pytest

from scm import schema
from scm.ingest.statements import normalise


def _row(**kw):
    base = {"id": "PS-0001", "date": "2019-03", "year": "2019", "country": "PER", "speaker_name": "Paola Bustamante", "speaker_role": "Minister", "speaker_type": "minister_cabinet",
            "speaker_bloc": "LatAm executive", "speaker_country": "PER", "party_or_affiliation": "", "channel": "press_conference", "event_context": "Las Bambas blockade",
            "minerals": "copper;lithium", "hs6_links": "260300;740200", "themes": "labor_social_conflict", "counterparts_mentioned": "CHN", "stance_china": "neutral", "stance_us": "not_mentioned",
            "related_entities": "Las Bambas; MMG", "summary_en": "After protests...", "quote_original": "Fuimos con disposición al diálogo", "quote_en": "We went with a disposition for dialogue",
            "language": "es", "source_name": "Reuters via The Borneo Post", "source_url": "https://example.test/a", "source_type": "news_media", "verification": "secondary_reported", "notes": "", "research_batch": "PER"}
    return {**base, **kw}


def test_normalise_maps_dates_lists_stance_and_reliability():
    df = pd.DataFrame([
        _row(),
        _row(id="PS-0002", date="2024-07-04", stance_china="negative", stance_us="positive", source_type="primary_official", verification="primary_verified", source_name="Ministry of Foreign Affairs of the PRC"),
        _row(id="PS-0003", date="2025-01-10", source_name="Xinhua", country="REG", speaker_bloc="China", speaker_country="CHN", stance_china="positive", verification="unverified"),
    ])
    out = normalise(df)
    a, b, c = out.to_dict("records")
    assert a["date"] == "2019-03-01" and a["date_precision"] == "month" and a["year"] == 2019
    assert a["minerals"] == "copper,lithium" and a["hs6_links"] == "260300,740200" and a["counterparts"] == "CHN"
    assert a["stance_cn"] == "neutral" and a["stance_cn_score"] == 0.0 and a["stance_us"] == "not_mentioned" and pd.isna(a["stance_us_score"])
    assert a["reliability"] == "independent_academic" and a["confidence"] == "strongly_indicated"
    assert b["date_precision"] == "day" and b["stance_cn_score"] == -1.0 and b["stance_us_score"] == 1.0 and b["reliability"] == "official" and b["confidence"] == "documented"
    assert c["reliability"] == "state_media" and c["confidence"] == "speculative" and c["country"] == "REG"
    # validates against the warehouse schema once provenance is added
    prov = {"source_id": "manual_statements", "source_url": "https://x.test", "retrieved_at": "2026-10-09T00:00:00+00:00"}
    for k, v in prov.items():
        out[k] = v
    schema.validate("statement", out)


def test_normalise_rejects_malformed_dates():
    with pytest.raises(ValueError):
        normalise(pd.DataFrame([_row(date="March 2019")]))


def test_export_statements_block(tmp_path):
    from scm import export_site, warehouse

    wh = tmp_path / "wh"
    out = normalise(pd.DataFrame([
        _row(),
        _row(id="PS-0002", date="2024-07-04", stance_china="negative", stance_us="positive", speaker_bloc="LatAm legislature", speaker_type="legislator"),
        _row(id="PS-0003", date="2024-09-01", country="PER", speaker_bloc="United States", speaker_country="USA", stance_china="negative", stance_us="positive"),
        _row(id="PS-0004", date="2025-01-10", country="REG", speaker_bloc="China", speaker_country="CHN", stance_china="positive"),
        _row(id="PS-0005", date="2025-02-10", country="MEX", speaker_country="MEX"),
    ]))
    for k, v in {"source_id": "manual_statements", "source_url": "https://x.test", "retrieved_at": "2026-10-09T00:00:00+00:00"}.items():
        out[k] = v
    (wh / "statement").mkdir(parents=True)
    schema.validate("statement", out).to_parquet(wh / "statement" / "manual_statements.parquet", index=False)
    (wh / "ingest_run").mkdir()
    runs = pd.DataFrame([{"run_id": "r", "source_id": "manual_statements", "started_at": "t", "finished_at": "t", "status": "ok", "rows": "{}", "error": None, "snapshot_dir": None}])
    schema.validate("ingest_run", runs).to_parquet(wh / "ingest_run" / "x.parquet", index=False)
    warehouse.build(wh)
    site = tmp_path / "site"
    export_site.run(wh, site)
    per = json.loads((site / "country" / "PER.json").read_text())
    blk = per["statements"]
    assert blk["n"] == 3 and blk["n_domestic"] == 2 and blk["records"][0]["id"] == "PS-0003"  # newest first
    assert blk["records"][-1]["speaker"]["bloc"] == "LatAm executive" and blk["records"][-1]["minerals"] == ["copper", "lithium"]
    years = {r["year"]: r for r in blk["stance_by_year"]}
    assert years[2019]["stance_cn_mean"] == 0.0 and years[2019]["n_cn"] == 1 and years[2019]["stance_us_mean"] is None
    assert years[2024]["stance_cn_mean"] == -1.0 and years[2024]["n_statements"] == 1  # the US speaker is not domestic
    assert blk["by_bloc"][0]["n"] == 1 and blk["coding"].startswith("dataset codebook") and blk["dataset_source"]["id"] == "manual_statements"
    assert per["freshness"]["statements"]["source_ids"] == ["manual_statements"]
    region = json.loads((site / "region.json").read_text())["statements"]
    assert region["n_total"] == 5 and region["n_in_scope"] == 4 and region["excluded"] == {"MEX": 1} and region["records"][0]["id"] == "PS-0004"
    assert {(r["year"], r["bloc"]): r["n"] for r in region["by_year_bloc"]}[(2024, "LatAm legislature")] == 1
    assert region["countries"]["PER"] == 3 and region["countries"]["BRA"] == 0
    meta = json.loads((site / "meta.json").read_text())
    assert meta["layers"]["statements"] == "real" and meta["coverage"]["PER"]["statements"] == 3 and meta["coverage"]["BRA"]["statements"] == 0
