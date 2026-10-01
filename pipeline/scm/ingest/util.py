"""Shared helpers for adapters: tolerant column matching, file readers, mineral tagging."""
from __future__ import annotations

import re
from pathlib import Path

import pandas as pd

from ..registry import minerals


def norm(s: object) -> str:
    return re.sub(r"[^a-z0-9]", "", str(s).lower())


class ColumnError(KeyError):
    pass


def col(df: pd.DataFrame, *candidates: str, required: bool = True) -> str | None:
    """Return the first column of `df` whose normalised name matches a candidate (exact, then prefix)."""
    names = {norm(c): c for c in df.columns}
    for cand in candidates:
        n = norm(cand)
        if n in names:
            return names[n]
    for cand in candidates:
        n = norm(cand)
        for k, v in names.items():
            if k.startswith(n) or n in k:
                return v
    if required:
        raise ColumnError(f"none of {candidates} found; available columns: {list(df.columns)[:40]}")
    return None


def read_any(path: Path, sheet: str | int | None = None, **kw) -> pd.DataFrame:
    suf = path.suffix.lower()
    if suf in (".xlsx", ".xlsm", ".xls"):
        return pd.read_excel(path, sheet_name=sheet if sheet is not None else 0, **kw)
    if suf in (".csv", ".txt"):
        return pd.read_csv(path, **kw)
    if suf == ".json":
        return pd.read_json(path, **kw)
    raise ValueError(f"unsupported file type: {path}")


def sheet_names(path: Path) -> list[str]:
    return pd.ExcelFile(path).sheet_names


def find_header_row(df: pd.DataFrame, must_contain: str, max_rows: int = 30) -> int:
    """Index of the first row whose cells contain `must_contain` (case-insensitive)."""
    key = must_contain.lower()
    for i in range(min(max_rows, len(df))):
        if any(key in str(v).lower() for v in df.iloc[i].tolist()):
            return i
    raise ValueError(f"no header row containing '{must_contain}'")


_KEYWORDS: dict[str, list[str]] = {
    "lithium": ["lithium", "litio", "lítio", "spodumene", "salar"],
    "copper": ["copper", "cobre"],
    "rare_earths": ["rare earth", "rare-earth", "tierras raras", "terras raras", "neodymium", "ree "],
    "niobium": ["niobium", "niobio", "nióbio", "ferroniobium"],
    "graphite": ["graphite", "grafito", "grafite"],
    "nickel": ["nickel", "níquel", "niquel"],
    "tin": ["tin ", "tin,", "estaño", "estanho", "cassiterite"],
    "silver": ["silver", "plata", "prata"],
    "molybdenum": ["molybdenum", "molibdeno", "molibdênio"],
    "cobalt": ["cobalt", "cobalto"],
    "manganese": ["manganese", "manganeso", "manganês"],
    "bauxite_aluminum": ["bauxite", "bauxita", "alumina", "aluminum", "aluminium"],
    "uranium": ["uranium", "uranio", "urânio"],
    "tungsten": ["tungsten", "wolfram", "tungsteno"],
    "zinc": ["zinc", "zinco"],
    "gold": ["gold", " oro", "ouro"],
    "phosphate_potash": ["phosphate", "fosfato", "potash", "potasio", "potássio"],
    "iron_ore": ["iron ore", "mineral de hierro", "minério de ferro", "iron-ore"],
    "titanium": ["titanium", "titanio", "titânio", "ilmenite"],
    "gallium_germanium_antimony": ["gallium", "germanium", "antimony", "antimonio"],
}


def tag_mineral(text: object) -> str | None:
    """First mineral whose keyword appears in the text (lowercased). None if no match."""
    if text is None:
        return None
    t = " " + str(text).lower() + " "
    known = {m["id"] for m in minerals()}
    for mineral, words in _KEYWORDS.items():
        if mineral in known and any(w in t for w in words):
            return mineral
    return None


MINING_WORDS = ["mining", "minería", "mineração", "mineral", "metal", "mine ", "lithium", "copper", "ore", "smelter", "refiner"]


def is_mining_related(text: object) -> bool:
    t = " " + str(text or "").lower() + " "
    return any(w in t for w in MINING_WORDS)


def origin_from_text(text: object) -> str:
    t = str(text or "").lower()
    if any(w in t for w in ["china", "chinese", "sinopec", "cnpc", "cosco", "minmetals", "zijin", "ganfeng", "tianqi", "cmoc", "catl", "byd", "chinalco", "cnooc", "huawei", "state grid"]):
        return "CN"
    if any(w in t for w in ["united states", " u.s.", "usa", "american", "dfc", "ex-im", "exim", "opic"]):
        return "US"
    return "other"
