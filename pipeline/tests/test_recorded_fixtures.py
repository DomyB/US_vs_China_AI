"""Run every adapter's parser on the trimmed real responses recorded by the ingestion workflow.

Skipped for adapters without a recorded fixture directory. A failure here means the source
changed its format since the last run (or the recorder trimmed something the parser needs).
"""
from __future__ import annotations

import pytest

from scm import schema
from scm.fixtures import fixture_snapshot
from scm.ingest import ADAPTERS


@pytest.mark.parametrize("sid", sorted(ADAPTERS))
def test_parser_on_recorded_fixture(sid):
    snap = fixture_snapshot(sid)
    if snap is None or not snap.files:
        pytest.skip(f"no recorded fixture for {sid}")
    adapter = ADAPTERS[sid]()
    out = adapter.parse(snap)
    assert set(out) <= set(adapter.tables)
    for name, df in out.items():
        validated = schema.validate(name, df.copy())
        assert len(validated) == len(df)
