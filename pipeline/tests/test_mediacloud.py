"""Media Cloud adapter on fake payloads (the sandbox cannot reach the API): collection lookup, monthly sums, headlines, ledger, budget, key."""
from __future__ import annotations

import json
from datetime import date

import pandas as pd
import pytest

from scm import schema
from scm.ingest import ADAPTERS, PRESS
from scm.ingest import mediacloud as mc
from scm.ingest.mediacloud import MediaCloud, daily_rows, find_collection, plan_years, story_rows, year_bounds
from scm.registry import sources


def _nested(rows):
    return {"count_over_time": {"counts": rows}}


DAILY = [
    {"date": "2024-01-03", "count": 2, "total_count": 100},
    {"date": "2024-01-20", "count": 3, "total_count": 150},
    {"date": "2024-02-01T00:00:00Z", "count": 1, "total_count": 80},  # a timestamp is accepted
]
STORIES = {"stories": [
    {"id": 1, "title": "China amplia compras de nióbio brasileiro", "url": "https://www1.folha.uol.com.br/mercado/2024/01/x.shtml?utm_source=mc",
     "publish_date": "2024-01-03T10:15:00Z", "media_name": "Folha de S.Paulo", "media_url": "https://www.folha.uol.com.br", "language": "pt"},
    {"id": 2, "title": "Lítio: EUA assinam acordo", "url": "https://www.unknown-blog.com/a", "publish_date": "2024-01-04", "media_name": "Blog", "language": "pt"},
    {"id": 3, "title": "Bolsa fecha em alta", "url": "https://valor.globo.com/y", "publish_date": "2024-01-05", "media_name": "Valor", "language": "pt"},
    {"id": 4, "title": "Mineração de cobre e China", "url": "https://valor.globo.com/z", "publish_date": None, "media_name": "Valor", "language": "xx"},
], "pagination_token": None}


def test_mediacloud_is_in_the_press_group_and_registry():
    assert MediaCloud in PRESS and ADAPTERS["mediacloud"] is MediaCloud
    src = MediaCloud().src
    assert src.reliability == "independent_academic" and src.access == "api" and src.category == "events"


def test_queries_join_terms_with_or_and_actors_with_and():
    q = mc.actor_query("count_mining")
    assert q.startswith("(lithium OR ") and " litio " in q and "nióbio" in q
    assert mc.actor_query("count_cn") == f"{q} AND (China OR chino OR china OR Chinese OR Beijing OR Pekín OR Pequim)"
    assert mc.actor_query("count_us").endswith('AND ("Estados Unidos" OR EEUU OR "EE.UU." OR "United States" OR Washington OR estadounidense OR americano)')


def test_collection_lookup_picks_the_national_collection_by_name():
    payload = {"results": [{"id": 34412118, "name": "Argentina - State & Local"}, {"id": 34412, "name": "Argentina - National"}]}
    assert find_collection(payload, "ARG") == 34412
    assert find_collection([{"id": 7, "name": "argentina - national"}], "ARG") == 7  # case-insensitive, flat list accepted
    assert find_collection(payload, "BOL") is None
    assert find_collection({"results": "nope"}, "ARG") is None
    # the long official names Media Cloud uses for two countries, and a decoy that is not the national collection
    long = {"count": 2, "results": [{"id": 1, "name": "Bolivia, Plurinational State of - State & Local"}, {"id": 34412045, "name": "Bolivia, Plurinational State of - National"}]}
    assert find_collection(long, "BOL") == 34412045
    assert find_collection({"results": [{"id": 9, "name": "Venezuela, Bolivarian Republic of - National"}]}, "VEN") == 9
    assert find_collection({"results": [{"id": 9, "name": "Guyana Chronicle - National"}]}, "GUY") is None


