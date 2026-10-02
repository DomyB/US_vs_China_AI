"""Relevance filter for legislative records and headlines.

Accent-insensitive whole-word matching in Spanish, Portuguese, English and Dutch. The rules are
deliberately simple and versioned: every stored row records `keywords_matched` and
`filter_version`, so the filter can be audited from the data and tightened later without
losing track of what each version admitted.
"""
from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field

from ..registry import minerals
from .util import _KEYWORDS

KEYWORDS_VERSION = "2026.10"

MINING_TERMS = [
    # es
    r"miner[ií]a", r"minero?s?", r"minera?s?", r"yacimientos?", r"concesi[oó]n(?:es)? mineras?", r"regal[ií]as mineras?",
    r"c[oó]digo de miner[ií]a", r"salar(?:es)?", r"explotaci[oó]n minera", r"extractiv[oa]s?",
    # pt
    r"minera[cç][aã]o", r"miner[aá]rios?", r"miner[aá]rias?", r"min[eé]rios?", r"lavra", r"cfem", r"garimpo",
    # en
    r"mining", r"mines?", r"minerals?", r"ores?", r"smelters?", r"bauxite",
    # nl
    r"mijnbouw", r"delfstoffen", r"goudwinning", r"bauxiet", r"mijnen",
]
CN_TERMS = [
    r"china", r"chin[oa]s?", r"chin[eê]s(?:a|as|es)?", r"chinese", r"pek[ií]n", r"beijing", r"pequim", r"xi jinping",
    r"huawei", r"cosco", r"tianqi", r"ganfeng", r"zijin", r"cmoc", r"china molybdenum", r"catl", r"byd", r"chinalco", r"mmg",
    r"shougang", r"sinopec", r"cnpc", r"minmetals", r"franja y la ruta", r"rota da seda", r"belt and road", r"taiw[aá]n",
    r"rep[uú]blica popular", r"pcch", r"china development bank", r"banco de desarrollo de china",
]
US_TERMS = [
    r"estados unidos", r"ee\.?\s?uu\.?", r"eua", r"estadounidenses?", r"norteamerican[oa]s?", r"washington", r"casa blanca",
    r"united states", r"u\.s\.", r"american", r"trump", r"biden", r"dfc", r"ex-?im ?bank", r"eximbank", r"albemarle", r"freeport",
    r"southern copper", r"newmont", r"minerals security partnership", r"departamento de estado", r"pent[aá]gono", r"comando sur",
    r"verenigde staten", r"amerikaans[e]?", r"departamento de energ[ií]a", r"usgs",
]
INVESTMENT_TERMS = [r"inversi[oó]n(?:es)?", r"investimentos?", r"investments?", r"pr[eé]stamos?", r"empr[eé]stimos?", r"loans?",
                    r"financiamiento", r"financiamento", r"acuerdos?", r"acordos?", r"agreements?", r"tratados?", r"concesi[oó]n(?:es)?"]


def _fold(text: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", text) if unicodedata.category(c) != "Mn").lower()


def _compile(terms: list[str]) -> re.Pattern:
    return re.compile(r"(?<![\w])(?:" + "|".join(_fold(t) for t in terms) + r")(?![\w])", re.I)


MINING_RE = _compile(MINING_TERMS)
CN_RE = _compile(CN_TERMS)
US_RE = _compile(US_TERMS)
INVEST_RE = _compile(INVESTMENT_TERMS)
MINERAL_RE: dict[str, re.Pattern] = {m: _compile(ws) for m, ws in _KEYWORDS.items()}
_NL_MINERALS = {"lithium": [r"lithium"], "copper": [r"koper"], "gold": [r"goud", r"goudmijn\w*"], "nickel": [r"nikkel"], "bauxite_aluminum": [r"bauxiet"]}
for _m, _ws in _NL_MINERALS.items():
    if _m in MINERAL_RE:
        MINERAL_RE[_m] = _compile(_KEYWORDS[_m] + _ws)


@dataclass
class Relevance:
    minerals: list[str] = field(default_factory=list)
    mining: bool = False
    mentions_us: bool = False
    mentions_cn: bool = False
    matched: list[str] = field(default_factory=list)


def relevance(text: object) -> Relevance:
    t = _fold(str(text or ""))
    rel = Relevance()
    known = {m["id"] for m in minerals()}
    for m, pat in MINERAL_RE.items():
        if m in known:
            hit = pat.search(t)
            if hit:
                rel.minerals.append(m)
                rel.matched.append(hit.group(0))
    for flag, pat in (("mining", MINING_RE), ("mentions_cn", CN_RE), ("mentions_us", US_RE)):
        hit = pat.search(t)
        if hit:
            setattr(rel, flag, True)
            rel.matched.append(hit.group(0))
    return rel


def is_relevant(rel: Relevance, mode: str, text: object = "") -> bool:
    """`parliament`: anything about mining or a tracked mineral (stance coding later needs mining
    records without an explicit actor), plus investment/loan/agreement records that name the US or
    China. `news`: mining or mineral headlines that also name an actor or a tracked mineral."""
    if mode == "parliament":
        if rel.mining or rel.minerals:
            return True
        return (rel.mentions_us or rel.mentions_cn) and bool(INVEST_RE.search(_fold(str(text or ""))))
    if mode == "news":
        return (rel.mining or bool(rel.minerals)) and (rel.mentions_us or rel.mentions_cn or bool(rel.minerals))
    raise ValueError(mode)
