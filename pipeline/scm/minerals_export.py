"""The mineral case files: one file per tracked mineral with everything the warehouse holds about it, and an index.

`minerals.json` lists every mineral of the registry (`config/minerals.yaml`) with its lists, its curated note on uses
and importance (the registry's own text, sourced), the countries that produce or explore it, and counts of what the
case file holds. `minerals/<id>.json` carries production and reserves by country and year (USGS, BGS, national series),
reported exports and imports by country and year to China, the United States and the world (UN Comtrade, the Census
mirror where it stands in), the price series, the concessions with coordinates where a cadastre is ingested, the HS6
codes that define the mineral in trade, and the per-mineral index rows. Nothing is estimated: a country without a row
is absent, a partner cell without a row is null.
"""
from __future__ import annotations

import math
from collections import defaultdict

from .registry import COUNTRIES, IN_SCOPE, hs_codes, minerals

ACTORS = ("CHN", "USA", "WLD")
ACTOR_KEY = {"CHN": "CN", "USA": "US", "WLD": "WLD"}


def _num(v: object) -> float | None:
    if v is None or (isinstance(v, float) and math.isnan(v)):
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _src(sid: str | None, url: str | None) -> dict | None:
    return {"id": sid, "url": url} if sid else None


def mineral_trade(trade_rows: list[dict], mineral: str) -> list[dict]:
    """Per reporter and year: exports (X) and imports (M) to/from each actor, US$ million, null where no row."""
    cells: dict[tuple[str, int, str], dict] = {}
    for r in trade_rows:
        if r.get("mineral") != mineral or r.get("reporter") not in IN_SCOPE or r.get("partner") not in ACTORS:
            continue
        if r.get("value_type") not in (None, "reported"):
            continue
        key = (r["reporter"], int(r["year"]), r["flow"])
        c = cells.setdefault(key, {"iso3": r["reporter"], "year": int(r["year"]), "flow": r["flow"], "musd": {"CN": None, "US": None, "WLD": None}, "source_id": r.get("source_id")})
        v = _num(r.get("value_usd"))
        if v is not None:
            c["musd"][ACTOR_KEY[r["partner"]]] = round(v / 1e6, 6)
    return sorted(cells.values(), key=lambda c: (c["iso3"], c["year"], c["flow"]))


def mineral_production(prod_rows: list[dict], mineral: str) -> list[dict]:
    out = []
    for r in prod_rows:
        if r.get("mineral") != mineral or r.get("country") not in IN_SCOPE:
            continue
        out.append({"iso3": r["country"], "year": int(r["year"]), "measure": r["measure"], "qty": _num(r.get("qty")), "unit": r.get("unit"), "note": r.get("note") or None,
                    "source": _src(r.get("source_id"), r.get("source_record_url"))})
    return sorted(out, key=lambda x: (x["measure"], x["iso3"], x["year"]))


def mineral_prices(price_rows: list[dict], mineral: str) -> list[dict]:
    return [{"series": r["series"], "date": str(r["date"])[:10], "year": int(r["year"]), "price": _num(r.get("price")), "unit": r.get("unit"), "source": _src(r.get("source_id"), r.get("source_record_url"))}
            for r in price_rows if r.get("mineral") == mineral and _num(r.get("price")) is not None]


def mineral_concessions(conc_rows: list[dict], mineral: str) -> list[dict]:
    out = []
    for r in conc_rows:
        mins = {m.strip() for m in str(r.get("minerals") or "").split(",") if m.strip()}
        if r.get("mineral") != mineral and mineral not in mins:
            continue
        lat, lon = _num(r.get("lat")), _num(r.get("lon"))
        out.append({"id": r["concession_id"], "iso3": r["country"], "title": r.get("title"), "holder": r.get("holder"), "status": r.get("status"), "granted_year": None if r.get("granted_year") is None else int(r["granted_year"]),
                    "area_ha": _num(r.get("area_ha")), "lat": lat, "lon": lon, "source": _src(r.get("source_id"), r.get("source_record_url"))})
    return out


def mineral_index(idx_rows: list[dict], mineral: str) -> list[dict]:
    return [{"iso3": r["country"], "year": int(r["year"]), "actor": r["actor"], "value": _num(r.get("value")), "n_components": None if r.get("n_components") is None else int(r["n_components"])}
            for r in idx_rows if r.get("mineral") == mineral and (r.get("index_name") or "influence") == "influence" and _num(r.get("value")) is not None]


