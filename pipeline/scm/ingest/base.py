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
from ..http import RobotsDisallowed, Snapshot, clean_url
from ..paths import RAW_DIR, REPO_ROOT, WAREHOUSE_DIR
from ..registry import Source, source

log = logging.getLogger("scm")


class AdapterTimeout(RuntimeError):
    """Raised inside an adapter when its wall-clock budget runs out (see scm.__main__.with_budget)."""

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
    incremental: bool = False  # merge with the previously stored rows (feeds, windows) instead of replacing them
    respect_robots: bool = False  # consult robots.txt before every GET (HTML, SOAP, feeds)

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
        if "source_record_url" in df.columns and len(df):
            df["source_record_url"] = df["source_record_url"].map(lambda u: clean_url(u) if isinstance(u, str) else u)
        return df

    @property
    def enabled(self) -> bool:
        return all(os.environ.get(k) for k in self.requires_env)

    # ---- lifecycle
    def snapshot(self, base: Path = RAW_DIR) -> Snapshot:
        snap = Snapshot.today(self.source_id, base=base, min_interval=self.min_interval)
        if self.respect_robots:
            from ..robots import RobotsCache

            snap.robots = RobotsCache()
        return snap

    def previous_table(self, name: str, out_dir: Path = WAREHOUSE_DIR) -> pd.DataFrame | None:
        """Rows this adapter stored in an earlier run (restored from the data release), or None."""
        target = out_dir / name / f"{self.source_id}.parquet"
        return pd.read_parquet(target) if target.exists() else None

    def load(self, tables: dict[str, pd.DataFrame], out_dir: Path = WAREHOUSE_DIR) -> dict[str, int]:
        rows: dict[str, int] = {}
        for name, df in tables.items():
            if name not in self.tables:
                raise ValueError(f"{self.source_id} produced unexpected table '{name}'")
            df = schema.validate(name, df.copy())
            target = out_dir / name / f"{self.source_id}.parquet"
            target.parent.mkdir(parents=True, exist_ok=True)
            new_rows = len(df)
            if self.incremental and target.exists() and name in schema.KEY_COLUMNS:
                old = pd.read_parquet(target)
                merged = pd.concat([old, df], ignore_index=True).drop_duplicates(subset=schema.KEY_COLUMNS[name], keep="first")
                df = schema.validate(name, merged.reset_index(drop=True))
                new_rows = len(df) - len(old)
            df.to_parquet(target, index=False)
            rows[name] = len(df)
            if self.incremental:
                rows[f"{name}_new"] = new_rows
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
        except RobotsDisallowed as e:
            # the publisher does not want automated clients: an honest "skipped", not a failure to fix
            return self._run_record(started, "skipped", {}, f"robots.txt disallows: {e}", snap_dir, out_dir)
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


def fetch_manual(snap: Snapshot, value: str, name: str, registry_url: str, timeout: int = 600) -> None:
    """Bring a hand-supplied file into the snapshot. `value` is an http(s) URL (downloaded) or a path
    inside the repository, e.g. data/manual/exim_authorizations.csv (copied; recorded against the
    source's registry URL with a note). Used when a source's open endpoint is broken."""
    if value.startswith(("http://", "https://")):
        snap.get(value, name, timeout=timeout)
        return
    import shutil

    src = Path(value)
    if not src.is_absolute():
        src = REPO_ROOT / src
    if not src.exists():
        raise FileNotFoundError(f"hand-supplied file not found: {value}")
    snap.path(name).parent.mkdir(parents=True, exist_ok=True)
    shutil.copy(src, snap.path(name))
    snap.record(name, registry_url, note=f"copied from a file supplied by the project owner ({value})")


FINANCE_EVENT_COLUMNS = ["event_id", "country", "date", "year", "actor_from", "actor_from_origin", "actor_to", "type", "amount_usd", "currency", "sector", "mineral", "description", "value_type", "source_record_url"]


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
