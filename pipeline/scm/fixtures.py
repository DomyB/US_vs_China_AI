"""Write trimmed copies of the latest raw snapshots into pipeline/tests/fixtures/<source_id>/.

JSON files keep their first records; CSV/TSV files keep their header and first rows;
XLSX files keep the first rows of every sheet; binary files are skipped. The manifest
is copied so parsers run unchanged on fixtures.
"""
from __future__ import annotations

import json
from pathlib import Path

import pandas as pd

from .http import Snapshot
from .ingest import ADAPTERS
from .paths import PIPELINE_DIR

FIXTURES = PIPELINE_DIR / "tests" / "fixtures"
MAX_ROWS = 60


def _trim_json(obj: object) -> object:
    if isinstance(obj, list):
        return [_trim_json(x) for x in obj[:MAX_ROWS]]
    if isinstance(obj, dict):
        return {k: (_trim_json(v) if k in ("data", "results", "features", "files", "bills", "resources") or isinstance(v, (dict, list)) else v) for k, v in obj.items()}
    return obj


def record(ids: list[str] | None = None) -> dict:
    out: dict[str, list[str]] = {}
    for sid in ids or list(ADAPTERS):
        snap = Snapshot.latest(sid)
        if snap is None:
            continue
        dest = FIXTURES / sid
        dest.mkdir(parents=True, exist_ok=True)
        kept: list[str] = []
        manifest = {"source_id": sid, "files": {}, "fixture_of": str(snap.dir), "note": "trimmed copy of a real response; see scm/fixtures.py"}
        for name, meta in snap.files.items():
            src = snap.path(name)
            if not src.exists() or src.stat().st_size == 0:
                continue
            target = dest / name
            target.parent.mkdir(parents=True, exist_ok=True)
            low = name.lower()
            try:
                if low.endswith(".json"):
                    target.write_text(json.dumps(_trim_json(json.loads(src.read_text(encoding="utf-8"))), ensure_ascii=False), encoding="utf-8")
                elif low.endswith((".csv", ".tab", ".txt")):
                    with src.open("r", encoding="utf-8", errors="ignore") as f, target.open("w", encoding="utf-8") as g:
                        for i, line in enumerate(f):
                            if i > MAX_ROWS:
                                break
                            g.write(line)
                elif low.endswith(".xlsx"):
                    with pd.ExcelWriter(target) as w:
                        for sheet in pd.ExcelFile(src).sheet_names:
                            pd.read_excel(src, sheet_name=sheet, header=None, nrows=MAX_ROWS).to_excel(w, sheet_name=sheet[:31], header=False, index=False)
                elif low.endswith(".html"):
                    target.write_text(src.read_text(encoding="utf-8", errors="ignore")[:20000], encoding="utf-8")
                else:
                    continue
            except Exception as e:  # noqa: BLE001
                manifest.setdefault("skipped", []).append({"name": name, "error": str(e)[:200]})
                continue
            manifest["files"][name] = {**meta, "trimmed": True}
            kept.append(name)
        (dest / "manifest.json").write_text(json.dumps(manifest, indent=1, default=str), encoding="utf-8")
        out[sid] = kept
    return out


def fixture_snapshot(source_id: str) -> Snapshot | None:
    d = FIXTURES / source_id
    return Snapshot.open(source_id, d) if (d / "manifest.json").exists() else None


__all__ = ["record", "fixture_snapshot", "FIXTURES", "Path"]
