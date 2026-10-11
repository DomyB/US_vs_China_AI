"""The project's period: one constant, read by the adapters, the index and the exports."""
import pytest

from scm.ingest.comtrade import CHUNK_ANCHOR, chunk_years
from scm.ingest.tier2 import first_congress
from scm.period import PERIOD_FROM, congress_of, data_from, period


def test_period_starts_in_2000_and_the_block_names_both_ends():
    assert PERIOD_FROM == 2000
    assert period("2026-10-10") == {"from": 2000, "data_from": 2000, "to": 2026}
    assert period("2026-10-10", 2008) == {"from": 2000, "data_from": 2008, "to": 2026}
    assert data_from([{"year": 1999}, {"year": 2008}, {"year": 2012}]) == 2008 and data_from([]) is None


def test_congress_of_year():
    assert congress_of(2000) == 106  # 1999–2000
    assert congress_of(2008) == 110  # 2007–2008, the old start
    assert congress_of(2026) == 119
    assert first_congress() == congress_of(PERIOD_FROM)


def test_comtrade_chunks_keep_the_2008_file_names():
    years = list(range(2000, 2026))
    chunks = chunk_years(years, 3)
    assert chunks[:3] == [[2000, 2001, 2002], [2003, 2004, 2005], [2006, 2007]]
    assert [2008, 2009, 2010] in chunks and [2023, 2024, 2025] in chunks
    assert sorted(y for c in chunks for y in c) == years
    assert all(c[0] >= CHUNK_ANCHOR or c[-1] < CHUNK_ANCHOR for c in chunks)
    assert chunk_years(list(range(2008, 2014)), 6) == [[2008, 2009, 2010, 2011, 2012, 2013]]


def test_release_counts_are_bounded_by_the_registry():
    from scm.export_site import release_counts
    from scm.ingest import ADAPTERS

    c = release_counts(["un_comtrade", "aiddata_gcdf", "not_an_adapter"])
    assert c["adapters_ok"] == {"ok": 2, "total": len(ADAPTERS)}
    assert 0 < c["sources_live"]["live"] <= c["sources_live"]["total"]


def _stored(snap, name):
    """Store an empty response under `name`, as the real session does on a 200."""
    p = snap.path(name)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text("{}")
    snap.record(name, "https://example.org", status=200)


def test_comtrade_halves_the_code_list_when_the_api_rejects_a_code(snap_factory, monkeypatch):
    """A 400 for a code the reporter's HS edition lacks: the adapter finds it by halving, fetches the rest and
    remembers it for the other reporters' same years."""
    from scm.ingest import comtrade

    calls: list[tuple[str, tuple[int, ...], tuple[str, ...]]] = []

    def fake_call(self, snap, name, reporter, periods, partners, codes=None):
        codes = self.codes if codes is None else codes
        calls.append((name, tuple(periods), tuple(codes)))
        if periods[0] < 2008 and "811292" in codes:
            self._last_status = 400
            return None
        self._last_status = None
        _stored(snap, name)
        return {"count": 1, "data": [{"reporterCode": reporter, "partnerCode": partners[0], "cmdCode": codes[0], "flowCode": "X", "refYear": periods[0], "primaryValue": 1.0}]}

    monkeypatch.setattr(comtrade.Comtrade, "_call", fake_call)
    monkeypatch.setattr(comtrade, "IN_SCOPE", ["ARG", "CHL"])
    snap = snap_factory("un_comtrade", {})
    c = comtrade.Comtrade(years=[2006, 2007, 2008])
    c.fetch(snap)
    assert snap.manifest["rejected_codes"] == {"2006-2007": ["811292"]}
    arg_pre = [k for k in calls if k[0].startswith("rep_ARG_2006-2007")]
    assert len(arg_pre) > 3  # the whole list, the probe, then the halves
    assert any(k[0].endswith("_c260300.json") for k in arg_pre)  # the probe went first
    chl_pre = [k for k in calls if k[0].startswith("rep_CHL_2006-2007")]
    assert len(chl_pre) == 1 and "811292" not in chl_pre[0][2]  # the second reporter skips the rejected code at once
    assert all("811292" in k[2] for k in calls if k[1] == (2008,))  # 2008 keeps the full list
    assert c._rejected[(2006, 2007)] == {"811292"}


