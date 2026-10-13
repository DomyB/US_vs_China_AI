"""CEPII BACI -> trade_flow (value_type "reconciled").

BACI is CEPII's reconciliation of UN Comtrade: for every exporter, importer, HS6 product and year it keeps one value
(thousand US$, FOB) and one quantity (tonnes) after matching the two sides' reports, so a bilateral flow has a single
figure instead of a reported and a mirror one. The release is one zip of yearly CSVs (columns t, i, j, k, v, q) with a
country-code file; the HS92 edition runs from 1995. The whole zip is about 2.3 GB, so the adapter streams it to the
snapshot directory once, keeps from each yearly CSV every row whose product is one of the registry's HS6 codes (all
exporters and all importers, a few hundred thousand rows a year) as a CSV slice in the snapshot, and deletes the zip.

The parse keeps three views of the slices, all as `reconciled` rows with reported_by "BCI":
  * the twenty countries as exporters toward every destination (flow X), and as importers from China and the
    United States (flow M);
  * China and the United States as importers from every origin (flow M, reporter CHN or USA), which is where either
    buyer gets the ore from, directly;
  * the intermediaries: the economies that take most of the twenty countries' exports of the tracked products
    (the top BACI_VIA_TOP by value over the whole period, China and the United States aside), as importers from
    the twenty countries (flow M) and as exporters to China and the United States (flow X), so a page can bound the
    indirect route (Chile -> Canada -> United States). The same HS6 code on both legs is an upper bound, not a trace:
    processing changes the code, and nothing in trade data links one shipment to another.
Every reporter-flow in these views has a WLD partner row, the sum over every partner in the slice (BACI has no
aggregate rows). Nothing from Comtrade is touched: the two sources sit side by side in trade_flow under their value
types and the export decides which one a figure reads (DECISIONS 89).
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
VIA_TOP = int(os.environ.get("BACI_VIA_TOP", "20"))
CSV_RE = re.compile(r"BACI_HS\d{2}_Y(\d{4})_V\d+[a-z]?\.csv$", re.I)
CODES_RE = re.compile(r"country_codes_V\d+[a-z]?\.csv$", re.I)
SLICE_COLUMNS = ["t", "i", "j", "k", "v", "q"]
OUT_COLUMNS = ["reporter", "partner", "reported_by", "hs6", "mineral", "stage", "year", "month", "flow", "value_usd", "qty", "qty_unit", "value_type", "source_record_url"]


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


def slice_year(text: str, keep_codes: set[int] | None, keep_hs6: set[str]) -> list[dict]:
    """The rows of one yearly CSV with a tracked product; with keep_codes, only those with a tracked exporter or importer."""
    rows = []
    for r in csv.DictReader(io.StringIO(text)):
        k = str(r.get("k", "")).strip().zfill(6)
        if k not in keep_hs6:
            continue
        try:
            i, j = int(r["i"]), int(r["j"])
        except (KeyError, ValueError):
            continue
        if keep_codes is not None and i not in keep_codes and j not in keep_codes:
            continue
        rows.append({"t": int(r["t"]), "i": i, "j": j, "k": k, "v": r.get("v"), "q": r.get("q")})
    return rows


def _stream_slice(fh, keep_hs6: set[str], out) -> int:
    """Copy the tracked-product rows of one yearly CSV (any exporter, any importer) to `out`; returns the row count."""
    reader = csv.DictReader(io.TextIOWrapper(fh, encoding="utf-8", errors="replace"))
    writer = csv.writer(out, lineterminator="\n")
    writer.writerow(SLICE_COLUMNS)
    n = 0
    for r in reader:
        k = str(r.get("k", "")).strip().zfill(6)
        if k not in keep_hs6:
            continue
        try:
            writer.writerow([int(r["t"]), int(r["i"]), int(r["j"]), k, r.get("v", ""), r.get("q", "")])
        except (KeyError, ValueError):
            continue
        n += 1
    return n


def _load_slice(snap: Snapshot, name: str) -> pd.DataFrame:
    """One stored slice as a frame with columns t, i, j, k, v, q (the JSON form of the first release is read too)."""
    p = snap.path(name)
    if name.endswith(".json"):
        import json

        rows = json.loads(p.read_text(encoding="utf-8"))
        df = pd.DataFrame(rows, columns=SLICE_COLUMNS) if rows else pd.DataFrame(columns=SLICE_COLUMNS)
    else:
        df = pd.read_csv(p, dtype={"k": str}, keep_default_na=False)
    if df.empty:
        return df
    df["k"] = df["k"].astype(str).str.zfill(6)
    df["v"] = pd.to_numeric(df["v"], errors="coerce")
    df["q"] = pd.to_numeric(df["q"], errors="coerce")
    return df[df["v"].notna()]


def intermediaries(frames: list[pd.DataFrame], codes: dict[int, str], top: int = VIA_TOP) -> list[str]:
    """The economies that take the most of the twenty countries' tracked exports over the whole period, by reconciled
    value, leaving out the twenty themselves, China and the United States."""
    scope = set(IN_SCOPE)
    totals: dict[str, float] = {}
    for df in frames:
        if df.empty:
            continue
        exp = df["i"].map(codes)
        imp = df["j"].map(codes)
        m = exp.isin(scope) & imp.notna() & ~imp.isin(scope) & ~imp.isin(PARTNERS)
        for iso, v in df.loc[m].assign(imp=imp[m]).groupby("imp")["v"].sum().items():
            totals[iso] = totals.get(iso, 0.0) + float(v)
    return [iso for iso, _ in sorted(totals.items(), key=lambda kv: (-kv[1], kv[0]))[:top]]


class BACI(Adapter):
    source_id = "cepii_baci"
    tables = ("trade_flow",)

    def fetch(self, snap: Snapshot) -> None:
        zip_path = snap.get(BACI_URL, "baci.zip", timeout=3600)
        keep_hs6 = set(hs6_to_mineral())
        with zipfile.ZipFile(zip_path) as z:
            names = z.namelist()
            code_file = next((n for n in names if CODES_RE.search(n)), None)
            if code_file:
                text = z.read(code_file).decode("utf-8", "replace")
                snap.write_json("country_codes.json", _country_map(text), BACI_URL, note=code_file)
            for n in sorted(names):
                m = CSV_RE.search(n)
                if not m or int(m.group(1)) < YEAR_FROM:
                    continue
                name = f"baci_{m.group(1)}.csv"
                with z.open(n) as fh, snap.path(name).open("w", encoding="utf-8") as out:
                    kept = _stream_slice(fh, keep_hs6, out)
                snap.record(name, BACI_URL, status=200, note=f"{n}: {kept} rows of the tracked products, every exporter and importer")
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
            codes.update({M49[iso]: iso for iso in IN_SCOPE if iso in M49})
        names = [n for n in sorted(snap.files) if n.startswith("baci_") and snap.has(n)]
        frames = [_load_slice(snap, n) for n in names]
        via = intermediaries(frames, codes)
        scope = set(IN_SCOPE)
        partners = set(PARTNERS)
        via_set = set(via)
        parts: list[pd.DataFrame] = []
        for df in frames:
            if df.empty:
                continue
            df = df.assign(exp=df["i"].map(codes), imp=df["j"].map(codes))
            df = df[df["exp"].notna() & df["imp"].notna() & (df["exp"] != df["imp"]) & df["k"].isin(mapping)]
            if df.empty:
                continue
            x = df.rename(columns={"exp": "reporter", "imp": "partner"}).assign(flow="X")
            m = df.rename(columns={"imp": "reporter", "exp": "partner"}).assign(flow="M")
            x_rep = x["reporter"].isin(scope) | x["reporter"].isin(via_set)
            m_rep = m["reporter"].isin(scope) | m["reporter"].isin(partners) | m["reporter"].isin(via_set)
            both = pd.concat([x[x_rep], m[m_rep]], ignore_index=True)
            wld = both.groupby(["reporter", "k", "t", "flow"], as_index=False).agg(v=("v", "sum"), q=("q", "sum")).assign(partner="WLD")
            keep = both[
                (both["reporter"].isin(scope) & ((both["flow"] == "X") | both["partner"].isin(partners)))
                | (both["reporter"].isin(partners) & (both["flow"] == "M"))
                | (both["reporter"].isin(via_set) & (((both["flow"] == "X") & both["partner"].isin(partners)) | ((both["flow"] == "M") & both["partner"].isin(scope))))
            ]
            parts.append(pd.concat([keep[["reporter", "partner", "k", "t", "flow", "v", "q"]], wld[["reporter", "partner", "k", "t", "flow", "v", "q"]]], ignore_index=True))
        if not parts:
            return {"trade_flow": self.stamp(snap, pd.DataFrame(columns=OUT_COLUMNS))}
        df = pd.concat(parts, ignore_index=True)
        df["mineral"] = df["k"].map(lambda k: mapping[k][0])
        df["stage"] = df["k"].map(lambda k: mapping[k][1])
        df["value_usd"] = df["v"].astype(float) * 1000.0  # thousand US$ -> US$
        df["qty"] = df["q"].astype(float)
        df["qty_unit"] = pd.Series("tonnes", index=df.index, dtype=object).where(df["qty"].notna(), None)
        df["month"] = None
        df["reported_by"] = "BCI"
        df["value_type"] = "reconciled"
        df["source_record_url"] = BACI_URL
        df = df.rename(columns={"k": "hs6", "t": "year"})
        df["year"] = df["year"].astype(int)
        df["qty"] = df["qty"].where(df["qty"].notna(), None)
        out = df[OUT_COLUMNS].sort_values(["reporter", "flow", "year", "hs6", "partner"]).reset_index(drop=True)
        return {"trade_flow": self.stamp(snap, out)}
