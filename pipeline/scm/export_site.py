"""Export the warehouse into web/public/data/real/ using the JSON contract the UI already reads.

Only the *facts* layer is exported (actions, trade, contracts, governance, prices, policy).
Model outputs stay in the sample dataset until Phases 3-5. A coverage file tells the UI
which countries and tables have real data so it can fall back to sample per layer.
"""
from __future__ import annotations

import json
from datetime import UTC, date, datetime
from pathlib import Path

import duckdb
import pandas as pd

from .paths import REAL_SITE_DIR, WAREHOUSE_DIR
from .registry import COUNTRIES, IN_SCOPE, core_minerals, sources

ORIGIN_TO_SIDE = {"US": "US", "CN": "CN", "other": "other", "unknown": "other"}


def _src(sid: str, record_url: str | None = None) -> dict:
    s = sources()[sid]
    return {"id": sid, "name": s.name, "url": record_url or s.url, "registry_url": s.url, "reliability": s.reliability, "sample": False}


def _json_safe(v):
    if v is None or (isinstance(v, float) and v != v) or v is pd.NA or v is pd.NaT:
        return None
    if hasattr(v, "item"):
        return v.item()
    return v


def _rows(con: duckdb.DuckDBPyConnection, sql: str) -> list[dict]:
    try:
        df = con.execute(sql).df()
    except duckdb.CatalogException:
        return []
    return [{k: _json_safe(v) for k, v in r.items()} for r in df.to_dict("records")]


