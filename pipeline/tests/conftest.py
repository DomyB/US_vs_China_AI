from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from scm.http import Snapshot  # noqa: E402


@pytest.fixture
def snap_factory(tmp_path):
    """Build a Snapshot in tmp_path from {name: content}; content may be str, bytes, dict/list (JSON) or a callable(path)."""

    def make(source_id: str, files: dict[str, object]) -> Snapshot:
        snap = Snapshot.open(source_id, tmp_path / source_id)
        for name, content in files.items():
            p = snap.path(name)
            p.parent.mkdir(parents=True, exist_ok=True)
            if callable(content):
                content(p)
            elif isinstance(content, (dict, list)):
                p.write_text(json.dumps(content), encoding="utf-8")
            elif isinstance(content, bytes):
                p.write_bytes(content)
            else:
                p.write_text(str(content), encoding="utf-8")
            snap.record(name, f"https://example.test/{name}", status=200)
        return snap

    return make
