"""routes.json: where the ore goes, and where the two buyers get it, from the reconciled (BACI) trade rows.

Three views, every one a plain sum of `reconciled` rows (DECISIONS 92): the buyers' imports by origin (reporter USA or
CHN, flow M, every exporter), the twenty countries' exports by destination (flow X, summed over the reporters that
carry a world total that year), and the intermediaries, the economies that take most of the region's tracked
exports, with their imports from the region against their world imports and their exports to each buyer against
their world exports. The indirect route (Chile -> Canada -> United States) is bounded in the browser by the smaller
of the two legs; the file carries the legs, not a trace, because the same HS6 code on both legs proves nothing about
the ore's origin and processing changes the code. A cell without a row is absent; the rest-of-world cell of a
ranking is the world total minus the named partners, only when the world total exists.
"""
from __future__ import annotations

from collections import defaultdict

from .registry import IN_SCOPE

BUYERS = ("USA", "CHN")
TOP_ORIGINS = 15
TOP_DESTINATIONS = 15
TOP_COUNTRY_DESTINATIONS = 10


def _num(v: object) -> float | None:
    try:
        f = float(v)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None
    return None if f != f else f


def _cells(trade_rows: list[dict]) -> tuple[dict[tuple[str, str, str, int, str], float], str | None]:
    """(reporter, partner, mineral, year, flow) -> US$ for the reconciled rows, with an "all" mineral added per key."""
    cells: dict[tuple[str, str, str, int, str], float] = defaultdict(float)
    source_id = None
    for r in trade_rows:
        if r.get("value_type") != "reconciled":
            continue
        v = _num(r.get("value_usd"))
        if v is None or not r.get("mineral") or r.get("mineral") == "all":
            continue
        source_id = source_id or r.get("source_id")
        key = (r["reporter"], r["partner"], r["mineral"], int(r["year"]), r["flow"])
        cells[key] += v
        cells[(r["reporter"], r["partner"], "all", int(r["year"]), r["flow"])] += v
    return dict(cells), source_id


def _ranking(by_partner: dict[str, float], wld: float | None, top: int) -> list[tuple[str, float]]:
    """The top partners by value, then the rest of the world (world minus the named) and the world total."""
    named = sorted(((p, v) for p, v in by_partner.items() if p != "WLD"), key=lambda kv: (-kv[1], kv[0]))[:top]
    out = list(named)
    if wld is not None:
        rest = wld - sum(v for _, v in named)
        out.append(("ROW", max(rest, 0.0)))
        out.append(("WLD", wld))
    return out


def routes_file(trade_rows: list[dict], today: str) -> dict:
    cells, source_id = _cells(trade_rows)
    scope = set(IN_SCOPE)
    musd = lambda v: round(v / 1e6, 3)  # noqa: E731
    # the buyers' imports by origin
    origins: list[dict] = []
    buyer_cells: dict[tuple[str, str, int], dict[str, float]] = defaultdict(dict)
    for (rep, par, mineral, year, flow), v in cells.items():
        if rep in BUYERS and flow == "M":
            buyer_cells[(rep, mineral, year)][par] = v
    for (buyer, mineral, year), by_partner in sorted(buyer_cells.items()):
        for p, v in _ranking(by_partner, by_partner.get("WLD"), TOP_ORIGINS):
            origins.append({"buyer": buyer, "year": year, "mineral": mineral, "origin": p, "musd": musd(v), "in_scope": p in scope})
    # the region's exports by destination, summed over the reporters with a world total that year
    dest_cells: dict[tuple[str, int], dict[str, float]] = defaultdict(lambda: defaultdict(float))
    reporters: dict[tuple[str, int], set[str]] = defaultdict(set)
    country_cells: dict[tuple[str, int], dict[str, float]] = defaultdict(dict)
    for (rep, par, mineral, year, flow), v in cells.items():
        if rep in scope and flow == "X":
            dest_cells[(mineral, year)][par] += v
            if par == "WLD":
                reporters[(mineral, year)].add(rep)
            if mineral == "all":
                country_cells[(rep, year)][par] = v
    destinations: list[dict] = []
    for (mineral, year), by_partner in sorted(dest_cells.items()):
        for p, v in _ranking(dict(by_partner), by_partner.get("WLD"), TOP_DESTINATIONS):
            destinations.append({"year": year, "mineral": mineral, "dest": p, "musd": musd(v), "n": len(reporters[(mineral, year)]), "buyer": p in BUYERS, "in_scope": p in scope})
    country_destinations: list[dict] = []
    for (rep, year), by_partner in sorted(country_cells.items()):
        for p, v in _ranking(by_partner, by_partner.get("WLD"), TOP_COUNTRY_DESTINATIONS):
            country_destinations.append({"iso3": rep, "year": year, "dest": p, "musd": musd(v)})
    # the intermediaries: every reporter that is neither in scope nor a buyer, with its two legs
    via_cells: dict[tuple[str, str, int], dict] = {}
    for (rep, par, mineral, year, flow), v in cells.items():
        if rep in scope or rep in BUYERS:
            continue
        c = via_cells.setdefault((rep, mineral, year), {"iso3": rep, "mineral": mineral, "year": year, "from_region_musd": None, "imports_wld_musd": None, "to_US_musd": None, "to_CN_musd": None, "exports_wld_musd": None, "from": {}})
        if flow == "M" and par in scope:
            c["from_region_musd"] = (c["from_region_musd"] or 0.0) + musd(v)
            c["from"][par] = musd(v)
        elif flow == "M" and par == "WLD":
            c["imports_wld_musd"] = musd(v)
        elif flow == "X" and par == "USA":
            c["to_US_musd"] = musd(v)
        elif flow == "X" and par == "CHN":
            c["to_CN_musd"] = musd(v)
        elif flow == "X" and par == "WLD":
            c["exports_wld_musd"] = musd(v)
    via = []
    for c in sorted(via_cells.values(), key=lambda c: (c["iso3"], c["mineral"], c["year"])):
        if c["from_region_musd"] is not None:
            c["from_region_musd"] = round(c["from_region_musd"], 3)
        c["from"] = dict(sorted(c["from"].items(), key=lambda kv: (-kv[1], kv[0])))
        via.append(c)
    # the intermediaries ranked by what they took from the region over the whole period (all minerals)
    taken: dict[str, float] = defaultdict(float)
    for c in via:
        if c["mineral"] == "all" and c["from_region_musd"] is not None:
            taken[c["iso3"]] += c["from_region_musd"]
    intermediaries = [iso for iso, _ in sorted(taken.items(), key=lambda kv: (-kv[1], kv[0]))]
    years = sorted({k[3] for k in cells})
    return {
        "dataset": "REAL", "generated_on": today, "layer": "facts", "value_type": "reconciled", "source_id": source_id,
        "years": years, "minerals": sorted({k[2] for k in cells}), "buyers": list(BUYERS), "intermediaries": intermediaries,
        "origins": origins, "destinations": destinations, "country_destinations": country_destinations, "via": via,
        "note": "Reconciled bilateral trade (CEPII BACI, one figure per exporter, importer, HS6 code and year after matching both sides' reports), US$ million, summed over the registry's HS6 codes of each mineral. "
                "The buyers' imports are by origin as BACI records them; the region's exports are summed over the countries with a world total that year; an intermediary's two legs are its imports from the region and its exports to a buyer in the same product codes. "
                "The indirect route is an upper bound, never a trace: trade data links no shipment to another, processing changes the code, and the smaller leg caps what could have passed through.",
    }
