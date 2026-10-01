"""Direct liveness check of every registry URL. Writes data/liveness.json.

GitHub Actions runners have open egress; the development sandbox does not, so
this is the first direct contact with most sources. Results feed the Sources page
(`verified_method: direct`).
"""
from __future__ import annotations

import json
import time
from datetime import UTC, datetime
from pathlib import Path

from .http import make_session
from .paths import LIVENESS_FILE
from .registry import load_source_dicts


def check_url(session, url: str, timeout: int = 30) -> dict:
    t0 = time.monotonic()
    try:
        r = session.head(url, allow_redirects=True, timeout=timeout)
        if r.status_code in (403, 405, 404, 501) or r.status_code >= 500:
            r = session.get(url, allow_redirects=True, timeout=timeout, stream=True)
            r.close()
        return {"status": r.status_code, "final_url": r.url, "ok": r.status_code < 400, "ms": int((time.monotonic() - t0) * 1000), "error": None}
    except Exception as e:  # noqa: BLE001
        return {"status": None, "final_url": None, "ok": False, "ms": int((time.monotonic() - t0) * 1000), "error": f"{type(e).__name__}: {str(e)[:200]}"}


def run(out: Path = LIVENESS_FILE, interval: float = 1.0, only: list[str] | None = None) -> dict:
    session = make_session(retries=1)
    results: dict[str, dict] = {}
    for s in load_source_dicts():
        if only and s["id"] not in only:
            continue
        entry = {"checked_at": datetime.now(UTC).isoformat(timespec="seconds"), "url": check_url(session, s["url"])}
        if s.get("api_url") and str(s["api_url"]).startswith("http"):
            time.sleep(interval)
            entry["api_url"] = check_url(session, s["api_url"])
        results[s["id"]] = entry
        time.sleep(interval)
    payload = {"checked_at": datetime.now(UTC).isoformat(timespec="seconds"), "results": results}
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(payload, indent=1), encoding="utf-8")
    return payload
