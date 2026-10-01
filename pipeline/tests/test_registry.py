"""Tests for the source registry and its build script."""

from __future__ import annotations

import sys
from pathlib import Path

import yaml

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

import build_sources  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
BRIEF_COUNTRIES = {"ARG", "BOL", "BRA", "CHL", "COL", "ECU", "GUY", "PRY", "PER", "SUR", "URY", "VEN"}


def test_registry_validates():
    sources = build_sources.load_registry()
    assert len(sources) > 100
    assert build_sources.validate(sources) == []


def test_every_country_has_official_legislature_and_press_sources():
    sources = build_sources.load_registry()
    for iso in BRIEF_COUNTRIES:
        mine = [s for s in sources if iso in (s.get("countries") or [])]
        cats = {s["category"] for s in mine}
        assert "legislature" in cats, iso
        assert "press" in cats, iso
        assert cats & {"trade", "production", "concessions"}, iso


def test_press_sources_document_orientation_and_paywall():
    for s in build_sources.load_registry():
        if s["category"] == "press" and s.get("countries"):
            assert s.get("orientation"), s["id"]
            assert s.get("paywall"), s["id"]


def test_state_media_and_partisan_are_labelled():
    reg = {s["id"]: s for s in build_sources.load_registry()}
    assert reg["xinhua_es"]["reliability"] == "state_media"
    assert reg["guy_chronicle"]["reliability"] == "state_media"
    assert reg["ocmal"]["reliability"] == "partisan"
    assert reg["think_tanks"]["reliability"] == "analysis"


def test_dead_sources_have_replacement_notes():
    for s in build_sources.load_registry():
        if s["status"] == "dead":
            assert s.get("notes"), s["id"]


def test_hs_codes_reference_known_minerals():
    cfg = ROOT / "pipeline" / "config"
    minerals = {m["id"] for m in yaml.safe_load((cfg / "minerals.yaml").read_text())["minerals"]}
    codes = yaml.safe_load((cfg / "hs_codes.yaml").read_text())["hs_codes"]
    seen = set()
    for c in codes:
        assert c["mineral"] in minerals, c
        assert len(c["hs6"]) == 6 and c["hs6"].isdigit(), c
        assert c["stage"] in {"ore", "concentrate", "intermediate", "refined", "product"}, c
        assert (c["hs6"], c["mineral"]) not in seen, c
        seen.add((c["hs6"], c["mineral"]))
    assert {"283691", "260300", "720293", "261590"} <= {c["hs6"] for c in codes}


def test_mineral_tagging_uses_whole_words():
    from scm.ingest.util import tag_mineral

    assert tag_mineral("Petroecuador loan via the Shanghai Free Trade Zone branch") is None
    assert tag_mineral("Bulletin on the Orinoco mining arc") is None
    assert tag_mineral("Cauchari-Olaroz lithium brine project") == "lithium"
    assert tag_mineral("Minería de oro en Madre de Dios") == "gold"
    assert tag_mineral("Chinese Embassy donates supplies to El Oro schools") is None
    assert tag_mineral("Puerto de La Plata, Argentina") is None
    assert tag_mineral("rare-earth separation plant") == "rare_earths"
    assert tag_mineral("San Rafael tin mine (Minsur)") == "tin"