def test_collections_are_recorded_and_a_country_without_one_is_skipped(snap_factory, monkeypatch):
    monkeypatch.setenv("MEDIACLOUD_KEY", "SECRET-VALUE")
    snap = snap_factory("mediacloud", {})
    snap.manifest["errors"] = []
    seen = []

    def fake_get(url, name, params=None, headers=None, **kw):
        seen.append((name, params["name"], headers["Authorization"]))
        results = [] if "Bolivia" in params["name"] else [{"id": 101, "name": params["name"]}]
        snap.path(name).parent.mkdir(parents=True, exist_ok=True)
        snap.path(name).write_text(json.dumps({"results": results}))
        snap.record(name, url, params=params, status=200)
        return snap.path(name)

    monkeypatch.setattr(snap, "get", fake_get)
    adapter = MediaCloud()
    adapter._errors = 0
    found = adapter.collections(snap, ["ARG", "BOL", "BRA"])
    assert found == {"ARG": 101, "BRA": 101}
    assert snap.manifest["collections_missing"] == ["BOL"] and "collections/BOL.json" in snap.manifest["unparsed"]
    assert seen[0] == ("collections/ARG.json", "Argentina - National", "Token SECRET-VALUE")
    assert "SECRET-VALUE" not in json.dumps(snap.files)  # the key travels in a header, never in a recorded URL or param


@pytest.mark.parametrize("shape", [_nested, lambda rows: rows, lambda rows: {"counts": rows}])
def test_daily_rows_accept_both_shapes(shape):
    rows = daily_rows(shape(DAILY))
    assert [r["date"] for r in rows] == ["2024-01-03", "2024-01-20", "2024-02-01"]
    assert rows[2]["total_count"] == 80
    assert daily_rows({"count_over_time": "oops"}) is None and daily_rows("x") is None


def test_story_rows_accept_both_shapes():
    stories, token = story_rows({"stories": [{"id": 1}], "pagination_token": "abc"})
    assert stories == [{"id": 1}] and token == "abc"
    assert story_rows([{"id": 2}]) == ([{"id": 2}], None)
    assert story_rows({"nope": 1}) is None


def _year_snapshot(snap_factory, shape=_nested, with_us=True):
    files = {
        "BRA/2024_count_mining.json": shape(DAILY),
        "BRA/2024_count_cn.json": shape([{"date": "2024-01-03", "count": 1, "total_count": 100}]),
        "BRA/2024_stories_1.json": STORIES,
    }
    if with_us:
        files["BRA/2024_count_us.json"] = shape([{"date": "2024-02-10", "count": 1, "total_count": 90}])
    snap = snap_factory("mediacloud", files)
    snap.files["BRA/2024_count_mining.json"]["params"] = {"start": "2024-01-01", "end": "2024-03-31", "cs": 1}
    snap.files["BRA/2024_count_mining.json"]["url"] = "https://search.mediacloud.org/api/search/count-over-time?q=x&start=2024-01-01&end=2024-03-31&cs=1"
    return snap


@pytest.mark.parametrize("shape", [_nested, lambda rows: rows])
def test_monthly_aggregation_from_daily_rows(snap_factory, shape):
    out = MediaCloud().parse(_year_snapshot(snap_factory, shape))
    for k, v in out.items():
        assert len(schema.validate(k, v.copy())) == len(v)
    vol = out["media_volume"].set_index("period")
    assert list(vol.index) == ["2024-01-01", "2024-02-01", "2024-03-01"]  # March has no daily row and is still written (zero)
    jan, feb, mar = vol.loc["2024-01-01"], vol.loc["2024-02-01"], vol.loc["2024-03-01"]
    assert jan["items_total"] == 250 and jan["items_mining"] == 5 and jan["items_cn"] == 1 and jan["items_us"] == 0
    assert feb["items_total"] == 80 and feb["items_mining"] == 1 and feb["items_cn"] == 0 and feb["items_us"] == 1
    assert mar["items_total"] == 0 and mar["items_mining"] == 0
    assert (vol["country"] == "BRA").all() and (vol["source_id"] == "mediacloud").all()
    assert vol.iloc[0]["source_record_url"].startswith("https://search.mediacloud.org/api/search/count-over-time?q=x&start=2024-01-01")
    assert vol.iloc[0]["reliability"] == "independent_academic"


