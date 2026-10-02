"""Polite HTTP client and immutable raw snapshots.

Every download is written under data/raw/<source_id>/<date>/ with a manifest that
records URL, parameters, status, size, SHA-256 and retrieval time. Parsers read
only from a snapshot, never from the network, so tests can point a snapshot at a
fixtures directory.
"""
from __future__ import annotations

import hashlib
import json
import re
import time
from dataclasses import dataclass, field
from datetime import UTC, date, datetime
from pathlib import Path
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

from .paths import RAW_DIR

USER_AGENT = "scm-critical-minerals-research/0.2 (+https://github.com/DomyB/US_vs_China_AI; academic, non-commercial)"


def make_session(retries: int = 4, backoff: float = 1.5) -> requests.Session:
    s = requests.Session()
    retry = Retry(total=retries, backoff_factor=backoff, status_forcelist=(429, 500, 502, 503, 504),
                  allowed_methods=frozenset({"GET", "HEAD"}), raise_on_status=False)
    s.mount("https://", HTTPAdapter(max_retries=retry))
    s.mount("http://", HTTPAdapter(max_retries=retry))
    s.headers.update({"User-Agent": USER_AGENT, "Accept": "*/*"})
    return s


# Query parameters that carry credentials or signatures (presigned S3/Azure/GCS links, API keys).
# They are stripped from every recorded URL so manifests and site JSON never contain a secret-looking
# token; GitHub push protection rejects commits that do (observed with Harvard Dataverse's S3 redirects).
_SECRET_PARAM = re.compile(r"(?i)^(x-amz-.*|awsaccesskeyid|signature|expires|sig|se|sv|sp|sr|st|token|access_token|"
                           r"api[_-]?key|subscription-key|x-goog-.*|response-content-.*)$")


def clean_url(url: str | None) -> str | None:
    """Return `url` without credential-bearing query parameters."""
    if not url:
        return url
    parts = urlsplit(url)
    if not parts.query:
        return url
    kept = [(k, v) for k, v in parse_qsl(parts.query, keep_blank_values=True) if not _SECRET_PARAM.match(k)]
    return urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(kept, doseq=True, safe=",:"), parts.fragment))


