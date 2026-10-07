"""Credentials never reach a manifest, a fixture or the site."""
from __future__ import annotations

import json
from pathlib import Path

from scm.http import _SECRET_PARAM, MASK, scrub_params

FIXTURES = Path(__file__).parent / "fixtures"


def test_scrub_params_masks_credential_values_only():
    out = scrub_params({"api_key": "abc", "key": "def", "subscription-key": "ghi", "Token": "t", "limit": 250, "q": "lithium"})
    assert out == {"api_key": MASK, "key": MASK, "subscription-key": MASK, "Token": MASK, "limit": 250, "q": "lithium"}
    assert scrub_params(None) == {}


def test_record_masks_params_and_cleans_the_url(snap_factory):
    snap = snap_factory("x", {"a.json": {"ok": 1}})
    snap.record("a.json", "https://api.example.test/v1/bill?api_key=SECRET&format=json", params={"api_key": "SECRET", "format": "json"}, status=200)
    meta = snap.files["a.json"]
    assert meta["params"] == {"api_key": MASK, "format": "json"} and "SECRET" not in json.dumps(meta)


def test_fixtures_carry_no_credentials():
    """Every recorded manifest: params that look like credentials are masked or absent, and no URL carries one."""
    bad = []
    for manifest in FIXTURES.glob("*/manifest.json"):
        data = json.loads(manifest.read_text(encoding="utf-8"))
        for name, meta in (data.get("files") or {}).items():
            for k, v in (meta.get("params") or {}).items():
                if _SECRET_PARAM.match(str(k)) and v not in (MASK, "", None):
                    bad.append(f"{manifest.parent.name}/{name}: param {k}")
            if any(f"{k}=" in str(meta.get("url", "")).lower() for k in ("api_key", "subscription-key", "access_token", "token", "&key=", "?key=")):
                bad.append(f"{manifest.parent.name}/{name}: url")
    assert not bad, bad


def test_get_retries_a_response_cut_off_mid_body(snap_factory, monkeypatch):
    import requests

    monkeypatch.setattr("time.sleep", lambda s: None)
    snap = snap_factory("x", {})
    snap.min_interval = 0
    attempts = []

    class Resp:
        status_code = 200
        url = "https://api.example.test/p"
        history: list = []
        content = b"x"

        def __init__(self, ok):
            self.ok = ok

        def iter_content(self, n):
            if not self.ok:
                raise requests.exceptions.ChunkedEncodingError("Response ended prematurely")
            yield b'{"ok": 1}'

    class Session:
        def get(self, *a, **kw):
            attempts.append(1)
            return Resp(ok=len(attempts) >= 3)

    snap.session = Session()
    path = snap.get("https://api.example.test/p", "p.json")
    assert len(attempts) == 3 and path.read_text() == '{"ok": 1}' and snap.has("p.json")
