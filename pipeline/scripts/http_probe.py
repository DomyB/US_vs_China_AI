"""A read-only probe for the Actions runner: GET each URL given on the command line (or in HTTP_PROBE_URLS, one per
line) and print the status, the content type, the size and the first characters of the answer, so a source's real
response shape can be read in the job log before an adapter is written. Writes nothing."""
from __future__ import annotations

import os
import sys

import requests

UA = "scm-probe/0.1 (+https://github.com/DomyB/US_vs_China_AI; research project, read-only probe)"


def probe(url: str) -> None:
    try:
        r = requests.get(url, headers={"User-Agent": UA, "Accept": "application/json, application/xml, text/csv, */*"}, timeout=90, stream=True)
        body = r.raw.read(4000, decode_content=True)
        print(f"\n### {url}\nstatus {r.status_code} · type {r.headers.get('Content-Type')} · length {r.headers.get('Content-Length')} · final {r.url}")
        for k in ("Content-Disposition", "Last-Modified", "X-RateLimit-Remaining", "Retry-After", "Location"):
            if k in r.headers:
                print(f"{k}: {r.headers[k]}")
        print(body.decode("utf-8", "replace")[:1500])
    except Exception as e:  # noqa: BLE001 - a probe reports every failure the same way
        print(f"\n### {url}\nerror {type(e).__name__}: {e}")


if __name__ == "__main__":
    urls = [u for u in sys.argv[1:] if u.strip()] or [u.strip() for u in os.environ.get("HTTP_PROBE_URLS", "").splitlines() if u.strip()]
    for u in urls:
        probe(u)
