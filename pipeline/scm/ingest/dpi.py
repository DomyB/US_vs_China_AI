"""IDB Database of Political Institutions 2023 -> governance (executive ideology and related)."""
from __future__ import annotations

import pandas as pd

from ..http import Snapshot
from ..registry import IN_SCOPE, iso3_from_name
from .base import Adapter, to_float
from .util import col, read_any

PACKAGE = "https://data.iadb.org/api/3/action/package_show"
PACKAGE_ID = "the-database-of-political-institutions-dpi-2023"
VARS = {"execrlc": "Chief executive party orientation (1 right, 2 centre, 3 left, 0 no information)",
        "yrsoffc": "Years chief executive in office", "checks": "Checks and balances (checks)", "polariz": "Polarization",
        "system": "System (0 presidential, 1 assembly-elected president, 2 parliamentary)"}


class DPI(Adapter):
    source_id = "idb_dpi"
    tables = ("governance",)

    def fetch(self, snap: Snapshot) -> None:
        pkg = snap.get_json(PACKAGE, "package.json", params={"id": PACKAGE_ID})
        resources = pkg.get("result", {}).get("resources", []) if isinstance(pkg, dict) else []
        def fmt(r):
            return str(r.get("format") or r.get("mimetype") or r.get("url", "").rsplit(".", 1)[-1]).lower()

        pick = next((r for r in resources if fmt(r) == "csv"), None) or next((r for r in resources if fmt(r) in ("xlsx", "xls")), None)
        if pick is None:
            raise RuntimeError(f"no CSV/XLSX resource in the DPI package: {[fmt(r) for r in resources]}")
        snap.get(pick["url"], "dpi." + ("csv" if fmt(pick) == "csv" else "xlsx"), timeout=300)

    def parse(self, snap: Snapshot) -> dict[str, pd.DataFrame]:
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
            y = to_float(r[c_year])
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
