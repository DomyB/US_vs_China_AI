"""Command line: python -m scm run <source_id|all|tier1|legislature|press|national|annual|monthly> [--fetch-only|--parse-only]
                 python -m scm build | export | liveness [ids...] | fixtures | stats [--write f] [--not-below f]
                 python -m scm classify [--steps translate,classify,embed,topics] [--limit N] [--force] [--codebook-version v1]
                 python -m scm analyse [--draws 500] [--seed 20261009]   (Phase 4 quant tables from the warehouse)"""
from __future__ import annotations

import argparse
import json
import logging
import os
import sys

from . import export_site, liveness, warehouse
from .ingest import ADAPTERS, ANNUAL, GROUPS, LEGISLATURE, NATIONAL, TIER1, TIER2


def _rss_mb() -> int:
    """Peak resident memory of this process so far, in MB (Linux)."""
    try:
        import resource

        return int(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024)
    except Exception:  # noqa: BLE001
        return -1


def with_budget(fn, minutes: float):
    """Run fn() with a wall-clock budget: when it is spent, SIGALRM raises AdapterTimeout inside the adapter
    (sleeps and socket waits included), so one stalled source cannot consume the whole workflow run.
    Budget 0 disables it; platforms without SIGALRM run unbounded."""
    import signal

    from .ingest.base import AdapterTimeout

    if minutes <= 0 or not hasattr(signal, "SIGALRM"):
        return fn()

    def _expired(signum, frame):  # noqa: ARG001
        raise AdapterTimeout(f"time budget of {minutes:g} min exceeded (SCM_ADAPTER_BUDGET_MIN)")

    previous = signal.signal(signal.SIGALRM, _expired)
    signal.setitimer(signal.ITIMER_REAL, minutes * 60)
    try:
        return fn()
    finally:
        signal.setitimer(signal.ITIMER_REAL, 0)
        signal.signal(signal.SIGALRM, previous)


