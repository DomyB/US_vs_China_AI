"""The `classify` command: run the text steps in order with one JSON progress line per step."""
from __future__ import annotations

import json
import time
from pathlib import Path

from ..paths import WAREHOUSE_DIR
from . import models

STEPS = ("translate", "classify", "embed", "topics")


def _rss_mb() -> int:
    try:
        import resource

        return int(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024)
    except Exception:  # noqa: BLE001
        return -1


def run_steps(steps: tuple[str, ...] = STEPS, warehouse: Path = WAREHOUSE_DIR, limit: int | None = None, force: bool = False,
              codebook_version: str = "v1", fields: tuple[str, ...] = ("title",), out=print) -> dict:
    results = {}
    for step in steps:
        if step not in STEPS:
            raise ValueError(f"unknown step {step}; choose from {', '.join(STEPS)}")
        t0 = time.monotonic()
        out(json.dumps({"step": step, "status": "starting", "rss_mb": _rss_mb()}), flush=True)

        def progress(info: dict, _step=step, _t0=t0) -> None:
            out(json.dumps({**info, "elapsed_s": round(time.monotonic() - _t0, 1), "rss_mb": _rss_mb()}), flush=True)

        try:
            if step == "translate":
                from . import translate

                res = translate.run(warehouse, fields=fields, limit=limit, force=force, progress=progress)
            elif step == "classify":
                from . import zero_shot

                res = zero_shot.run(warehouse, limit=limit, force=force, codebook_version=codebook_version, progress=progress)
            elif step == "embed":
                from . import embed

                res = embed.run(warehouse, limit=limit, force=force, progress=progress)
            else:
                from . import topics

                res = topics.run(warehouse, progress=progress)
        finally:
            models.release_all()
        results[step] = res
        out(json.dumps({"step": step, "status": "ok", "result": res, "seconds": round(time.monotonic() - t0, 1), "rss_mb": _rss_mb()}), flush=True)
    return results