def mineral_file(m: dict, trade_rows: list[dict], prod_rows: list[dict], price_rows: list[dict], conc_rows: list[dict], idx_rows: list[dict], today: str) -> dict:
    mid = m["id"]
    trade = mineral_trade(trade_rows, mid)
    prod = mineral_production(prod_rows, mid)
    codes = [{"hs6": h["hs6"], "stage": h.get("stage"), "description": h.get("description"), "shared": bool(h.get("shared"))} for h in hs_codes() if h.get("mineral") == mid]
    # the latest year with an export row per country, and the share to each actor that year
    latest: dict[str, dict] = {}
    for c in trade:
        if c["flow"] != "X" or c["musd"]["WLD"] is None:
            continue
        if c["iso3"] not in latest or c["year"] > latest[c["iso3"]]["year"]:
            latest[c["iso3"]] = c
    importance = []
    for iso, c in sorted(latest.items()):
        w = c["musd"]["WLD"]
        importance.append({"iso3": iso, "name": COUNTRIES[iso], "year": c["year"], "exports_musd": w,
                           "share_cn": None if c["musd"]["CN"] is None or not w else c["musd"]["CN"] / w,
                           "share_us": None if c["musd"]["US"] is None or not w else c["musd"]["US"] / w})
    producers = sorted({p["iso3"] for p in prod if p["measure"] == "production" and (p["qty"] or 0) > 0})
    return {
        "dataset": "REAL", "generated_on": today, "layer": "facts",
        "id": mid, "name": m["name"], "core": bool(m.get("core")), "on_us_list": bool(m.get("on_us_list")), "on_cn_list": bool(m.get("on_cn_list")),
        "in_region": list(m.get("in_region") or []), "note": m.get("note"),
        "uses": m.get("uses"), "why_it_matters": m.get("why_it_matters"), "uses_source": m.get("uses_source"),
        "hs_codes": codes,
        "producers": producers,
        "importance": importance,
        "production": prod,
        "trade": trade,
        "prices": mineral_prices(price_rows, mid),
        "concessions": mineral_concessions(conc_rows, mid),
        "index": mineral_index(idx_rows, mid),
        "note_method": "Trade: reported flows (reporter's own data) summed over the mineral's HS6 codes, US$ million; a partner cell with no row is null, never 0. Production and reserves as the sources report them, in their own units. Shares are the actor's cell over the reported world total of the latest year with a world row.",
    }


def minerals_index(files: list[dict], today: str) -> dict:
    out = []
    for f in files:
        by_country = defaultdict(int)
        for p in f["production"]:
            by_country[p["iso3"]] += 1
        out.append({"id": f["id"], "name": f["name"], "core": f["core"], "on_us_list": f["on_us_list"], "on_cn_list": f["on_cn_list"], "in_region": f["in_region"], "note": f["note"],
                    "uses": f["uses"], "why_it_matters": f["why_it_matters"], "uses_source": f["uses_source"],
                    "producers": f["producers"], "n_trade_rows": len(f["trade"]), "n_production_rows": len(f["production"]), "n_prices": len(f["prices"]), "n_concessions": len(f["concessions"]),
                    "n_index_rows": len(f["index"]), "countries_with_trade": sorted({c["iso3"] for c in f["trade"]}), "hs6": [h["hs6"] for h in f["hs_codes"]],
                    "top_exporters": sorted(f["importance"], key=lambda x: -(x["exports_musd"] or 0))[:5]})
    return {"dataset": "REAL", "generated_on": today, "layer": "facts", "minerals": out,
            "note": "One entry per mineral of config/minerals.yaml; the lists are the USGS 2025 critical minerals list and China's strategic minerals catalogue as the registry records them; uses and importance are the registry's curated text with its source."}


def write_minerals(out_dir, trade_rows, prod_rows, price_rows, conc_rows, idx_rows, today: str) -> dict:
    import json
    d = out_dir / "minerals"
    d.mkdir(parents=True, exist_ok=True)
    files = []
    for m in minerals():
        f = mineral_file(m, trade_rows, prod_rows, price_rows, conc_rows, idx_rows, today)
        (d / f"{m['id']}.json").write_text(json.dumps(f, ensure_ascii=False, default=str), encoding="utf-8")
        files.append(f)
    (out_dir / "minerals.json").write_text(json.dumps(minerals_index(files, today), ensure_ascii=False, default=str), encoding="utf-8")
    return {"minerals": len(files), "trade_rows": sum(len(f["trade"]) for f in files), "production_rows": sum(len(f["production"]) for f in files)}
