"""Peru: BCRPData API -> production (annual mine production series chosen from the series metadata)."""
from __future__ import annotations

import io
import json
import re

import pandas as pd

from ..http import Snapshot
from .base import Adapter, to_float
from .util import tag_mineral

API = "https://estadisticas.bcrp.gob.pe/estadisticas/series/api"
METADATA = "https://estadisticas.bcrp.gob.pe/estadisticas/series/metadata"
FIRST_YEAR, LAST_YEAR = 2000, 2026
PROD_COLUMNS = ["country", "mineral", "measure", "year", "qty", "unit", "value_type", "note", "source_record_url"]
WANT = re.compile(r"producci[oó]n", re.I)
MINERAL_WORDS = re.compile(r"cobre|oro|plata|zinc|esta[ñn]o|molibdeno|hierro|plomo|litio|uranio|tungsteno", re.I)


class BCRP(Adapter):
    source_id = "per_bcrp_api"
    tables = ("production",)
    language = "es"
    min_interval = 1.5

    def fetch(self, snap: Snapshot) -> None:
        snap.get(METADATA, "metadata.csv", timeout=300)
        codes = self._select_codes(snap)
        snap.manifest["series_selected"] = codes
        for i in range(0, len(codes), 10):
            chunk = codes[i:i + 10]
            try:
                snap.get_json(f"{API}/{'-'.join(c for c, _ in chunk)}/json/{FIRST_YEAR}/{LAST_YEAR}/esp", f"series_{i // 10}.json", timeout=120)
            except Exception as e:  # noqa: BLE001
                snap.manifest.setdefault("errors", []).append({"name": f"series_{i // 10}", "error": str(e)[:200]})
        snap.save()

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
        c_code = next((c for c in df.columns if "digo" in str(c).lower() and "serie" in str(c).lower()), df.columns[0])
        c_name = next((c for c in df.columns if "nombre" in str(c).lower()), df.columns[1])
        c_group = next((c for c in df.columns if "grupo" in str(c).lower()), None)
        c_freq = next((c for c in df.columns if "frecuencia" in str(c).lower()), None)
        out: list[tuple[str, str]] = []
        for _, r in df.iterrows():
            full = f"{r[c_group] if c_group else ''} - {r[c_name]}"
            if not (WANT.search(full) and MINERAL_WORDS.search(full) and ("miner" in full.lower() or "metal" in full.lower())):
                continue
            if c_freq and "anual" not in str(r[c_freq]).lower():
                continue
            out.append((str(r[c_code]).strip(), full[:200]))
        return out[:60]

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
