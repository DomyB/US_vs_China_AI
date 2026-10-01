"""Adapter base class: fetch -> parse -> load, with provenance stamped from the registry."""
from __future__ import annotations

import json
import logging
import os
import traceback
from abc import ABC, abstractmethod
from datetime import UTC, datetime
from pathlib import Path

import pandas as pd

from .. import schema
from ..http import Snapshot
from ..paths import RAW_DIR, WAREHOUSE_DIR
from ..registry import Source, source

log = logging.getLogger("scm")


class Adapter(ABC):
    """One adapter per registry source.

    Subclasses set `source_id`, `tables`, optionally `requires_env` (secrets that
    gate the adapter) and implement `fetch(snap)` and `parse(snap)`.
    """

    source_id: str
    tables: tuple[str, ...]
    requires_env: tuple[str, ...] = ()
    language: str | None = None  # override registry language if needed
    min_interval: float = 1.0

    def __init__(self) -> None:
        self.src: Source = source(self.source_id)

    # ---- to implement
    @abstractmethod
    def fetch(self, snap: Snapshot) -> None: ...

    @abstractmethod
    def parse(self, snap: Snapshot) -> dict[str, pd.DataFrame]: ...

    # ---- helpers for subclasses
    def provenance(self, snap: Snapshot, record_url: str | None = None, confidence: str = "documented") -> dict:
        return {
            "source_id": self.source_id,
            "source_url": self.src.url,
            "source_record_url": record_url,
            "retrieved_at": snap.retrieved_at(),
            "original_language": self.language or self.src.language,
            "reliability": self.src.reliability,
            "confidence": confidence,
        }

    def stamp(self, snap: Snapshot, df: pd.DataFrame, **overrides) -> pd.DataFrame:
        prov = self.provenance(snap, **overrides)
        for k, v in prov.items():
            if k not in df.columns:
                df[k] = v
        return df

    @property
    def enabled(self) -> bool:
        return all(os.environ.get(k) for k in self.requires_env)

    # ---- lifecycle
    def snapshot(self, base: Path = RAW_DIR) -> Snapshot:
        return Snapshot.today(self.source_id, base=base, min_interval=self.min_interval)

    def load(self, tables: dict[str, pd.DataFrame], out_dir: Path = WAREHOUSE_DIR) -> dict[str, int]:
        rows: dict[str, int] = {}
        for name, df in tables.items():
            if name not in self.tables:
                raise ValueError(f"{self.source_id} produced unexpected table '{name}'")
            df = schema.validate(name, df.copy())
            target = out_dir / name / f"{self.source_id}.parquet"
            target.parent.mkdir(parents=True, exist_ok=True)
            df.to_parquet(target, index=False)
            rows[name] = len(df)
            log.info("%s -> %s (%d rows)", self.source_id, target, len(df))
        return rows

    def run(self, fetch: bool = True, parse: bool = True, raw_base: Path = RAW_DIR, out_dir: Path = WAREHOUSE_DIR) -> dict:
        started = datetime.now(UTC).isoformat(timespec="seconds")
        snap_dir = None
        try:
            if not self.enabled:
                return self._run_record(started, "skipped", {}, f"missing env: {', '.join(k for k in self.requires_env if not os.environ.get(k))}", None, out_dir)
            if fetch:
                snap = self.snapshot(raw_base)
                self.fetch(snap)
            else:
                snap = Snapshot.latest(self.source_id, base=raw_base)
                if snap is None:
                    raise RuntimeError(f"no snapshot for {self.source_id}; run with fetch")
            snap_dir = str(snap.dir)
            rows = {}
            if parse:
                rows = self.load(self.parse(snap), out_dir=out_dir)
            return self._run_record(started, "ok", rows, None, snap_dir, out_dir)
        except Exception as e:  # noqa: BLE001 - we record every failure
            log.error("%s failed: %s\n%s", self.source_id, e, traceback.format_exc())
            return self._run_record(started, "failed", {}, f"{type(e).__name__}: {e}", snap_dir, out_dir)

    def _run_record(self, started: str, status: str, rows: dict, error: str | None, snap_dir: str | None, out_dir: Path) -> dict:
        rec = {
            "run_id": f"{self.source_id}-{started}", "source_id": self.source_id, "started_at": started,
            "finished_at": datetime.now(UTC).isoformat(timespec="seconds"), "status": status,
            "rows": json.dumps(rows), "error": error, "snapshot_dir": snap_dir,
        }
        runs_dir = out_dir / "ingest_run"
        runs_dir.mkdir(parents=True, exist_ok=True)
        path = runs_dir / f"{self.source_id}.parquet"
        df = pd.DataFrame([rec])
        if path.exists():
            df = pd.concat([pd.read_parquet(path), df], ignore_index=True)
        schema.validate("ingest_run", df).to_parquet(path, index=False)
        return rec


def event_id(*parts: object) -> str:
    """Stable identifier from the source's own keys (never from row position)."""
    import hashlib

    raw = "|".join(str(p) for p in parts)
    return hashlib.sha1(raw.encode("utf-8")).hexdigest()[:16]


def to_float(x: object) -> float | None:
    if x is None:
        return None
    try:
        if isinstance(x, str):
            x = x.replace(",", "").replace("$", "").strip()
            if x in ("", "-", "—", "NA", "n/a", "W", "XX", "NaN"):
                return None
        v = float(x)
        return None if v != v else v
    except (TypeError, ValueError):
        return None
