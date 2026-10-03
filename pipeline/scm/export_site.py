"""Export the warehouse into web/public/data/real/ using the JSON contract the UI already reads.

Only *facts* are exported (actions, trade, contracts, governance, prices, policy, and from Phase 2b
the legislative records and press headlines, unclassified). Model outputs stay in the sample dataset
until Phases 3-5. A coverage file tells the UI
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
MAX_ARTICLES = 4000  # most recent headlines per country kept in the site file
# Legislatures with no machine-readable records (docs/PHASE0_PLAN.md section 3): shown as an explicit absence, never as zero.
NO_STRUCTURED_LEGISLATURE = {
    "BOL": "The Asamblea Legislativa Plurinacional publishes no API, no roll-call data and no transcripts; the Gaceta's full text is paywalled.",
    "GUY": "The Parliament of Guyana publishes Hansard as PDF only, with no structured bill or vote records.",
    "SUR": "De Nationale Assemblée publishes bills as Dutch PDFs; debates and roll-calls are not online.",
    "VEN": "Two assemblies claim legitimacy; neither publishes structured bill or vote records.",
    "URY": "parlamento.gub.uy refuses automated clients and is not reachable from abroad; the national open-data catalogue lists no Parliament dataset yet (candidates are recorded on every run).",
}
# fields a news item may carry on the site: headline, date, outlet and URL plus derived flags; never article text
ARTICLE_KEYS = {"id", "date", "date_precision", "outlet", "outlet_source_id", "orientation", "reliability", "headline_original", "language", "headline_en",
                "url", "stance_us", "stance_cn", "tone", "classification", "topic_minerals", "mentions", "via", "also_reported_by", "source"}


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
    (out / "parliament").mkdir(exist_ok=True)
    (out / "media").mkdir(exist_ok=True)
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
    docs = _rows(con, "SELECT * FROM document_dedup ORDER BY date DESC")
    votes = _rows(con, "SELECT * FROM vote")
    member_counts = _rows(con, "SELECT vote_id, choice, count(*) AS n FROM vote_member GROUP BY 1, 2")
    concessions = _rows(con, "SELECT country, count(*) AS n FROM concession GROUP BY 1")
    conc_by_country = {r["country"]: int(r["n"]) for r in concessions}
    votes_by_doc: dict[str, list[dict]] = {}
    counts_by_vote: dict[str, dict[str, int]] = {}
    for r in member_counts:
        counts_by_vote.setdefault(r["vote_id"], {})[r["choice"]] = int(r["n"])
    for v in votes:
        votes_by_doc.setdefault(v["doc_id"], []).append(v)
    reg = sources()

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

        # parliament: bills, hearings and votes (facts; stance is Phase 3)
        parl_docs = []
        for r in docs:
            if r["country"] != iso or r["doc_type"] == "news":
                continue
            vlist = votes_by_doc.get(r["doc_id"], [])
            vote_block = None
            if vlist:
                v = sorted(vlist, key=lambda x: x["date"])[-1]
                mc = counts_by_vote.get(v["vote_id"], {})
                vote_block = {"date": v["date"], "chamber": v["chamber"], "result": v["result"],
                              "yes": v["yes"] if v["yes"] is not None else mc.get("yes"), "no": v["no"] if v["no"] is not None else mc.get("no"),
                              "abstain": v["abstain"] if v["abstain"] is not None else mc.get("abstain"),
                              "members_recorded": sum(mc.values()) if mc else None, "n_votes": len(vlist), "url": v["source_record_url"]}
            parl_docs.append({
                "id": r["doc_id"], "date": r["date"], "date_precision": r["date_precision"], "chamber": r["venue"], "type": r["doc_type"],
                "title_original": r["title_original"], "language": r["language"], "title_en": None, "summary": r["summary"], "status": r["status"],
                "author": r["author"], "stance_us": None, "stance_cn": None, "classification": "not_yet_classified",
                "topic_minerals": [m for m in str(r["minerals"] or "").split(",") if m], "mentions": {"us": bool(r["mentions_us"]), "cn": bool(r["mentions_cn"])},
                "vote": vote_block, "url": r["source_record_url"] or "", "source": _src(r["source_id"], r["source_record_url"]),
            })
        parl_docs.sort(key=lambda d: d["date"], reverse=True)
        parl_src = sorted({d["source"]["id"] for d in parl_docs})
        n_votes = sum(1 for d in parl_docs if d["vote"])
        if parl_docs:
            (out / "parliament" / f"{iso}.json").write_text(json.dumps({"dataset": "REAL", "iso3": iso, "generated_on": today, "documents": parl_docs,
                                                                          "freshness": {"last_updated": today, "source_ids": parl_src, "schedule": "monthly"}},
                                                                         ensure_ascii=False, default=str), encoding="utf-8")

        # media: headline, date, outlet and URL only
        articles = []
        for r in docs:
            if r["country"] != iso or r["doc_type"] != "news":
                continue
            outlet_id = r["outlet_source_id"] or r["source_id"]
            o = reg.get(outlet_id)
            articles.append({
                "id": r["doc_id"], "date": r["date"], "date_precision": r["date_precision"], "outlet": o.name if o else r["venue"], "outlet_source_id": outlet_id,
                "orientation": o.orientation if o else None, "reliability": r["reliability"], "headline_original": r["title_original"], "language": r["language"],
                "headline_en": None, "url": r["source_record_url"] or "", "stance_us": None, "stance_cn": None, "tone": None, "classification": "not_yet_classified",
                "topic_minerals": [m for m in str(r["minerals"] or "").split(",") if m], "mentions": {"us": bool(r["mentions_us"]), "cn": bool(r["mentions_cn"])},
                "via": "gdelt" if r["source_id"] == "gdelt" else "rss", "also_reported_by": [s for s in str(r.get("source_ids") or "").split(",") if s and s != r["source_id"]],
                "source": _src(r["source_id"], r["source_record_url"]),
            })
        articles.sort(key=lambda a: a["date"], reverse=True)
        articles = articles[:MAX_ARTICLES]
        assert all(set(a) <= ARTICLE_KEYS for a in articles), "article export carries an unexpected field"
        outlets = {sid: {"name": s.name, "orientation": s.orientation, "reliability": s.reliability, "paywall": s.paywall}
                   for sid, s in reg.items() if s.category == "press" and iso in s.countries}
        if articles:
            (out / "media" / f"{iso}.json").write_text(json.dumps({"dataset": "REAL", "iso3": iso, "generated_on": today, "articles": articles, "outlets": outlets,
                                                                     "freshness": {"last_updated": today, "source_ids": sorted({a["source"]["id"] for a in articles}),
                                                                                   "schedule": "weekly (RSS) and monthly windows (GDELT)"}},
                                                                    ensure_ascii=False, default=str), encoding="utf-8")

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
            "parliament_available": bool(parl_docs), "parliament_documents": len(parl_docs), "parliament_votes": n_votes,
            "parliament_from": min((int(d["date"][:4]) for d in parl_docs), default=None), "parliament_note": NO_STRUCTURED_LEGISLATURE.get(iso) if not parl_docs else None,
            "media_available": bool(articles), "media_articles": len(articles), "media_from": min((int(a["date"][:4]) for a in articles), default=None),
            "concessions": conc_by_country.get(iso, 0),
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
        "tables": {t: int(con.execute(f"SELECT count(*) FROM {t}").fetchone()[0]) for t in ("trade_flow", "finance_event", "deal_event", "governance", "contract", "production", "price", "policy_document", "document", "vote", "vote_member", "concession", "media_volume") if _table_exists(con, t)},
        # "facts_only": real records are shown, the layer's model outputs (stance, tone, narratives) remain sample until Phase 3
        "layers": {"facts": "real", "model_outputs": "sample",
                   "parliament": "facts_only" if any(c["parliament_available"] for c in coverage.values()) else "sample",
                   "media": "facts_only" if any(c["media_available"] for c in coverage.values()) else "sample", "forecast": "sample"},
        "coverage": coverage,
    }
    (out / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, default=str, indent=1), encoding="utf-8")
    (out / "coverage.json").write_text(json.dumps({"generated_on": today, "countries": coverage}, indent=1), encoding="utf-8")
    con.close()
    return {"countries": len(coverage), "tables": meta["tables"], "sources_ok": ok_sources}


def _table_exists(con: duckdb.DuckDBPyConnection, name: str) -> bool:
    return bool(con.execute("SELECT count(*) FROM information_schema.tables WHERE table_name = ?", [name]).fetchone()[0])