def test_comtrade_skips_a_year_range_the_endpoint_refuses_outright(snap_factory, monkeypatch):
    """When even the probe code is answered 400, the years themselves are refused: the range is recorded and skipped
    for every reporter instead of being bisected code by code."""
    from scm.ingest import comtrade

    calls: list[str] = []

    def fake_call(self, snap, name, reporter, periods, partners, codes=None):
        calls.append(name)
        if periods[0] < 2008:
            self._last_status = 400
            return None
        self._last_status = None
        _stored(snap, name)
        return {"count": 1, "data": []}

    monkeypatch.setattr(comtrade.Comtrade, "_call", fake_call)
    monkeypatch.setattr(comtrade, "IN_SCOPE", ["ARG", "CHL"])
    snap = snap_factory("un_comtrade", {})
    comtrade.Comtrade(years=[2006, 2007, 2008]).fetch(snap)
    assert snap.manifest["rejected_periods"] == ["2006-2007"]
    assert [c for c in calls if "2006-2007" in c] == ["rep_ARG_2006-2007.json", "rep_ARG_2006-2007_c260300.json"]  # one probe, no bisection, Chile skips the range
    assert "rejected_codes" not in snap.manifest


def test_comtrade_reads_the_refusal_from_the_status_not_the_url(snap_factory, monkeypatch):
    """A 400 whose URL carries the code 740311 is a 400, not a 403: no back-off, no quota count, one call."""
    from scm.http import FetchError
    from scm.ingest import comtrade

    monkeypatch.setattr("time.sleep", lambda s: (_ for _ in ()).throw(AssertionError("slept on a 400")))
    monkeypatch.setattr(comtrade, "IN_SCOPE", ["ARG"])
    snap = snap_factory("un_comtrade", {})
    calls: list[str] = []

    def bad_request(url, name, **kw):
        calls.append(name)
        raise FetchError(f"un_comtrade: HTTP 400 on GET {url}?cmdCode=740311%2C250490 ")

    monkeypatch.setattr(snap, "get", bad_request)
    c = comtrade.Comtrade(years=[2022])
    assert c._call(snap, "rep_ARG_2022.json", 32, [2022], [156]) is None
    assert c._last_status == 400 and c._quota_failures == 0 and len(calls) == 1
    assert snap.manifest["errors"][0]["error"].startswith("un_comtrade: HTTP 400")


def test_comtrade_treats_a_refused_probe_for_fetched_years_as_an_outage(snap_factory, monkeypatch):
    """A 400 on a one-code request for years earlier runs fetched means the endpoint refuses everything: the run
    stops (the previous rows are kept) instead of marking every range rejected and finishing with nothing."""
    from scm.ingest import comtrade

    def fake_call(self, snap, name, reporter, periods, partners, codes=None):
        self._last_status = 400
        return None

    monkeypatch.setattr(comtrade.Comtrade, "_call", fake_call)
    monkeypatch.setattr(comtrade, "IN_SCOPE", ["ARG"])
    snap = snap_factory("un_comtrade", {})
    with pytest.raises(RuntimeError, match="years earlier runs fetched"):
        comtrade.Comtrade(years=[2006, 2007, 2008, 2009]).fetch(snap)
    assert snap.manifest.get("rejected_periods") == ["2006-2007"]  # the pre-2008 range was judged before the 2008 probe failed


def test_comtrade_fails_instead_of_succeeding_with_nothing(snap_factory, monkeypatch):
    from scm.ingest import comtrade

    def fake_call(self, snap, name, reporter, periods, partners, codes=None):
        self._last_status = 500  # a dropped connection, say: no retry path, nothing stored
        return None

    monkeypatch.setattr(comtrade.Comtrade, "_call", fake_call)
    monkeypatch.setattr(comtrade, "IN_SCOPE", ["ARG"])
    snap = snap_factory("un_comtrade", {})
    with pytest.raises(RuntimeError, match="no response was stored"):
        comtrade.Comtrade(years=[2022]).fetch(snap)


def test_load_keeps_stored_rows_when_a_run_parses_nothing(tmp_path):
    import pandas as pd

    from scm.ingest.base import Adapter

    class Fake(Adapter):
        source_id = "un_comtrade"
        tables = ("trade_flow",)

        def fetch(self, snap):
            pass

        def parse(self, snap):
            return {}

    old = pd.DataFrame([{"reporter": "ARG", "partner": "CHN", "reported_by": "ARG", "hs6": "260300", "mineral": "copper", "stage": "ore", "year": 2022, "month": pd.NA, "flow": "X", "value_usd": 1.0, "qty": None, "qty_unit": None, "value_type": "reported", "source_id": "un_comtrade", "source_url": "https://comtradeplus.un.org", "source_record_url": "u", "retrieved_at": "2026-10-11T00:00:00+00:00", "original_language": "en", "reliability": "official", "confidence": "documented"}])
    out = tmp_path / "warehouse"
    (out / "trade_flow").mkdir(parents=True)
    old.to_parquet(out / "trade_flow" / "un_comtrade.parquet", index=False)
    rows = Fake().load({"trade_flow": old.iloc[0:0]}, out_dir=out)
    assert rows == {"trade_flow": 1, "trade_flow_kept": 1}
    assert len(pd.read_parquet(out / "trade_flow" / "un_comtrade.parquet")) == 1
