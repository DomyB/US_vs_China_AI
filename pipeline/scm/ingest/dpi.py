"""IDB Database of Political Institutions 2023 -> governance (executive ideology and related)."""
from __future__ import annotations

import os
import re
import time
from urllib.parse import urljoin

import pandas as pd

from ..http import Snapshot
from ..paths import REPO_ROOT
from ..registry import IN_SCOPE, iso3_from_name
from .base import Adapter, fetch_manual, to_float
from .util import col, read_any

PACKAGE = "https://data.iadb.org/api/3/action/package_show"
MANUAL_FILES = ["data/manual/dpi2023.csv", "data/manual/dpi2023.xlsx"]  # IDB open data (CC BY 3.0 IGO)
READY_ATTEMPTS = 12
READY_WAIT_S = 25  # seconds between attempts: the portal generates the file on demand and answered 202 for over a minute in 2026
PACKAGE_ID = "the-database-of-political-institutions-dpi-2023"
VARS = {"execrlc": "Chief executive party orientation (1 right, 2 centre, 3 left, 0 no information)",
        "yrsoffc": "Years chief executive in office", "checks": "Checks and balances (checks)", "polariz": "Polarization",
        "system": "System (0 presidential, 1 assembly-elected president, 2 parliamentary)"}



def _year(v) -> float | None:
    """The year from a number or from a date string: the 2023 CSV writes `2023-01-01` where earlier editions wrote 2023."""
    y = to_float(v)
    if y is not None:
        return y
    m = re.match(r"\s*(\d{4})", str(v) if v is not None else "")
    return float(m.group(1)) if m else None

class DPI(Adapter):
    source_id = "idb_dpi"
    tables = ("governance",)

    def fetch(self, snap: Snapshot) -> None:
        manual = os.environ.get("DPI_FILE_URL") or next((p for p in MANUAL_FILES if (REPO_ROOT / p).exists()), None)
        if manual:
            ext = "csv" if manual.split("?")[0].lower().endswith(".csv") else "xlsx"
            fetch_manual(snap, manual, f"dpi.{ext}", self.src.url, timeout=300)
            snap.manifest["resource_used"] = {"url": manual, "via": "DPI_FILE_URL or data/manual"}
            snap.save()
            return
        pkg = snap.get_json(PACKAGE, "package.json", params={"id": PACKAGE_ID})
        resources = pkg.get("result", {}).get("resources", []) if isinstance(pkg, dict) else []

        def fmt(r):
            return str(r.get("format") or r.get("mimetype") or r.get("url", "").rsplit(".", 1)[-1]).lower()

        candidates = [r for r in resources if fmt(r) == "csv"] + [r for r in resources if fmt(r) in ("xlsx", "xls")]
        if not candidates:
            raise RuntimeError(f"no CSV/XLSX resource in the DPI package: {[fmt(r) for r in resources]}")
        errors = []
        for r in candidates:
            ext = "csv" if fmt(r) == "csv" else "xlsx"
            urls = [r.get("url"), r.get("download_url"), f"https://data.iadb.org/dataset/{PACKAGE_ID}/resource/{r.get('id')}/download"]
            # the resource page may carry the current download link when the stored URL is stale
            page = f"https://data.iadb.org/dataset/{PACKAGE_ID}/resource/{r.get('id')}"
            try:
                html = snap.get(page, f"resource_{ext}.html", timeout=120).read_text(encoding="utf-8", errors="ignore")
                urls += [urljoin(page, h) for h in re.findall(r'href="([^"]*(?:download|\.csv|\.xlsx)[^"]*)"', html, re.I)]
            except Exception as e:  # noqa: BLE001
                errors.append(f"{page}: {str(e)[:120]}")
            for url in dict.fromkeys(u for u in urls if u):
                try:
                    if self._download_when_ready(snap, url, f"dpi.{ext}", ext):
                        snap.manifest["resource_used"] = {"id": r.get("id"), "name": r.get("name"), "url": url}
                        snap.save()
                        return
                    errors.append(f"{url}: still 202 (file not ready) after {READY_ATTEMPTS} attempts")
                except Exception as e:  # noqa: BLE001
                    errors.append(f"{url}: {str(e)[:120]}")
        snap.manifest["errors"] = errors
        snap.save()
        raise RuntimeError("DPI: every resource download failed (set DPI_FILE_URL to a working link): " + " | ".join(errors))

    @staticmethod
    def _download_when_ready(snap: Snapshot, url: str, name: str, ext: str) -> bool:
        """data.iadb.org answers 202 Accepted while it generates a download; retry until 200 with real content."""
        for attempt in range(READY_ATTEMPTS):
            snap.get(url, name, timeout=300, force=True, allow_statuses=(200, 202))
            status = snap.files[name]["status"]
            if status == 200 and snap.looks_like(name, ext):
                return True
            if attempt == 0:
                snap.manifest.setdefault("not_ready_bodies", []).append({"url": url, "status": status, "body": snap.path(name).read_text(encoding="utf-8", errors="ignore")[:600]})
            snap.path(name).unlink(missing_ok=True)
            snap.files.pop(name, None)
            if status == 200:
                return False  # 200 but not the expected file type (an HTML page)
            time.sleep(READY_WAIT_S)
        return False

    def parse(self, snap: Snapshot) -> dict[str, pd.DataFrame]:  # noqa: D102
        path = next(snap.path(n) for n in snap.files if n.startswith("dpi."))
        df = read_any(path)
        c_name = col(df, "countryname", "country")
        c_iso = col(df, "ifs", "iso3", "countrycode", required=False)
        c_year = col(df, "year")
        rows: list[dict] = []
        for _, r in df.iterrows():
            iso = (str(r[c_iso]).upper() if c_iso and pd.notna(r[c_iso]) else None) or iso3_from_name(r[c_name])
            if iso not in IN_SCOPE:
                continue
            y = _year(r[c_year])
            if y is None or y < 2000:
                continue
            for var, name in VARS.items():
                c = col(df, var, required=False)
                if c is None:
                    continue
                rows.append({"country": iso, "year": int(y), "indicator": f"dpi_{var}", "indicator_name": name, "value": to_float(r[c]), "source_record_url": snap.files[path.name]["url"]})
        out = pd.DataFrame(rows, columns=["country", "year", "indicator", "indicator_name", "value", "source_record_url"])
        out["value_type"] = "reported"
        return {"governance": self.stamp(snap, out)}
