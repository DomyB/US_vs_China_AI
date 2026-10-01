"""Loaders for the configuration registry: sources, minerals, HS codes, countries."""
from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

import yaml

from .paths import CONFIG_DIR

SOURCE_DEFAULTS = {"verified_on": "2026-10-01", "verified_method": "search", "auth": "none"}

COUNTRIES: dict[str, str] = {
    "ARG": "Argentina", "BOL": "Bolivia", "BRA": "Brazil", "CHL": "Chile", "COL": "Colombia",
    "ECU": "Ecuador", "GUY": "Guyana", "PRY": "Paraguay", "PER": "Peru", "SUR": "Suriname",
    "URY": "Uruguay", "VEN": "Venezuela",
}
IN_SCOPE = list(COUNTRIES)

# UN M49 numeric codes used by UN Comtrade (USA is 842 in Comtrade).
M49: dict[str, int] = {
    "ARG": 32, "BOL": 68, "BRA": 76, "CHL": 152, "COL": 170, "ECU": 218, "GUY": 328, "PRY": 600,
    "PER": 604, "SUR": 740, "URY": 858, "VEN": 862, "CHN": 156, "USA": 842, "WLD": 0,
}
M49_TO_ISO3 = {v: k for k, v in M49.items()}

# Country name variants seen in finance and investment databases, mapped to ISO3.
NAME_TO_ISO3: dict[str, str] = {
    **{v.lower(): k for k, v in COUNTRIES.items()},
    "venezuela, rb": "VEN", "venezuela (bolivarian republic of)": "VEN", "bolivarian republic of venezuela": "VEN",
    "bolivia (plurinational state of)": "BOL", "plurinational state of bolivia": "BOL",
    "guyana (co-operative republic of)": "GUY", "uruguay (oriental republic of)": "URY",
    "united states": "USA", "united states of america": "USA", "usa": "USA", "us": "USA",
    "china": "CHN", "people's republic of china": "CHN", "prc": "CHN", "hong kong": "HKG", "hong kong sar": "HKG",
}


def iso3_from_name(name: str | None) -> str | None:
    if not name:
        return None
    return NAME_TO_ISO3.get(str(name).strip().lower())


@dataclass(frozen=True)
class Source:
    id: str
    name: str
    url: str
    category: str
    reliability: str
    license: str
    access: str
    language: str
    status: str
    update_frequency: str
    refresh_schedule: str
    coverage_from: int
    coverage_to: int
    scope: str = "international"
    api_url: str | None = None
    countries: tuple[str, ...] = ()
    auth: str = "none"
    notes: str | None = None
    verified_on: str = SOURCE_DEFAULTS["verified_on"]
    verified_method: str = SOURCE_DEFAULTS["verified_method"]
    orientation: str | None = None
    paywall: str | None = None
    python_package: str | None = None
    file: str = ""

    @property
    def raw(self) -> dict:
        return {k: v for k, v in self.__dict__.items() if k != "file"}


def load_source_dicts(config_dir: Path = CONFIG_DIR) -> list[dict]:
    """Merge every registry file; apply defaults. Returns plain dicts (used by build_sources.py)."""
    sources: list[dict] = []
    for path in sorted((config_dir / "sources").glob("*.yaml")):
        data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
        for entry in data.get("sources", []):
            entry = {**SOURCE_DEFAULTS, **entry}
            entry.setdefault("scope", "country" if entry.get("countries") else "international")
            entry["_file"] = path.name
            sources.append(entry)
    return sources


@lru_cache(maxsize=1)
def sources() -> dict[str, Source]:
    out: dict[str, Source] = {}
    for d in load_source_dicts():
        fields = {k: v for k, v in d.items() if k in Source.__dataclass_fields__ and k != "file"}
        fields["countries"] = tuple(d.get("countries") or ())
        fields["verified_on"] = str(d.get("verified_on"))
        out[d["id"]] = Source(file=d["_file"], **fields)
    return out


def source(source_id: str) -> Source:
    try:
        return sources()[source_id]
    except KeyError as e:
        raise KeyError(f"source '{source_id}' is not in the registry") from e


@lru_cache(maxsize=1)
def minerals() -> list[dict]:
    return yaml.safe_load((CONFIG_DIR / "minerals.yaml").read_text(encoding="utf-8"))["minerals"]


def core_minerals() -> list[str]:
    return [m["id"] for m in minerals() if m.get("core")]


@lru_cache(maxsize=1)
def hs_codes() -> list[dict]:
    return yaml.safe_load((CONFIG_DIR / "hs_codes.yaml").read_text(encoding="utf-8"))["hs_codes"]


def hs6_to_mineral() -> dict[str, tuple[str, str]]:
    """hs6 -> (mineral_id, stage). A code shared by two minerals maps to the first listed."""
    out: dict[str, tuple[str, str]] = {}
    for c in hs_codes():
        out.setdefault(c["hs6"], (c["mineral"], c["stage"]))
    return out