def run(warehouse: Path = WAREHOUSE_DIR, out: Path = REAL_SITE_DIR) -> dict:
    db = warehouse / "scm.duckdb"
    if not db.exists():
        raise FileNotFoundError(f"{db} missing; run `python -m scm build` first")
    con = duckdb.connect(str(db), read_only=True)
    out.mkdir(parents=True, exist_ok=True)
    (out / "country").mkdir(exist_ok=True)
    today = str(date.today())
    core = core_minerals()

    runs = _rows(con, "SELECT source_id, status, finished_at, rows, error FROM ingest_run QUALIFY row_number() OVER (PARTITION BY source_id ORDER BY finished_at DESC) = 1")
    ok_sources = sorted({r["source_id"] for r in runs if r["status"] == "ok"})

    trade = _rows(con, "SELECT reporter, partner, mineral, year, flow, value_type, sum(value_usd) AS value_usd, min(source_id) AS source_id, min(source_record_url) AS url FROM trade_flow WHERE month IS NULL AND flow = 'X' GROUP BY 1,2,3,4,5,6")
    fin = _rows(con, "SELECT * FROM finance_event_dedup")
    deals = _rows(con, "SELECT * FROM deal_event")
    gov = _rows(con, "SELECT country, year, indicator, indicator_name, value, source_id, source_record_url, retrieved_at FROM governance")
    contracts = _rows(con, "SELECT * FROM contract")
    prod = _rows(con, "SELECT * FROM production")
    prices = _rows(con, "SELECT mineral, series, date, year, month, price, unit, source_id, source_record_url FROM price")
    policy = _rows(con, "SELECT * FROM policy_document ORDER BY date DESC")
    disc = _rows(con, "SELECT * FROM trade_discrepancy")

    coverage: dict[str, dict] = {}
    for iso in IN_SCOPE:
        t_rows = [r for r in trade if r["reporter"] == iso]
        years = sorted({int(r["year"]) for r in t_rows if r["value_type"] == "reported"})
        mirror_years = sorted({int(r["year"]) for r in t_rows if r["value_type"] == "mirror"})
        f_rows = [r for r in fin if r["country"] == iso]
        d_rows = [r for r in deals if r["country"] == iso]
        g_rows = [r for r in gov if r["country"] == iso]
        c_rows = [r for r in contracts if r["country"] == iso]
        p_rows = [r for r in prod if r["country"] == iso]

        # trade block: year x mineral with CN/US/ROW from reported rows and CN/US mirrors
        by: dict[tuple[int, str], dict] = {}
        for r in t_rows:
            key = (int(r["year"]), r["mineral"])
            b = by.setdefault(key, {"year": key[0], "mineral": key[1], "exports_musd": {"CN": None, "US": None, "ROW": None}, "mirror_musd": {"CN": None, "US": None}, "value_type": "reported", "source": None, "sources": {}})
            musd = round(float(r["value_usd"]) / 1e6, 3)
            if r["value_type"] == "reported":
                if r["partner"] == "CHN":
                    b["exports_musd"]["CN"] = musd
                elif r["partner"] == "USA":
                    b["exports_musd"]["US"] = musd
                elif r["partner"] == "WLD":
                    b["_wld"] = musd
                b["sources"]["reported"] = _src(r["source_id"], r["url"])
            else:
                if r["partner"] == "CHN":
                    b["mirror_musd"]["CN"] = musd
                elif r["partner"] == "USA":
                    b["mirror_musd"]["US"] = musd
                b["sources"]["mirror"] = _src(r["source_id"], r["url"])
        trade_block = []
        for b in by.values():
            wld = b.pop("_wld", None)
            e = b["exports_musd"]
            if wld is not None:
                e["ROW"] = round(wld - (e["CN"] or 0) - (e["US"] or 0), 3)
            if e["CN"] is None and e["US"] is None and wld is None:
                b["value_type"] = "mirror"
            b["source"] = b["sources"].get("reported") or b["sources"].get("mirror")
            trade_block.append(b)
        trade_block.sort(key=lambda b: (b["year"], b["mineral"]))

        events = []
        for r in f_rows:
            events.append({
                "id": r["event_id"], "date": r["date"] or f"{r['year']}-01-01", "year": int(r["year"]), "type": r["type"],
                "actor_side": ORIGIN_TO_SIDE.get(r["actor_from_origin"], "other"),
                "actors": [a for a in [r["actor_from"], r["actor_to"]] if a], "mineral": r["mineral"] or "none",
                "amount_musd": round(float(r["amount_usd"]) / 1e6, 2) if r["amount_usd"] is not None else None,
                "description": r["description"], "sector": r["sector"], "source": _src(r["source_id"], r["source_record_url"]),
                "confidence": r["confidence"], "also_reported_by": [s for s in str(r["source_ids"]).split(",") if s and s != r["source_id"]],
                "date_precision": "day" if r["date"] else "year",
            })
        for r in d_rows:
            events.append({
                "id": r["event_id"], "date": r["date"] or f"{r['year']}-01-01", "year": int(r["year"]), "type": r["type"],
                "actor_side": ORIGIN_TO_SIDE.get(r["actor_origin"], "other"), "actors": [a.strip() for a in str(r["actors"]).split(";") if a.strip()],
                "mineral": r["mineral"] or "none", "amount_musd": round(float(r["amount_usd"]) / 1e6, 2) if r["amount_usd"] is not None else None,
                "description": r["description"], "sector": None, "source": _src(r["source_id"], r["source_record_url"]), "confidence": r["confidence"],
                "also_reported_by": [], "date_precision": "month" if r["date"] else "year",
            })
        events.sort(key=lambda e: e["date"])

        country = {
            "dataset": "REAL", "iso3": iso, "name": COUNTRIES[iso], "generated_on": today,
            "freshness": {"actions": {"last_updated": today, "source_ids": sorted({e["source"]["id"] for e in events} | {b["source"]["id"] for b in trade_block if b["source"]}), "schedule": "monthly"},
                          "governance": {"last_updated": today, "source_ids": sorted({r["source_id"] for r in g_rows}), "schedule": "annual"}},
            "actions": {"events": events, "trade": trade_block,
                        "contracts": [{"id": r["contract_id"], "title": r["title"], "resource": r["resource"], "mineral": r["mineral"], "companies": r["companies"], "year": r["signature_year"], "type": r["contract_type"], "language": r["language"], "source": _src(r["source_id"], r["source_record_url"])} for r in c_rows],
                        "production": [{"mineral": r["mineral"], "measure": r["measure"], "year": int(r["year"]), "qty": r["qty"], "unit": r["unit"], "note": r["note"], "source": _src(r["source_id"], r["source_record_url"])} for r in p_rows]},
            "governance": [{"year": int(r["year"]), "indicator": r["indicator"], "name": r["indicator_name"], "value": r["value"], "source": _src(r["source_id"], r["source_record_url"])} for r in g_rows],
            "trade_discrepancies": [d for d in disc if d["reporter"] == iso and d["flag"] in ("large_discrepancy", "mirror_only")],
        }
        (out / "country" / f"{iso}.json").write_text(json.dumps(country, ensure_ascii=False, default=str), encoding="utf-8")
        coverage[iso] = {
            "trade_years": years, "mirror_years": mirror_years, "events": len(events), "contracts": len(c_rows), "governance": len(g_rows), "production": len(p_rows),
            "actions": bool(events or trade_block), "governance_available": bool(g_rows),
        }

    # region: mineral shares from reported exports summed over the 12 countries
    shares: dict[tuple[int, str], dict] = {}
    for r in trade:
        if r["value_type"] != "reported" or r["mineral"] not in core:
            continue
        k = (int(r["year"]), r["mineral"])
        s = shares.setdefault(k, {"year": k[0], "mineral": k[1], "CN": 0.0, "US": 0.0, "WLD": 0.0})
        slot = {"CHN": "CN", "USA": "US", "WLD": "WLD"}.get(r["partner"])
        if slot:
            s[slot] += float(r["value_usd"])
    mineral_shares = []
    for s in sorted(shares.values(), key=lambda x: (x["year"], x["mineral"])):
        if s["WLD"] > 0:
            cn, us = s["CN"] / s["WLD"], s["US"] / s["WLD"]
            mineral_shares.append({"year": s["year"], "mineral": s["mineral"], "share_cn": round(cn, 4), "share_us": round(us, 4), "share_other": round(max(0.0, 1 - cn - us), 4), "exports_wld_musd": round(s["WLD"] / 1e6, 1)})
    (out / "region.json").write_text(json.dumps({"dataset": "REAL", "generated_on": today, "mineral_shares": mineral_shares, "source": _src("un_comtrade")}, ensure_ascii=False), encoding="utf-8")
    (out / "prices.json").write_text(json.dumps({"dataset": "REAL", "generated_on": today, "series": prices}, ensure_ascii=False, default=str), encoding="utf-8")
    (out / "policy.json").write_text(json.dumps({"dataset": "REAL", "generated_on": today, "documents": [{**p, "source": _src(p["source_id"], p["source_record_url"])} for p in policy]}, ensure_ascii=False, default=str), encoding="utf-8")
    meta = {
        "dataset": "REAL", "generated_on": today, "generated_at": datetime.now(UTC).isoformat(timespec="seconds"),
        "sources_ok": ok_sources, "ingest_runs": runs,
        "tables": {t: int(con.execute(f"SELECT count(*) FROM {t}").fetchone()[0]) for t in ("trade_flow", "finance_event", "deal_event", "governance", "contract", "production", "price", "policy_document") if _table_exists(con, t)},
        "layers": {"facts": "real", "model_outputs": "sample", "parliament": "sample", "media": "sample", "forecast": "sample"},
        "coverage": coverage,
    }
    (out / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, default=str, indent=1), encoding="utf-8")
    (out / "coverage.json").write_text(json.dumps({"generated_on": today, "countries": coverage}, indent=1), encoding="utf-8")
    con.close()
    return {"countries": len(coverage), "tables": meta["tables"], "sources_ok": ok_sources}


def _table_exists(con: duckdb.DuckDBPyConnection, name: str) -> bool:
    return bool(con.execute("SELECT count(*) FROM information_schema.tables WHERE table_name = ?", [name]).fetchone()[0])
