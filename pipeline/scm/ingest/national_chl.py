"""Chile: Cochilco Anuario de Estadísticas del Cobre y Otros Minerales (XLSX linked from the page) -> production."""
from __future__ import annotations

import re
from urllib.parse import urljoin

import pandas as pd

from ..http import Snapshot
from .base import Adapter, to_float
from .util import tag_mineral

LINK_RE = re.compile(r"href=[\"']([^\"']+\.(?:xlsx|xls)(?:\?[^\"']*)?)[\"']", re.I)
PROD_COLUMNS = ["country", "mineral", "measure", "year", "qty", "unit", "value_type", "note", "source_record_url"]
YEAR_RE = re.compile(r"^(19|20)\d{2}$")


class Cochilco(Adapter):
    source_id = "chl_cochilco"
    tables = ("production",)
    language = "es"
    respect_robots = True

    def fetch(self, snap: Snapshot) -> None:
        html = snap.get(self.src.url, "page.html", timeout=120).read_text(encoding="utf-8", errors="ignore")
        links = list(dict.fromkeys(urljoin(self.src.url, u) for u in LINK_RE.findall(html)))
        snap.manifest["spreadsheet_links"] = links[:20]
        if not links:
            raise RuntimeError("chl_cochilco: no XLSX link on the anuario page")
        for i, u in enumerate(links[:3]):
            try:
                snap.get(u, f"anuario_{i}.{u.split('?')[0].rsplit('.', 1)[-1].lower()}", timeout=600)
            except Exception as e:  # noqa: BLE001
                snap.manifest.setdefault("errors", []).append({"name": u, "error": str(e)[:200]})
        snap.save()

    def parse(self, snap: Snapshot) -> dict[str, pd.DataFrame]:
        rows: list[dict] = []
        sheets_used: list[str] = []
        for name in sorted(snap.files):
            if not name.startswith("anuario_") or not snap.has(name):
                continue
            try:
                book = pd.ExcelFile(snap.path(name))
            except Exception as e:  # noqa: BLE001
                snap.manifest.setdefault("unparsed", []).append({"name": name, "error": str(e)[:200]})
                continue
            for sheet in book.sheet_names:
                df = book.parse(sheet, header=None, dtype=str).fillna("")
                title = " ".join(str(v) for v in df.iloc[:6].values.ravel() if v)[:400]
                if "producci" not in f"{sheet} {title}".lower():
                    continue
                mineral = tag_mineral(f"{sheet} {title}".replace("Oro", "minería de oro").replace("Plata", "minería de plata"))
                if mineral is None:
                    continue
                # header row = the row with the most four-digit years; years may run across columns
                best, best_n = None, 0
                for i in range(min(25, len(df))):
                    n = sum(1 for v in df.iloc[i] if YEAR_RE.match(str(v).strip()))
                    if n > best_n:
                        best, best_n = i, n
                if best is None or best_n < 3:
                    continue
                years = {j: int(str(v).strip()) for j, v in enumerate(df.iloc[best]) if YEAR_RE.match(str(v).strip())}
                unit = "see source table"
                for um in re.finditer(r"\((?:en )?([^)]+)\)|miles de [a-záéíóú ]+|toneladas[a-z ]*|TMF|onzas?[a-z ]*|kg de [a-z ]+", title, re.I):
                    cand = (um.group(1) or um.group(0)).strip()
                    if cand and not cand.isdigit() and len(cand) > 1:
                        unit = cand[:60]
                        break
                table_title = next((str(v).strip() for v in df.iloc[:6].values.ravel() if str(v).strip() and len(str(v).strip()) > 12), sheet)[:120]
                low_t = table_title.lower()
                if "%" in table_title or "participaci" in low_t or "índice" in low_t or "indice" in low_t or unit in ("%",):
                    continue  # shares and indices are not production quantities
                for i in range(best + 1, len(df)):
                    label = str(df.iloc[i, 0]).strip()
                    if not re.search(r"\bchile\b|^total", label, re.I):
                        continue
                    for j, year in years.items():
                        qty = to_float(df.iloc[i, j])
                        if qty is not None:
                            rows.append({"country": "CHL", "mineral": mineral, "measure": "production", "year": year, "qty": qty, "unit": unit, "value_type": "reported",
                                         "note": f"Cochilco anuario, {sheet} ({table_title}): {label}", "source_record_url": snap.files[name]["url"]})
                    break  # the first Chile/total row of the sheet
                sheets_used.append(sheet)
        snap.manifest["sheets_used"] = sheets_used[:40]
        snap.save()
        out = pd.DataFrame(rows, columns=PROD_COLUMNS)
        if not out.empty:
            out = out.drop_duplicates(subset=["mineral", "year", "note"])
        return {"production": self.stamp(snap, out)}
