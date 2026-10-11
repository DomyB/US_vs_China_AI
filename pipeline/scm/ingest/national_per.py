"""Peru: BCRPData API -> production (annual mine production series chosen from the series metadata).

The series list comes from the metadata export when it answers CSV; since 2026-10-04 that endpoint answers
an Incapsula (Imperva) bot-challenge page instead, so the adapter falls back to the committed list in
pipeline/config/bcrp_series.json (the selection of the last successful metadata read) and only requests the
JSON API. The manifest says which (`series_source`: metadata | fallback).
"""
from __future__ import annotations

import io
import json
import re

import pandas as pd
import requests

from ..http import FetchError, Snapshot
from ..paths import CONFIG_DIR
from .base import Adapter, to_float
from .util import tag_mineral

API = "https://estadisticas.bcrp.gob.pe/estadisticas/series/api"
METADATA = "https://estadisticas.bcrp.gob.pe/estadisticas/series/metadata"
SERIES_FALLBACK = CONFIG_DIR / "bcrp_series.json"
FIRST_YEAR, LAST_YEAR = 2000, 2026
PROD_COLUMNS = ["country", "mineral", "measure", "year", "qty", "unit", "value_type", "note", "source_record_url"]
WANT = re.compile(r"producci[oó]n", re.I)
MINERAL_WORDS = re.compile(r"cobre|oro|plata|zinc|esta[ñn]o|molibdeno|hierro|plomo|litio|uranio|tungsteno", re.I)


def fallback_series() -> list[tuple[str, str]]:
    """The committed [code, name] pairs, or [] when the file is missing."""
    if not SERIES_FALLBACK.exists():
        return []
    payload = json.loads(SERIES_FALLBACK.read_text(encoding="utf-8"))
    return [(str(c), str(n)) for c, n in payload.get("series", [])]


class BCRP(Adapter):
    source_id = "per_bcrp_api"
    tables = ("production",)
    language = "es"
    min_interval = 1.5

    def fetch(self, snap: Snapshot) -> None:
        codes = self._codes_from_metadata(snap)
        if codes is None:
            codes = fallback_series()
            snap.manifest["series_source"] = "fallback"
            if not codes:
                raise FetchError(f"{self.source_id}: metadata endpoint answered an HTML page (Incapsula challenge), not CSV, "
                                 f"and no fallback series list exists at {SERIES_FALLBACK}")
        else:
            snap.manifest["series_source"] = "metadata"
        snap.manifest["series_selected"] = codes
        for i in range(0, len(codes), 10):
            chunk = codes[i:i + 10]
            try:
                snap.get_json(f"{API}/{'-'.join(c for c, _ in chunk)}/json/{FIRST_YEAR}/{LAST_YEAR}/esp", f"series_{i // 10}.json", timeout=120)
            except Exception as e:  # noqa: BLE001
                snap.manifest.setdefault("errors", []).append({"name": f"series_{i // 10}", "error": str(e)[:200]})
        snap.save()

    def _codes_from_metadata(self, snap: Snapshot) -> list[tuple[str, str]] | None:
        """The series chosen from the metadata export, or None when that download is unusable (the answer is
        not CSV, e.g. the Incapsula challenge page, or the request itself fails); the reason is in the manifest."""
        try:
            snap.get(METADATA, "metadata.csv", timeout=300)
        except (FetchError, requests.RequestException) as e:
            snap.manifest.setdefault("errors", []).append({"name": "metadata.csv", "error": f"metadata endpoint: {str(e)[:300]}"})
            return None
        if not snap.looks_like("metadata.csv", "csv"):
            snap.discard("metadata.csv", "metadata endpoint answered an HTML page (Incapsula challenge), not CSV; using the committed series list")
            return None
        codes = self._select_codes(snap)
        if not codes:
            snap.discard("metadata.csv", "metadata export lists no annual mine-production series; using the committed series list")
            return None
        return codes

    def _select_codes(self, snap: Snapshot) -> list[tuple[str, str]]:
        raw = snap.path("metadata.csv").read_bytes()
        try:
            text = raw.decode("utf-8-sig")
        except UnicodeDecodeError:
            text = raw.decode("latin-1")  # the metadata export is Latin-1 (accents were lost in the first live run)
        first = text.split("\n", 1)[0]
        sep = max([",", ";", "\t"], key=first.count)
        df = pd.read_csv(io.StringIO(text), sep=sep, dtype=str, keep_default_na=False, on_bad_lines="skip", engine="python")
        snap.manifest["metadata_columns"] = list(map(str, df.columns))[:20]
        if len(df.columns) < 2:
            return []  # not the metadata table (a one-column frame is what an HTML page parses to)
        c_code = next((c for c in df.columns if "digo" in str(c).lower() and "serie" in str(c).lower()), df.columns[0])
        c_name = next((c for c in df.columns if "nombre" in str(c).lower()), df.columns[1])
        c_group = next((c for c in df.columns if "grupo" in str(c).lower()), None)
        c_freq = next((c for c in df.columns if "frecuencia" in str(c).lower()), None)
        scored: list[tuple[int, str, str]] = []
        for _, r in df.iterrows():
            group = str(r[c_group]) if c_group else ""
            full = f"{group} - {r[c_name]}"
            low = full.lower()
            if not (WANT.search(full) and MINERAL_WORDS.search(full) and ("miner" in low or "metal" in low)):
                continue
            if c_freq and "anual" not in str(r[c_freq]).lower():
                continue
            # quantities, not growth rates or indices; national series before departmental ones
            if any(k in low for k in ("variaci", "porcentual", "índice", "indice", "%")):
                continue
            unit_hint = any(k in low for k in ("tmf", "tonelada", "onza", "kg", "gr", "miles", "libras", "tm.f", "t.m."))
            score = (2 if "principales productos" in low else 0) + (1 if unit_hint else 0) - (2 if "departamento" in low else 0)
            scored.append((score, str(r[c_code]).strip(), full[:200]))
        scored.sort(key=lambda x: -x[0])
        return [(code, name) for _, code, name in scored[:60]]

    def parse(self, snap: Snapshot) -> dict[str, pd.DataFrame]:
        rows: list[dict] = []
        for name in sorted(snap.files):
            if not name.startswith("series_") or not snap.has(name):
                continue
            try:
                payload = json.loads(snap.path(name).read_text(encoding="utf-8"))
            except json.JSONDecodeError:
                snap.manifest.setdefault("unparsed", []).append(name)
                continue
            series = payload.get("config", {}).get("series", []) if isinstance(payload, dict) else []
            for p in payload.get("periods", []) if isinstance(payload, dict) else []:
                m = re.search(r"(19|20)\d{2}", str(p.get("name", "")))
                if not m:
                    continue
                year = int(m.group(0))
                for s, val in zip(series, p.get("values", []), strict=False):
                    title = str(s.get("name", ""))
                    mineral = tag_mineral(title.replace("Oro", "minería de oro").replace("Plata", "minería de plata"))
                    qty = to_float(val)
                    if mineral is None or qty is None:
                        continue
                    um = re.search(r"\(([^)]+)\)", title)
                    rows.append({"country": "PER", "mineral": mineral, "measure": "production", "year": year, "qty": qty, "unit": um.group(1) if um else "see series name",
                                 "value_type": "reported", "note": f"BCRPData: {title}", "source_record_url": snap.files[name]["url"]})
        return {"production": self.stamp(snap, pd.DataFrame(rows, columns=PROD_COLUMNS))}
