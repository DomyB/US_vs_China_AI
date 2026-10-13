"""CEPII BACI -> trade_flow (value_type "reconciled").

BACI is CEPII's reconciliation of UN Comtrade: for every exporter, importer, HS6 product and year it keeps one value
(thousand US$, FOB) and one quantity (tonnes) after matching the two sides' reports, so a bilateral flow has a single
figure instead of a reported and a mirror one. The release is one zip of yearly CSVs (columns t, i, j, k, v, q) with a
country-code file; the HS92 edition runs from 1995. The whole zip is about 2.3 GB, so the adapter streams it to the
snapshot directory once, keeps from each yearly CSV only the rows whose product is one of the registry's HS6 codes
and whose exporter or importer is one of the twenty countries, China or the United States, and stores those slices
as the snapshot's files; the zip itself is deleted after extraction. Rows are stored with reporter = exporter,
partner = importer, flow X, and the importer-side view (flow M, reporter = importer) for the same pairs, both as
`reconciled`, so a case file can read exports and imports with one rule; the world total of a reporter is the sum
over every importer in the file (BACI has no aggregate rows). Nothing from Comtrade is touched: the two sources sit
side by side in trade_flow under their value types and the export decides which one a figure reads (DECISIONS 89).
"""
from __future__ import annotations

import csv
import io
import os
import re
import zipfile
from pathlib import Path

import pandas as pd

from ..http import Snapshot
from ..registry import IN_SCOPE, M49, M49_TO_ISO3, hs6_to_mineral
from .base import Adapter

BACI_URL = os.environ.get("BACI_URL", "https://www.cepii.fr/DATA_DOWNLOAD/baci/data/BACI_HS92_V202501.zip")
PARTNERS = ("CHN", "USA")
YEAR_FROM = int(os.environ.get("BACI_YEAR_FROM", "2000"))
CSV_RE = re.compile(r"BACI_HS\d{2}_Y(\d{4})_V\d+[a-z]?\.csv$", re.I)
CODES_RE = re.compile(r"country_codes_V\d+[a-z]?\.csv$", re.I)


def _country_map(text: str) -> dict[int, str]:
    """BACI country code -> ISO3 from the release's country file (columns country_code, country_name, country_iso2, country_iso3)."""
    out = {}
    for r in csv.DictReader(io.StringIO(text)):
        code = r.get("country_code") or r.get("code")
        iso3 = (r.get("country_iso3") or r.get("iso_3digit_alpha") or "").strip().upper()
        if code and iso3:
            try:
                out[int(code)] = iso3
            except ValueError:
                continue
    return out


def slice_year(text: str, keep_codes: set[int], keep_hs6: set[str]) -> list[dict]:
    """The rows of one yearly CSV with a tracked product and a tracked exporter or importer."""
    rows = []
    for r in csv.DictReader(io.StringIO(text)):
        k = str(r.get("k", "")).strip().zfill(6)
        if k not in keep_hs6:
            continue
        try:
            i, j = int(r["i"]), int(r["j"])
        except (KeyError, ValueError):
            continue
        if i not in keep_codes and j not in keep_codes:
            continue
        rows.append({"t": int(r["t"]), "i": i, "j": j, "k": k, "v": r.get("v"), "q": r.get("q")})
    return rows


class BACI(Adapter):
    source_id = "cepii_baci"
    tables = ("trade_flow",)

    def fetch(self, snap: Snapshot) -> None:
        zip_path = snap.get(BACI_URL, "baci.zip", timeout=3600)
        keep_hs6 = set(hs6_to_mineral())
        codes: dict[int, str] = {}
        with zipfile.ZipFile(zip_path) as z:
            names = z.namelist()
            code_file = next((n for n in names if CODES_RE.search(n)), None)
            if code_file:
                text = z.read(code_file).decode("utf-8", "replace")
                snap.write_json("country_codes.json", _country_map(text), BACI_URL, note=code_file)
                codes = _country_map(text)
            iso_to_code = {v: k for k, v in codes.items()}
            keep_codes = {iso_to_code[iso] for iso in list(IN_SCOPE) + list(PARTNERS) if iso in iso_to_code}
            if not keep_codes:  # the code file is missing: fall back to the UN M49 numbers BACI uses for most countries
                keep_codes = {M49[iso] for iso in list(IN_SCOPE) + list(PARTNERS) if iso in M49}
            for n in sorted(names):
                m = CSV_RE.search(n)
                if not m or int(m.group(1)) < YEAR_FROM:
                    continue
                with z.open(n) as fh:
                    rows = slice_year(io.TextIOWrapper(fh, encoding="utf-8", errors="replace").read(), keep_codes, keep_hs6)
                snap.write_json(f"baci_{m.group(1)}.json", rows, BACI_URL, note=f"{n}: {len(rows)} rows kept of the tracked products and countries")
        Path(zip_path).unlink(missing_ok=True)
        snap.discard("baci.zip", "the 2.3 GB release zip is read once and deleted; the kept slices are the snapshot")

    def parse(self, snap: Snapshot) -> dict[str, pd.DataFrame]:
        import json

        mapping = hs6_to_mineral()
        codes: dict[int, str] = {}
        if snap.has("country_codes.json"):
            codes = {int(k): v for k, v in json.loads(snap.path("country_codes.json").read_text()).items()}
        if not codes:
            codes = dict(M49_TO_ISO3)
        scope = set(IN_SCOPE)
        out: list[dict] = []
        for name in sorted(snap.files):
            if not name.startswith("baci_") or not snap.has(name):
                continue
            for r in json.loads(snap.path(name).read_text()):
                exp, imp = codes.get(r["i"]), codes.get(r["j"])
                if exp is None or imp is None:
                    continue
                mineral, stage = mapping[r["k"]]
                try:
                    value = float(r["v"]) * 1000.0  # thousand US$ -> US$
                except (TypeError, ValueError):
                    continue
                try:
                    qty = float(r["q"]) if r.get("q") not in (None, "", "NA") else None
                except (TypeError, ValueError):
                    qty = None
                base = {"hs6": r["k"], "mineral": mineral, "stage": stage, "year": int(r["t"]), "month": None, "value_usd": value, "qty": qty, "qty_unit": "tonnes" if qty is not None else None,
                        "value_type": "reconciled", "source_record_url": BACI_URL}
                if exp in scope and (imp in PARTNERS or True):
                    out.append({"reporter": exp, "partner": imp, "reported_by": "BCI", "flow": "X", **base})
                if imp in scope and exp != imp:
                    out.append({"reporter": imp, "partner": exp, "reported_by": "BCI", "flow": "M", **base})
        if not out:
            return {"trade_flow": self.stamp(snap, pd.DataFrame(columns=["reporter", "partner", "reported_by", "hs6", "mineral", "stage", "year", "month", "flow", "value_usd", "qty", "qty_unit", "value_type", "source_record_url"]))}
        df = pd.DataFrame(out)
        # the world total per reporter, year, code and flow: BACI carries every partner, so the sum over partners is the total
        wld = df.groupby(["reporter", "hs6", "mineral", "stage", "year", "flow"], as_index=False).agg(value_usd=("value_usd", "sum"), qty=("qty", "sum"))
        wld["partner"] = "WLD"
        wld["reported_by"] = "BCI"
        wld["month"] = None
        wld["qty_unit"] = "tonnes"
        wld["value_type"] = "reconciled"
        wld["source_record_url"] = BACI_URL
        keep = df[df["partner"].isin(PARTNERS)]
        return {"trade_flow": self.stamp(snap, pd.concat([keep, wld[df.columns]], ignore_index=True))}
