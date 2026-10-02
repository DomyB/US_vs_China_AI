"""Small helpers for CKAN catalogues (datos.gob.ar, catalogodatos.gub.uy, dadosabertos.anm.gov.br)."""
from __future__ import annotations

import io
import re

import pandas as pd

from ..http import Snapshot


def package_search(snap: Snapshot, base: str, name: str, **params) -> list[dict]:
    """Datasets matching a CKAN package_search; records the query and tolerates a failed call."""
    try:
        payload = snap.get_json(f"{base}/api/3/action/package_search", name, params={"rows": 100, **params}, timeout=120)
    except Exception as e:  # noqa: BLE001
        snap.manifest.setdefault("errors", []).append({"name": name, "error": str(e)[:200]})
        return []
    return payload.get("result", {}).get("results", []) if isinstance(payload, dict) else []


def pick_resources(packages: list[dict], words: list[str], formats: tuple[str, ...] = ("csv", "xlsx", "xls", "json"),
                   exclude: tuple[str, ...] = ("metadato", "diccionario", "codebook")) -> list[dict]:
    """Resources whose dataset or resource name contains one of `words`, in one of `formats`,
    most recently modified first; data dictionaries are skipped."""
    out = []
    for pkg in packages:
        ptext = f"{pkg.get('title', '')} {pkg.get('name', '')}".lower()
        for r in pkg.get("resources", []) or []:
            rtext = f"{r.get('name', '')} {r.get('description', '')} {r.get('url', '')}".lower()
            fmt = str(r.get("format", "")).lower() or str(r.get("url", "")).rsplit(".", 1)[-1].lower()
            if any(x in rtext for x in exclude):
                continue
            if fmt in formats and any(w in ptext or w in rtext for w in words):
                out.append({**r, "_package": pkg.get("title"), "_fmt": fmt, "_modified": str(r.get("last_modified") or pkg.get("metadata_modified") or "")})
    out.sort(key=lambda r: r["_modified"], reverse=True)
    return out


def read_table(path, fmt: str | None = None) -> pd.DataFrame:
    """CSV with sniffed separator and encoding, or Excel; everything as strings."""
    fmt = (fmt or path.suffix.lstrip(".")).lower()
    if fmt in ("xlsx", "xls"):
        return pd.read_excel(path, dtype=str).fillna("")
    raw = path.read_bytes()
    for enc in ("utf-8-sig", "utf-8", "latin-1"):
        try:
            text = raw.decode(enc)
            break
        except UnicodeDecodeError:
            continue
    first = text.split("\n", 1)[0]
    sep = max([",", ";", "\t", "|"], key=first.count)
    return pd.read_csv(io.StringIO(text), sep=sep, dtype=str, keep_default_na=False, low_memory=False, on_bad_lines="skip")


def year_of(s: object) -> int | None:
    m = re.search(r"(19|20)\d{2}", str(s or ""))
    return int(m.group(0)) if m else None


def iso_date(s: object) -> str | None:
    t = str(s or "").strip()
    m = re.match(r"(\d{4})-(\d{2})-(\d{2})", t)
    if m:
        return f"{m.group(1)}-{m.group(2)}-{m.group(3)}"
    m = re.match(r"(\d{1,2})[/-](\d{1,2})[/-](\d{4})", t)
    if m:
        return f"{m.group(3)}-{int(m.group(2)):02d}-{int(m.group(1)):02d}"
    return None