def _cap_memory() -> None:
    """Cap the address space (SCM_MEM_LIMIT_GB, default 8) so a runaway parse raises MemoryError and is
    recorded as a failed adapter, instead of the host's OOM killer taking the whole CI runner down."""
    try:
        import os
        import resource

        gb = float(os.environ.get("SCM_MEM_LIMIT_GB", "8"))
        if gb > 0:
            resource.setrlimit(resource.RLIMIT_AS, (int(gb * (1 << 30)), int(gb * (1 << 30))))
    except Exception:  # noqa: BLE001 - not available on this platform
        pass


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="scm")
    sub = p.add_subparsers(dest="cmd", required=True)
    r = sub.add_parser("run", help="run adapters")
    r.add_argument("targets", nargs="+", help="source ids, or all / tier1 / tier2 / legislature / press / national / annual / monthly; `none` runs nothing (rebuild and re-export only)")
    r.add_argument("--fetch-only", action="store_true")
    r.add_argument("--parse-only", action="store_true")
    r.add_argument("--fail-fast", action="store_true")
    sub.add_parser("build", help="build the DuckDB warehouse and derived tables")
    sub.add_parser("export", help="export web/public/data/real from the warehouse")
    lv = sub.add_parser("liveness", help="direct HTTP check of every registry URL")
    lv.add_argument("ids", nargs="*")
    fx = sub.add_parser("fixtures", help="write trimmed copies of the latest snapshots into pipeline/tests/fixtures")
    fx.add_argument("ids", nargs="*")
    st = sub.add_parser("stats", help="rows per warehouse table; --not-below fails when the warehouse regressed against a reference")
    st.add_argument("--write", help="write the summary as JSON to this path")
    st.add_argument("--not-below", help="reference summary JSON (from the restored release); exit 1 on regression")
    st.add_argument("--allow-regression", action="store_true", help="report regressions as warnings and exit 0 (intentional drops, e.g. a source cleared)")
    cl = sub.add_parser("classify", help="Phase 3 text steps: machine translation, zero-shot stance and tone, embeddings, topics")
    cl.add_argument("--steps", default="translate,classify,embed,topics", help="comma-separated subset, in this order")
    cl.add_argument("--limit", type=int, default=None, help="documents per step (smoke runs)")
    cl.add_argument("--force", action="store_true", help="recompute documents that already have rows")
    cl.add_argument("--codebook-version", default="v1")
    cl.add_argument("--fields", default="title", help="translation fields: title or title,summary")
    va = sub.add_parser("validation", help="hand-coded sample: draw | adjudicate | load | metrics")
    va.add_argument("action", choices=["draw", "adjudicate", "load", "metrics"])
    va.add_argument("--round", default="v1")
    va.add_argument("--n", type=int, default=300)
    va.add_argument("--codebook-version", default="v1")
    tr = sub.add_parser("train", help="fit the stance head on the adjudicated sample and label every document (method trained)")
    tr.add_argument("--round", default="v1")
    tr.add_argument("--codebook-version", default="v1")
    an = sub.add_parser("analyse", help="Phase 4: concentration, influence index with sensitivity band, say-do gap, anomaly flags, finance network")
    an.add_argument("--draws", type=int, default=500, help="weight draws for the sensitivity band")
    an.add_argument("--seed", type=int, default=20261009)
    an.add_argument("--release", default=None, help="data release tag the warehouse was restored from (default: RESTORED_TAG or local)")
    args = p.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s", stream=sys.stderr)

    if args.cmd == "run":
        ids: list[str] = []
        for t in args.targets:
            if t == "none":
                continue
            elif t == "all":
                ids += list(ADAPTERS)
            elif t in GROUPS:
                ids += [a.source_id for a in GROUPS[t]]
            elif t == "annual":
                ids += sorted(ANNUAL)
            elif t == "monthly":
                # press has its own weekly workflow
                ids += [a.source_id for a in TIER1 + TIER2 + LEGISLATURE + NATIONAL if a.source_id not in ANNUAL]
            else:
                ids.append(t)
        results = []
        _cap_memory()
        budget = float(os.environ.get("SCM_ADAPTER_BUDGET_MIN", "120"))
        for sid in dict.fromkeys(ids):
            if sid not in ADAPTERS:
                print(f"unknown adapter: {sid}", file=sys.stderr)
                return 2
            print(json.dumps({"source_id": sid, "status": "starting", "rss_mb": _rss_mb()}), flush=True)
            adapter = ADAPTERS[sid]()
            rec = with_budget(lambda a=adapter: a.run(fetch=not args.parse_only, parse=not args.fetch_only), budget)
            results.append(rec)
            print(json.dumps({k: rec[k] for k in ("source_id", "status", "rows", "error")} | {"rss_mb": _rss_mb()}), flush=True)
            if args.fail_fast and rec["status"] == "failed":
                return 1
        failed = [r["source_id"] for r in results if r["status"] == "failed"]
        print(json.dumps({"failed": failed, "ok": [r["source_id"] for r in results if r["status"] == "ok"], "skipped": [r["source_id"] for r in results if r["status"] == "skipped"]}))
        return 1 if failed else 0
    if args.cmd == "build":
        print(warehouse.build())
        return 0
    if args.cmd == "analyse":
        from .quant.run import run as analyse

        print(json.dumps(analyse(draws=args.draws, seed=args.seed, release=args.release), indent=1, default=str))
        return 0
    if args.cmd == "classify":
        from .text.pipeline import run_steps

        steps = tuple(x.strip() for x in args.steps.split(",") if x.strip())
        fields = tuple(x.strip() for x in args.fields.split(",") if x.strip())
        try:
            run_steps(steps, limit=args.limit, force=args.force, codebook_version=args.codebook_version, fields=fields)
        except Exception as e:  # noqa: BLE001
            print(json.dumps({"status": "failed", "error": f"{type(e).__name__}: {e}"}), flush=True)
            raise
        return 0
    if args.cmd == "validation":
        from .text import evaluate, sample

        fn = {"draw": lambda: sample.command_draw(args.round, args.n), "adjudicate": lambda: sample.command_adjudicate(args.round),
              "load": lambda: sample.command_load(args.round), "metrics": lambda: evaluate.command_metrics(args.round, args.codebook_version)}[args.action]
        print(json.dumps(fn(), indent=1, default=str))
        return 0
    if args.cmd == "train":
        from .text import train

        print(json.dumps(train.command_train(args.codebook_version, args.round), indent=1, default=str))
        return 0
    if args.cmd == "stats":
        from pathlib import Path

        cur = warehouse.summary()
        print(json.dumps(cur, indent=1))
        if args.write:
            Path(args.write).write_text(json.dumps(cur), encoding="utf-8")
        if args.not_below:
            ref_path = Path(args.not_below)
            if not ref_path.exists():
                print(f"no reference summary at {ref_path}; nothing to compare", file=sys.stderr)
                return 0
            problems = warehouse.check_not_below(cur, json.loads(ref_path.read_text(encoding="utf-8")))
            level = "warning" if args.allow_regression else "error"
            for pr in problems:
                print(f"::{level}::warehouse regression: {pr}", file=sys.stderr)
            return 1 if problems and not args.allow_regression else 0
        return 0
    if args.cmd == "export":
        print(json.dumps(export_site.run(), indent=1)[:2000])
        return 0
    if args.cmd == "liveness":
        res = liveness.run(only=args.ids or None)
        bad = [k for k, v in res["results"].items() if not v["url"]["ok"]]
        print(json.dumps({"checked": len(res["results"]), "failing": bad}))
        return 0
    if args.cmd == "fixtures":
        from .fixtures import record

        print(json.dumps(record(args.ids or None)))
        return 0
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