def test_a_year_with_a_missing_count_series_is_not_written(snap_factory):
    snap = _year_snapshot(snap_factory, with_us=False)
    out = MediaCloud().parse(snap)
    assert out["media_volume"].empty and snap.manifest["incomplete_years"] == ["BRA/2024"]
    assert len(out["document"]) == 3  # headlines are still kept


def test_headline_rows_filter_map_outlets_and_override_reliability(snap_factory):
    snap = _year_snapshot(snap_factory)
    docs = MediaCloud().parse(snap)["document"].set_index("title_original")
    assert set(docs.index) == {"China amplia compras de nióbio brasileiro", "Lítio: EUA assinam acordo", "Mineração de cobre e China"}  # the stock-market headline is dropped
    folha = docs.loc["China amplia compras de nióbio brasileiro"]
    assert folha["outlet_source_id"] == "bra_folha" and folha["reliability"] == sources()["bra_folha"].reliability  # the outlet's rating, not Media Cloud's
    assert folha["date"] == "2024-01-03" and folha["date_precision"] == "day" and folha["url_norm"] == "https://www1.folha.uol.com.br/mercado/2024/01/x.shtml"
    assert folha["venue"] == "Folha de S.Paulo" and folha["language"] == "pt" and folha["doc_type"] == "news" and folha["country"] == "BRA"
    blog = docs.loc["Lítio: EUA assinam acordo"]
    assert pd.isna(blog["outlet_source_id"]) and blog["reliability"] == "independent_academic"  # unknown host keeps Media Cloud's rating
    valor = docs.loc["Mineração de cobre e China"]
    assert valor["outlet_source_id"] == "bra_valor" and valor["date"] == "2024-01-01" and valor["date_precision"] == "year"  # no publish_date: the year stands
    assert valor["language"] == "multi"  # an unknown story language falls back to the registry's
    assert docs["summary"].isna().all() and (~docs["full_text_stored"]).all()
    assert snap.manifest["unmatched_domains"] == {"unknown-blog.com": 1}


def test_a_month_still_running_on_the_fetch_day_is_not_written(snap_factory):
    snap = _year_snapshot(snap_factory)
    snap.files["BRA/2024_count_mining.json"]["params"]["end"] = "2024-02-20"  # fetched on 20 February: February has not ended
    vol = MediaCloud().parse(snap)["media_volume"].set_index("period")
    assert list(vol.index) == ["2024-01-01"]  # February's partial rows wait for the first run after the month ends
    assert mc.complete_months("2024-01-01", "2024-03-31") == ["2024-01-01", "2024-02-01", "2024-03-01"]
    assert mc.complete_months("2024-11-01", "2025-01-31") == ["2024-11-01", "2024-12-01", "2025-01-01"] and mc.complete_months("x", "y") == []


def test_ledger_skips_a_done_year_and_runs_newest_first():
    mc_url = "https://search.mediacloud.org/api/search/count-over-time?start={y}-01-01"
    prev = pd.DataFrame([
        *({"country": "BRA", "period": f"2023-{m:02d}-01", "source_record_url": mc_url.format(y=2023)} for m in range(1, 13)),  # all twelve months: done
        *({"country": "BRA", "period": f"2022-{m:02d}-01", "source_record_url": mc_url.format(y=2022)} for m in range(1, 12)),  # cut short at eleven: planned again
        {"country": "BRA", "period": "2024-01-01", "source_record_url": mc_url.format(y=2024)},
        *({"country": "ARG", "period": f"2023-{m:02d}-01", "source_record_url": "https://api.gdeltproject.org/api/v2/doc/doc?x"} for m in range(1, 13)),  # another source's rows do not count
    ])
    plan = plan_years(prev, date(2024, 6, 1), ["ARG", "BRA"], bounds=(2022, 2024))
    assert plan == [("ARG", 2024), ("BRA", 2024), ("ARG", 2023), ("ARG", 2022), ("BRA", 2022)]  # the current year is always planned
    assert plan_years(None, date(2024, 6, 1), ["ARG"], bounds=(2011, 2012)) == [("ARG", 2012), ("ARG", 2011)]
    full = plan_years(None, date(2024, 6, 1), ["ARG"])
    assert full[0] == ("ARG", 2024) and full[-1] == ("ARG", 2010)
    assert year_bounds("2015-2018") == (2015, 2018) and year_bounds("2018 - 2015") == (2015, 2018) and year_bounds("") is None and year_bounds("x") is None