def sha256_of(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


class RobotsDisallowed(RuntimeError):
    """robots.txt of the host forbids fetching this URL for our user agent."""


class FetchError(RuntimeError):
    pass


@dataclass
class Snapshot:
    """A dated directory of raw files for one source, with a manifest."""

    source_id: str
    dir: Path
    manifest: dict = field(default_factory=dict)
    session: requests.Session | None = None
    min_interval: float = 1.0
    robots: object | None = None  # scm.robots.RobotsCache when the adapter respects robots.txt
    _last_request: float = 0.0

    @classmethod
    def today(cls, source_id: str, base: Path = RAW_DIR, **kw) -> Snapshot:
        d = base / source_id / date.today().isoformat()
        return cls.open(source_id, d, **kw)

    @classmethod
    def open(cls, source_id: str, d: Path, **kw) -> Snapshot:
        d.mkdir(parents=True, exist_ok=True)
        mf = d / "manifest.json"
        manifest = json.loads(mf.read_text(encoding="utf-8")) if mf.exists() else {"source_id": source_id, "files": {}}
        return cls(source_id=source_id, dir=d, manifest=manifest, **kw)

    @classmethod
    def latest(cls, source_id: str, base: Path = RAW_DIR) -> Snapshot | None:
        root = base / source_id
        if not root.exists():
            return None
        dirs = sorted(p for p in root.iterdir() if p.is_dir() and (p / "manifest.json").exists())
        return cls.open(source_id, dirs[-1]) if dirs else None

    # ---- manifest helpers
    @property
    def files(self) -> dict[str, dict]:
        return self.manifest["files"]

    def path(self, name: str) -> Path:
        return self.dir / name

    def has(self, name: str) -> bool:
        return name in self.files and self.path(name).exists()

    def retrieved_at(self, name: str | None = None) -> str:
        if name and name in self.files:
            return self.files[name]["retrieved_at"]
        times = [f["retrieved_at"] for f in self.files.values()]
        return max(times) if times else datetime.now(UTC).isoformat(timespec="seconds")

    def record(self, name: str, url: str, params: dict | None = None, status: int | None = None, note: str | None = None,
               final_url: str | None = None) -> None:
        p = self.path(name)
        self.files[name] = {
            "url": clean_url(url), "params": params or {}, "status": status, "bytes": p.stat().st_size if p.exists() else 0,
            **({"final_url": clean_url(final_url)} if final_url and final_url != url else {}),
            "sha256": sha256_of(p) if p.exists() else None,
            "retrieved_at": datetime.now(UTC).isoformat(timespec="seconds"), "note": note,
        }
        self.save()

    def save(self) -> None:
        (self.dir / "manifest.json").write_text(json.dumps(self.manifest, indent=1, ensure_ascii=False, default=str), encoding="utf-8")

    # ---- network
    def _throttle(self) -> None:
        wait = self.min_interval - (time.monotonic() - self._last_request)
        if wait > 0:
            time.sleep(wait)
        self._last_request = time.monotonic()

    def get(self, url: str, name: str, params: dict | None = None, headers: dict | None = None,
            timeout: int = 120, force: bool = False, allow_statuses: tuple[int, ...] = (200,)) -> Path:
        """Download `url` into the snapshot as `name` (skipped if already present) and return its path."""
        target = self.path(name)
        if self.has(name) and not force:
            return target
        if self.session is None:
            self.session = make_session()
        self._check_robots(url)
        self._throttle()
        resp = self.session.get(url, params=params, headers=headers, timeout=timeout, stream=True)
        if resp.status_code not in allow_statuses:
            body = resp.text[:500] if resp.content else ""
            raise FetchError(f"{self.source_id}: GET {resp.url} -> {resp.status_code} {body}")
        target.parent.mkdir(parents=True, exist_ok=True)
        with target.open("wb") as f:
            for chunk in resp.iter_content(1 << 16):
                f.write(chunk)
        # Provenance keeps the URL we asked for (stable, citable); a redirect target (often a signed storage
        # link) is kept separately with its signature removed.
        requested = requests.Request("GET", url, params=params).prepare().url or url
        self.record(name, requested if resp.history else resp.url, params=params, status=resp.status_code,
                    final_url=resp.url if resp.history else None)
        return target

    def discard(self, name: str, reason: str) -> None:
        """Drop a downloaded file from the snapshot (and record why) when its content is not usable."""
        self.manifest.setdefault("errors", []).append({"name": name, "error": reason[:400]})
        self.path(name).unlink(missing_ok=True)
        self.files.pop(name, None)
        self.save()

    def looks_like(self, name: str, kind: str) -> bool:
        """Cheap content sniff: 'xlsx'/'zip' must start with the zip magic, 'csv' must not be HTML."""
        head = self.path(name).open("rb").read(512)
        if kind in ("xlsx", "zip"):
            return head.startswith(b"PK")
        return not head.lstrip().lower().startswith((b"<!doctype", b"<html", b"<?xml"))

    def _check_robots(self, url: str) -> None:
        if self.robots is None:
            return
        if not self.robots.allowed(url):  # type: ignore[attr-defined]
            self.manifest.setdefault("robots_blocked", []).append(url)
            self.save()
            raise RobotsDisallowed(f"{self.source_id}: robots.txt disallows {url}")
        delay = self.robots.crawl_delay(url)  # type: ignore[attr-defined]
        if delay and delay > self.min_interval:
            self.min_interval = float(delay)

    def get_xml(self, url: str, name: str, **kw):
        """GET an XML document (RSS, Atom, SOAP) and return its parsed root element."""
        import xml.etree.ElementTree as ET

        p = self.get(url, name, **kw)
        return ET.fromstring(p.read_bytes())

    def post_json(self, url: str, name: str, json_body: dict, headers: dict | None = None, timeout: int = 120,
                  force: bool = False, allow_statuses: tuple[int, ...] = (200,)) -> dict | list:
        """POST a JSON body (some legislative APIs only answer POST) and store the JSON response."""
        target = self.path(name)
        if not (self.has(name) and not force):
            if self.session is None:
                self.session = make_session()
            self._check_robots(url)
            self._throttle()
            resp = self.session.post(url, json=json_body, headers=headers, timeout=timeout)
            if resp.status_code not in allow_statuses:
                raise FetchError(f"{self.source_id}: POST {url} -> {resp.status_code} {resp.text[:500]}")
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(resp.content)
            self.record(name, url, params={"json": json_body}, status=resp.status_code)
        return json.loads(target.read_text(encoding="utf-8"))

    def get_json(self, url: str, name: str, **kw) -> dict | list:
        p = self.get(url, name, **kw)
        return json.loads(p.read_text(encoding="utf-8"))

    def write_json(self, name: str, obj: object, url: str, params: dict | None = None, note: str | None = None) -> Path:
        p = self.path(name)
        p.write_text(json.dumps(obj, ensure_ascii=False), encoding="utf-8")
        self.record(name, url, params=params, status=200, note=note)
        return p
