"""The project's period: one constant, read by the adapters, the index and the exports."""

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