def _fake_api(snap, calls):
    def fake_get(url, name, params=None, headers=None, **kw):
        calls.append((url.split("/api/")[1], name))
        if name.startswith("collections/"):
            body = {"results": [{"id": 5, "name": params["name"]}]}
        elif "count_" in name:
            body = _nested([{"date": f"{params['start'][:4]}-03-01", "count": 1, "total_count": 10}])
        else:
            body = {"stories": [], "pagination_token": None}
        snap.path(name).parent.mkdir(parents=True, exist_ok=True)
        snap.path(name).write_text(json.dumps(body))
        snap.record(name, url, params=params, status=200)
        return snap.path(name)
    return fake_get


def test_fetch_runs_the_plan_and_stops_on_the_time_budget(snap_factory, monkeypatch):
    monkeypatch.setenv("MEDIACLOUD_KEY", "k")
    monkeypatch.setenv("MEDIACLOUD_YEARS", "2022-2023")
    monkeypatch.setenv("MEDIACLOUD_TIME_BUDGET_MIN", "10")
    monkeypatch.setattr(mc, "IN_SCOPE", ["ARG", "BRA"])
    monkeypatch.setattr(MediaCloud, "previous_table", lambda self, name: None)
    snap = snap_factory("mediacloud", {})
    calls: list = []
    monkeypatch.setattr(snap, "get", _fake_api(snap, calls))
    MediaCloud().fetch(snap)
    assert snap.manifest["collections"] == {"ARG": 5, "BRA": 5} and snap.manifest["years_planned"] == 4
    assert snap.manifest["years_fetched"] == 4 and snap.manifest["years_left"] == 0 and "stopped" not in snap.manifest
    names = [n for _, n in calls if not n.startswith("collections/")]
    assert names[:4] == ["ARG/2023_count_mining.json", "ARG/2023_count_cn.json", "ARG/2023_count_us.json", "ARG/2023_stories_1.json"]
    assert names[4].startswith("BRA/2023_") and names[-1] == "BRA/2022_stories_1.json"
    assert calls[-1][0] == "search/story-list" and calls[2][0] == "search/count-over-time"
    assert snap.files["ARG/2023_count_mining.json"]["params"] == {"q": mc.actor_query("count_mining"), "start": "2023-01-01", "end": "2023-12-31", "cs": 5, "platform": "onlinenews-mediacloud"}
    # budget exhausted: the plan is recorded, nothing after the collection lookup is fetched
    monkeypatch.setenv("MEDIACLOUD_TIME_BUDGET_MIN", "0")
    snap2 = snap_factory("mediacloud2", {})
    calls2: list = []
    monkeypatch.setattr(snap2, "get", _fake_api(snap2, calls2))
    MediaCloud().fetch(snap2)
    assert snap2.manifest["stopped"].startswith("time budget") and snap2.manifest["years_left"] == 4
    assert all(n.startswith("collections/") for _, n in calls2)


def test_fetch_stops_after_consecutive_failures(snap_factory, monkeypatch):
    from scm.http import FetchError

    monkeypatch.setenv("MEDIACLOUD_KEY", "k")
    monkeypatch.setenv("MEDIACLOUD_YEARS", "2020-2023")
    monkeypatch.setattr(mc, "IN_SCOPE", ["ARG"])
    monkeypatch.setattr(MediaCloud, "previous_table", lambda self, name: None)
    snap = snap_factory("mediacloud", {})
    calls: list = []
    ok = _fake_api(snap, calls)

    def flaky(url, name, params=None, headers=None, **kw):
        if name.startswith("collections/"):
            return ok(url, name, params=params, headers=headers, **kw)
        calls.append(name)
        raise FetchError(f"mediacloud: HTTP 429 on GET {url}")

    monkeypatch.setattr(snap, "get", flaky)
    pauses: list[float] = []
    monkeypatch.setattr(MediaCloud, "_pause", lambda self, s: pauses.append(s))
    MediaCloud().fetch(snap)
    # every throttled request is retried once after a pause, so each of the five failed requests counts two throttles;
    # after the fifth failure in a row no further request is sent, and the run stops at the next year
    assert snap.manifest["stopped"].startswith(f"{mc.MAX_CONSECUTIVE_ERRORS} consecutive")
    assert snap.manifest["throttled"] == 2 * mc.MAX_CONSECUTIVE_ERRORS and len(pauses) == mc.MAX_CONSECUTIVE_ERRORS
    assert pauses[0] == mc.THROTTLE_PAUSE_S and len(calls) == 2 * mc.MAX_CONSECUTIVE_ERRORS + 1  # the collection lookup plus the retried requests
    assert len(snap.manifest["errors"]) == mc.MAX_CONSECUTIVE_ERRORS and snap.manifest["years_fetched"] == 2 and snap.manifest["years_left"] == 2


def test_throttle_wait_reads_the_answer():
    assert mc.throttle_wait("mediacloud: HTTP 429 on GET x {\"detail\":\"Request was throttled. Expected available in 42 seconds.\"}") == 43.0
    assert mc.throttle_wait("mediacloud: HTTP 429 on GET x") == mc.THROTTLE_PAUSE_S
    assert mc.throttle_wait("available in 9999 seconds") == mc.THROTTLE_PAUSE_MAX_S


def test_a_throttled_request_succeeds_on_its_retry(snap_factory, monkeypatch):
    from scm.http import FetchError

    monkeypatch.setenv("MEDIACLOUD_KEY", "k")
    snap = snap_factory("mediacloud", {})
    calls: list = []
    ok = _fake_api(snap, calls)
    seen: list[str] = []

    def once(url, name, params=None, headers=None, **kw):
        if name not in seen:
            seen.append(name)
            raise FetchError(f"mediacloud: HTTP 429 on GET {url} Expected available in 2 seconds.")
        return ok(url, name, params=params, headers=headers, **kw)

    monkeypatch.setattr(snap, "get", once)
    pauses: list[float] = []
    monkeypatch.setattr(MediaCloud, "_pause", lambda self, s: pauses.append(s))
    adapter = MediaCloud()
    snap.manifest["errors"] = []
    assert adapter._get_json(snap, "sources/collections/", "collections/ARG.json", {"name": "Argentina - National"}) is not None
    assert pauses == [3.0] and snap.manifest["throttled"] == 1 and snap.manifest["errors"] == [] and adapter._errors == 0


def test_story_pagination_is_capped(snap_factory, monkeypatch):
    monkeypatch.setenv("MEDIACLOUD_KEY", "k")
    monkeypatch.setattr(mc, "PAGE_SIZE", 2)
    monkeypatch.setattr(mc, "MAX_STORIES", 4)
    snap = snap_factory("mediacloud", {})
    snap.manifest["errors"] = []
    pages = []

    def fake_get(url, name, params=None, headers=None, **kw):
        pages.append(params.get("pagination_token"))
        snap.path(name).parent.mkdir(parents=True, exist_ok=True)
        snap.path(name).write_text(json.dumps({"stories": [{"id": 1}, {"id": 2}], "pagination_token": f"t{len(pages)}"}))
        snap.record(name, url, params=params, status=200)
        return snap.path(name)

    monkeypatch.setattr(snap, "get", fake_get)
    adapter = MediaCloud()
    adapter._errors = 0
    adapter._stories(snap, "ARG", 2020, {"start": "2020-01-01", "end": "2020-12-31", "cs": 1, "platform": "onlinenews-mediacloud"})
    assert pages == [None, "t1"] and snap.has("ARG/2020_stories_2.json")  # two pages of two, then the cap


def test_skipped_without_the_key(tmp_path, monkeypatch):
    monkeypatch.delenv("MEDIACLOUD_KEY", raising=False)
    rec = MediaCloud().run(raw_base=tmp_path / "raw", out_dir=tmp_path / "wh")
    assert rec["status"] == "skipped" and "MEDIACLOUD_KEY" in rec["error"]
