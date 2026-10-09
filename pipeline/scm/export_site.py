"""Export the warehouse into web/public/data/real/ using the JSON contract the UI already reads.

Facts (actions, trade, contracts, governance, prices, policy, legislative records, headlines) and, from
Phase 3, the text-model outputs (machine translations, stance, tone, narratives) are exported side by side
but labelled apart: every model value carries the method, model name and codebook version, and `text_model`
says whether the classifier is a zero-shot baseline or validated against the hand-coded sample. From Phase 4
the quant outputs (influence index with its sensitivity band, concentration, say–do gap, flags, finance network)
go into each country file's `analysis` block, `index.json` and `quant.json`, stamped with `quant_model` (method
and weights version, data release, draws). A coverage file tells the UI which countries and tables have real
data so it can fall back to sample per layer.
"""
from __future__ import annotations

import json
from datetime import UTC, date, datetime
from pathlib import Path

import duckdb
import pandas as pd

from .paths import REAL_SITE_DIR, WAREHOUSE_DIR
from .quant.index import COMPONENTS, DIRICHLET_ALPHA, MIN_COMPONENTS, MIN_DOCS, RANK_SHARE
from .quant.panel import MIN_COUNTRIES, MIN_OBS, TERMS
from .registry import COUNTRIES, IN_SCOPE, core_minerals, sources
from .schema import SCHEMAS
from .text.store import pick_classifications

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
                "url", "stance_us", "stance_cn", "tone", "classification", "classifier", "translation", "topic_minerals", "mentions", "via",
                "also_reported_by", "source"}
METHOD_PRIORITY = ["trained", "zero_shot"]  # a trained head is used only once it is validated and beats the baseline (see text.store.pick_classifications)


def _translations(tr_rows: list[dict]) -> dict[tuple[str, str], dict]:
    """(doc_id, field) -> {text, method, model}; a human translation beats machine translation."""
    rank = {"human": 2, "llm": 1, "mt": 0}
    out: dict[tuple[str, str], dict] = {}
    for r in sorted(tr_rows, key=lambda r: (rank.get(r["method"], -1), r["created_at"])):
        if r["lang_to"] == "en":
            out[(r["doc_id"], r["field"])] = {"text": r["text"], "method": r["method"], "model": r["model"]}
    return out


def _classifier_block(row: dict | None) -> dict | None:
    if not row:
        return None
    confs = [row[k] for k in ("stance_us_conf", "stance_cn_conf") if row.get(k) is not None]
    return {"method": row["method"], "model": row["model"], "codebook_version": row["codebook_version"],
            "confidence": round(min(confs), 3) if confs else None, "tone_model": (row.get("frame") or "").removeprefix("tone:") or None}


def _validation_file(metrics: list[dict], sample_rows: list[dict], status: dict, today: str) -> dict:
    """Everything the methodology page shows: sample composition, agreement statistics, per-class model metrics."""
    by_coder: dict[str, int] = {}
    for r in sample_rows:
        by_coder[r["coder"]] = by_coder.get(r["coder"], 0) + 1
    agreement: dict[str, dict] = {}
    models: dict[str, dict] = {}
    for m in metrics:
        if m["method"] == "agreement":
            agreement.setdefault(m["target"], {})[m["metric"]] = {"value": m["value"], "n": int(m["n"])}
        else:
            models.setdefault(m["method"], {}).setdefault(m["split"], {}).setdefault(m["target"], {}).setdefault(m["class"], {})[m["metric"]] = {"value": m["value"], "n": int(m["n"])}
    return {"generated_on": today, "codebook_version": status.get("codebook_version"),
            "status": "measured" if agreement or models else "not_yet_measured",
            "sample": {"n": by_coder.get("adjudicated", by_coder.get("template", 0)), "by_coder": by_coder},
            "agreement": agreement, "models": models, "selected_method": status.get("method"), "beats_baseline": status.get("beats_baseline"),
            "text_model": status}


NETWORK_TOP = 12  # nodes shown per country


def _round(v, digits: int):
    return None if v is None else round(float(v), digits)


def _quant_status(qrun: list[dict], idx_rows: list[dict], text_status: dict) -> dict:
    """How the Phase 4 outputs stand: computed (method and weights version, draws, rank stability, data release) or not yet."""
    r = qrun[0] if qrun else None
    computed = bool(idx_rows) and r is not None
    notes = {}
    if r and r.get("notes"):
        try:
            notes = json.loads(r["notes"])
        except ValueError:
            notes = {}
    status = {"status": "computed" if computed else "not_yet_computed", "method_version": r["method_version"] if r else None,
              "weights_version": r["weights_version"] if r else None, "run_id": r["run_id"] if r else None, "inputs_release": r["inputs_release"] if r else None,
              "created_at": r["created_at"] if r else None, "draws": int(r["draws"]) if r else None, "rank_stability": r["rank_stability"] if r else None,
              "text_model_label": text_status.get("label"), "last_year": notes.get("last_year", {}), "unattributed_finance_events": notes.get("unattributed_finance_events"),
              "n_boot": notes.get("n_boot"), "events": notes.get("events"), "label": None}
    if computed:
        status["label"] = f"Computed from sourced data · method {r['method_version']} · band: 5th–95th percentile of {int(r['draws'])} weight and normalisation draws"
    return status


def _event_rows(iso: str, effect_rows: list[dict]) -> list[dict]:
    """Event-window rows of the country plus the difference-in-differences rows of events that treat it; the event's
    title, type, review status and source travel with the rows (they were computed from that event list)."""
    reg = sources()
    out = []
    for r in effect_rows:
        treated = [c for c in str(r["treated_countries"] or "").split(",") if c]
        if not (r["country"] == iso or (r["design"] == "did" and iso in treated)):
            continue
        out.append({"event_id": r["event_id"], "title": r["event_title"], "type": r["event_type"], "date": r["event_date"], "year": int(r["event_year"]),
                    "status": r["event_status"], "verify": bool(r["event_verify"]), "event_actor": r["event_actor"], "actor": r["actor"], "outcome": r["outcome"],
                    "design": r["design"], "pre_mean": r["pre_mean"], "post_mean": r["post_mean"], "diff": r["diff"], "placebo_p": r["placebo_p"], "n_placebo": int(r["n_placebo"]),
                    "treated_countries": treated, "control_countries": [c for c in str(r["control_countries"] or "").split(",") if c], "note": r["note"],
                    "source": _src(r["event_source_id"]) if r.get("event_source_id") in reg else None})
    return sorted(out, key=lambda r: (r["year"], r["event_id"], r["actor"], r["design"]))


def _events_from_rows(effect_rows: list[dict]) -> dict[str, dict]:
    events: dict[str, dict] = {}
    for r in effect_rows:
        events.setdefault(r["event_id"], {"id": r["event_id"], "date": r["event_date"], "actor": r["event_actor"], "type": r["event_type"], "title": r["event_title"],
                                          "status": r["event_status"], "verify": bool(r["event_verify"]), "scope": r["event_scope"], "source_id": r.get("event_source_id")})
    return events


def _analysis_block(iso: str, idx_rows: list[dict], comp_rows: list[dict], sd_rows: list[dict], flag_rows: list[dict], conc_rows: list[dict],
                    node_rows: list[dict], edge_rows: list[dict], unattributed: int, status: dict, effect_rows: list[dict] | None = None) -> dict | None:
    reg = sources()
    event_rows = _event_rows(iso, effect_rows or [])
    # the country file carries the "all minerals" index with its sub-indices and drivers; per-mineral composites live in index.json
    index = [{"year": int(r["year"]), "actor": r["actor"], "index_name": r["index_name"], "value": r["value"], "lower": r["lower"], "upper": r["upper"],
              "n_components": int(r["n_components"]), "components_available": [c for c in str(r["components_available"]).split(",") if c]}
             for r in idx_rows if r["country"] == iso and r["mineral"] == "all"]
    comp_by: dict[tuple[int, str], list[dict]] = {}
    for r in comp_rows:
        if r["country"] != iso or r["mineral"] != "all":
            continue
        comp_by.setdefault((int(r["year"]), r["actor"]), []).append({
            "name": r["component"], "raw_value": _round(r["raw_value"], 6), "normalized_value": _round(r["normalized_value"], 2), "weight": _round(r["weight"], 4),
            "available": bool(r["available"]), "note": r["note"], "source_ids": [x for x in str(r["source_ids"] or "").split(",") if x]})
    components = [{"year": k[0], "actor": k[1], "components": v} for k, v in sorted(comp_by.items())]
    say_do = [{"year": int(r["year"]), "actor": r["actor"], "rhetoric": r["rhetoric"], "action": r["action"], "gap": r["gap"], "n_docs": int(r["n_docs"]),
               "text_model_status": r["text_model_status"], "evidence_doc_ids": [x for x in str(r["evidence_doc_ids"] or "").split("|") if x]}
              for r in sd_rows if r["country"] == iso]
    flags = [{"id": r["flag_id"], "year": int(r["year"]), "actor": r["actor"], "type": r["type"], "evidence_level": r["evidence_level"], "description": r["description"],
              "score": r["score"], "evidence": [_src(sid) for sid in str(r["evidence_source_ids"] or "").split(",") if sid in reg]}
             for r in flag_rows if r["country"] == iso]
    conc_by: dict[tuple[int, str], dict] = {}
    for r in conc_rows:
        if r["country"] != iso:
            continue
        c = conc_by.setdefault((int(r["year"]), r["mineral"]), {"year": int(r["year"]), "mineral": r["mineral"]})
        m = r["metric"]
        if m in ("exports_wld_usd", "imports_wld_usd"):
            c[m.replace("_usd", "_musd")] = round(float(r["value"]) / 1e6, 3) if r["value"] is not None else None
        elif m == "hhi_export_dest":
            c["hhi_export_dest"] = r["value"]
            c["hhi_note"] = r["note"]
        else:
            c[m] = r["value"]
    concentration = [conc_by[k] for k in sorted(conc_by)]
    edges = [e for e in edge_rows if e["country"] == iso]
    node_ids = {e["source_node"] for e in edges} | {e["target_node"] for e in edges}
    nodes = sorted((n for n in node_rows if n["node_id"] in node_ids), key=lambda n: -float(n["weighted_degree"]))[:NETWORK_TOP]
    keep = {n["node_id"] for n in nodes}
    network = {
        "nodes": [{"id": n["node_id"], "label": n["label"], "type": n["node_type"], "origin": n["origin"], "country": n["country"], "degree": int(n["degree"]),
                   "weighted_degree_musd": round(float(n["weighted_degree"]) / 1e6, 2), "betweenness": n["betweenness"], "eigenvector": n["eigenvector"], "community": int(n["community"])} for n in nodes],
        "edges": [{"source": e["source_node"], "target": e["target_node"], "weight_musd": round(float(e["weight_usd"]) / 1e6, 2), "n_events": int(e["n_events"]),
                   "source_ids": [x for x in str(e["source_ids"] or "").split(",") if x]} for e in edges if e["source_node"] in keep and e["target_node"] in keep],
        "n_nodes_total": len(node_ids), "n_edges_total": len(edges), "unattributed_events": unattributed,
    }
    if not (index or concentration or flags or edges):
        return None
    return {"index": index, "components": components, "say_do_gap": say_do, "flags": flags, "concentration": concentration, "network": network,
            "event_effects": event_rows, "quant_model": status}


def _quant_file(status: dict, idx_rows: list[dict], comp_rows: list[dict], sd_rows: list[dict], flag_rows: list[dict], conc_rows: list[dict],
                node_rows: list[dict], edge_rows: list[dict], today: str, reg_rows: list[dict] | None = None, effect_rows: list[dict] | None = None) -> dict:
    """What the methodology page shows about the Phase 4 methods: components and their availability, the index
    coverage, the sensitivity settings, flag counts by type and level, the network size."""
    comps = []
    for name, group, definition, ids in COMPONENTS:
        avail: dict[str, dict] = {}
        for actor in ("US", "CN"):
            rows = [r for r in comp_rows if r["component"] == name and r["actor"] == actor and r["mineral"] == "all"]
            ok = [r for r in rows if r["available"]]
            years = sorted({int(r["year"]) for r in ok})
            avail[actor] = {"rows": len(rows), "available": len(ok), "years": [years[0], years[-1]] if years else None,
                            "countries": sorted({r["country"] for r in ok})}
        src_ids = sorted({x for r in comp_rows if r["component"] == name for x in str(r["source_ids"] or "").split(",") if x}) or ids
        comps.append({"name": name, "group": group, "definition": definition, "source_ids": src_ids, "availability": avail})
    influence = [r for r in idx_rows if r["index_name"] == "influence" and r["mineral"] == "all"]
    with_value = [r for r in influence if r["value"] is not None]
    years = sorted({int(r["year"]) for r in with_value})
    flags_by: dict[str, dict[str, int]] = {}
    for r in flag_rows:
        flags_by.setdefault(r["type"], {})
        flags_by[r["type"]][r["evidence_level"]] = flags_by[r["type"]].get(r["evidence_level"], 0) + 1
    lenders = sorted((n for n in node_rows if n["node_type"] == "lender"), key=lambda n: -float(n["weighted_degree"]))[:8]
    events = _events_from_rows(effect_rows or [])
    return {
        "generated_on": today, "status": status["status"], "quant_model": status,
        "components": comps,
        "rules": {"min_components": MIN_COMPONENTS, "min_docs_stance": MIN_DOCS, "normalisation": "winsorised (2.5–97.5 pct) min–max over the pooled panel, both actors on one scale",
                  "weights": "equal, renormalised over the available components", "sensitivity": {"draws": status.get("draws"), "dirichlet_alpha": DIRICHLET_ALPHA, "rank_share": RANK_SHARE,
                                                                                                   "band": "5th–95th percentile", "rank_stability": status.get("rank_stability")}},
        "index": {"rows": len(influence), "with_value": len(with_value), "years": [years[0], years[-1]] if years else None,
                  "countries": sorted({r["country"] for r in with_value}), "per_mineral": sorted({r["mineral"] for r in idx_rows if r["mineral"] != "all"})},
        "say_do": {"rows": len(sd_rows), "countries": sorted({r["country"] for r in sd_rows})},
        "flags_by_type": flags_by,
        "concentration": {"rows": len(conc_rows), "hhi": "not computed: partner flows for the United States, China and the world total only"},
        "network": {"nodes": len(node_rows), "edges": len(edge_rows), "unattributed_events": status.get("unattributed_finance_events"),
                    "top_lenders": [{"label": n["label"], "origin": n["origin"], "degree": int(n["degree"]), "weighted_degree_musd": round(float(n["weighted_degree"]) / 1e6, 1)} for n in lenders]},
        "regressions": {"rows": [{k: r[k] for k in ("spec", "variant", "outcome", "actor", "term", "coef", "se", "t", "p_cluster", "p_wild", "jk_min", "jk_max", "n_obs", "n_countries", "years", "r2_within")} for r in (reg_rows or [])],
                        "terms": TERMS, "min_obs": MIN_OBS, "min_countries": MIN_COUNTRIES, "n_boot": status.get("n_boot"),
                        "note": (reg_rows or [{}])[0].get("note") if reg_rows else "not computed: too few observations or countries"},
        "events": {"total": len(events), "reviewed": sum(1 for e in events.values() if e["status"] == "reviewed"),
                   "draft": sum(1 for e in events.values() if e["status"] != "reviewed"), "to_verify": sum(1 for e in events.values() if e["verify"]),
                   "rows": len(effect_rows or []), "with_window": sum(1 for r in (effect_rows or []) if r["diff"] is not None),
                   "did_rows": sum(1 for r in (effect_rows or []) if r["design"] == "did" and r["diff"] is not None),
                   "list": sorted(events.values(), key=lambda e: e["date"])},
    }


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
    # Phase 3 model outputs (empty lists until the text workflow has run)
    cls_rows = _rows(con, "SELECT * FROM doc_classification")
    metrics = _rows(con, "SELECT * FROM validation_metric")
    sample_rows = _rows(con, "SELECT doc_id, coder, round FROM validation_sample")
    chosen, text_status = pick_classifications(cls_rows, metrics, len(docs))
    translations = _translations(_rows(con, "SELECT * FROM doc_translation"))
    topic_rows = _rows(con, "SELECT * FROM topic")
    doc_topic_rows = _rows(con, "SELECT * FROM doc_topic")
    mv_rows = _rows(con, "SELECT country, period, items_total FROM media_volume")
    # Phase 4 quant outputs (empty lists until `scm analyse` has run)
    conc_rows = _rows(con, "SELECT country, mineral, year, metric, value, note FROM concentration")
    idx_rows = _rows(con, "SELECT * FROM index_value")
    comp_rows = _rows(con, "SELECT * FROM index_component")
    sd_rows = _rows(con, "SELECT * FROM say_do_gap")
    flag_rows = _rows(con, "SELECT * FROM anomaly_flag")
    node_rows = _rows(con, "SELECT * FROM network_metric")
    edge_rows = _rows(con, "SELECT * FROM network_edge")
    effect_rows = _rows(con, "SELECT * FROM event_effect")
    reg_rows = _rows(con, "SELECT * FROM regression_result")
    qrun = _rows(con, "SELECT * FROM quant_run ORDER BY created_at DESC LIMIT 1")
    quant_status = _quant_status(qrun, idx_rows, text_status)
    from .text import series as text_series

    docs_df = pd.DataFrame(docs) if docs else pd.DataFrame(columns=["doc_id", "country", "year", "doc_type", "mentions_us", "mentions_cn"])
    cls_df = pd.DataFrame(list(chosen.values())) if chosen else pd.DataFrame(columns=["doc_id", "stance_us", "stance_cn", "tone"])
    stance_by_iso = text_series.stance_series(docs_df, cls_df)
    volume_by_iso, volume_basis = text_series.media_series(docs_df, cls_df, pd.DataFrame(mv_rows) if mv_rows else None)
    news_ids = {d["doc_id"] for d in docs if d["doc_type"] == "news"}
    media_topics = [r for r in doc_topic_rows if r["doc_id"] in news_ids]  # the Media tab shows press narratives only
    narratives_by_iso = text_series.narratives(docs_df, pd.DataFrame(media_topics) if media_topics else pd.DataFrame(),
                                               pd.DataFrame(topic_rows) if topic_rows else pd.DataFrame())
    n_parl_coded = n_media_coded = n_parl_translated = 0
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
            c = chosen.get(r["doc_id"])
            tr = translations.get((r["doc_id"], "title"))
            if r["language"] == "en":
                title_en, tr_block = r["title_original"], {"method": "none", "model": None}
            else:
                title_en, tr_block = (tr["text"], {"method": tr["method"], "model": tr["model"]}) if tr else (None, None)
            parl_docs.append({
                "id": r["doc_id"], "date": r["date"], "date_precision": r["date_precision"], "chamber": r["venue"], "type": r["doc_type"],
                "title_original": r["title_original"], "language": r["language"], "title_en": title_en, "translation": tr_block,
                "summary": r["summary"], "status": r["status"], "author": r["author"],
                "stance_us": _json_safe(c["stance_us"]) if c else None, "stance_cn": _json_safe(c["stance_cn"]) if c else None,
                "classification": "coded" if c else "not_yet_classified", "classifier": _classifier_block(c),
                "topic_minerals": [m for m in str(r["minerals"] or "").split(",") if m], "mentions": {"us": bool(r["mentions_us"]), "cn": bool(r["mentions_cn"])},
                "vote": vote_block, "url": r["source_record_url"] or "", "source": _src(r["source_id"], r["source_record_url"]),
            })
            n_parl_coded += 1 if c else 0
            n_parl_translated += 1 if title_en else 0
        parl_docs.sort(key=lambda d: d["date"], reverse=True)
        parl_src = sorted({d["source"]["id"] for d in parl_docs})
        n_votes = sum(1 for d in parl_docs if d["vote"])
        if parl_docs:
            parl_file = {"dataset": "REAL", "iso3": iso, "generated_on": today, "documents": parl_docs,
                         "freshness": {"last_updated": today, "source_ids": parl_src, "schedule": "monthly"}}
            if any(d["classification"] == "coded" for d in parl_docs):
                parl_file["stance_series"] = stance_by_iso.get(iso, [])
                parl_file["text_model"] = text_status
            (out / "parliament" / f"{iso}.json").write_text(json.dumps(parl_file, ensure_ascii=False, default=str), encoding="utf-8")

        # media: headline, date, outlet and URL only
        articles = []
        for r in docs:
            if r["country"] != iso or r["doc_type"] != "news":
                continue
            outlet_id = r["outlet_source_id"] or r["source_id"]
            o = reg.get(outlet_id)
            c = chosen.get(r["doc_id"])
            tr = translations.get((r["doc_id"], "title"))
            if r["language"] == "en":
                headline_en, tr_block = r["title_original"], {"method": "none", "model": None}
            else:
                headline_en, tr_block = (tr["text"], {"method": tr["method"], "model": tr["model"]}) if tr else (None, None)
            articles.append({
                "id": r["doc_id"], "date": r["date"], "date_precision": r["date_precision"], "outlet": o.name if o else r["venue"], "outlet_source_id": outlet_id,
                "orientation": o.orientation if o else None, "reliability": r["reliability"], "headline_original": r["title_original"], "language": r["language"],
                "headline_en": headline_en, "translation": tr_block, "url": r["source_record_url"] or "",
                "stance_us": _json_safe(c["stance_us"]) if c else None, "stance_cn": _json_safe(c["stance_cn"]) if c else None,
                "tone": _json_safe(c["tone"]) if c else None, "classification": "coded" if c else "not_yet_classified", "classifier": _classifier_block(c),
                "topic_minerals": [m for m in str(r["minerals"] or "").split(",") if m], "mentions": {"us": bool(r["mentions_us"]), "cn": bool(r["mentions_cn"])},
                "via": "gdelt" if r["source_id"] == "gdelt" else "rss", "also_reported_by": [s for s in str(r.get("source_ids") or "").split(",") if s and s != r["source_id"]],
                "source": _src(r["source_id"], r["source_record_url"]),
            })
        articles.sort(key=lambda a: a["date"], reverse=True)
        articles = articles[:MAX_ARTICLES]
        assert all(set(a) <= ARTICLE_KEYS for a in articles), "article export carries an unexpected field"
        outlets = {sid: {"name": s.name, "orientation": s.orientation, "reliability": s.reliability, "paywall": s.paywall}
                   for sid, s in reg.items() if s.category == "press" and iso in s.countries}
        n_media_coded += sum(1 for a in articles if a["classification"] == "coded")
        if articles:
            media_file = {"dataset": "REAL", "iso3": iso, "generated_on": today, "articles": articles, "outlets": outlets,
                          "freshness": {"last_updated": today, "source_ids": sorted({a["source"]["id"] for a in articles}),
                                        "schedule": "weekly (RSS) and monthly windows (GDELT)"}}
            if any(a["classification"] == "coded" for a in articles):
                media_file["volume"] = volume_by_iso.get(iso, [])
                media_file["volume_basis"] = volume_basis
                media_file["narratives"] = narratives_by_iso.get(iso, [])
                media_file["text_model"] = text_status
            (out / "media" / f"{iso}.json").write_text(json.dumps(media_file, ensure_ascii=False, default=str), encoding="utf-8")

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
        unattributed = sum(1 for r in f_rows if not r["actor_to"] and r["actor_from_origin"] in ("US", "CN"))
        analysis = _analysis_block(iso, idx_rows, comp_rows, sd_rows, flag_rows, conc_rows, node_rows, edge_rows, unattributed, quant_status, effect_rows)
        analysis_years = sorted({r["year"] for r in (analysis["index"] if analysis else []) if r["index_name"] == "influence" and r["value"] is not None})
        if analysis:
            country["analysis"] = analysis
            a_src = {s for c in analysis["components"] for comp in c["components"] for s in comp["source_ids"]}
            country["freshness"]["analysis"] = {"last_updated": today, "source_ids": sorted(a_src), "schedule": "monthly (recomputed with each ingestion run)"}
        (out / "country" / f"{iso}.json").write_text(json.dumps(country, ensure_ascii=False, default=str), encoding="utf-8")
        coverage[iso] = {
            "trade_years": years, "mirror_years": mirror_years, "events": len(events), "contracts": len(c_rows), "governance": len(g_rows), "production": len(p_rows),
            "actions": bool(events or trade_block), "governance_available": bool(g_rows),
            "parliament_available": bool(parl_docs), "parliament_documents": len(parl_docs), "parliament_votes": n_votes,
            "parliament_from": min((int(d["date"][:4]) for d in parl_docs), default=None), "parliament_note": NO_STRUCTURED_LEGISLATURE.get(iso) if not parl_docs else None,
            "media_available": bool(articles), "media_articles": len(articles), "media_from": min((int(a["date"][:4]) for a in articles), default=None),
            "concessions": conc_by_country.get(iso, 0),
            "parliament_classified": sum(1 for d in parl_docs if d["classification"] == "coded"),
            "parliament_translated": sum(1 for d in parl_docs if d["title_en"]),
            "media_classified": sum(1 for a in articles if a["classification"] == "coded"),
            "narratives_available": bool(narratives_by_iso.get(iso)),
            "analysis_available": bool(analysis_years), "analysis_years": [analysis_years[0], analysis_years[-1]] if analysis_years else None,
            "flags": len(analysis["flags"]) if analysis else 0,
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
    influence = [{"iso3": r["country"], "year": int(r["year"]), "actor": r["actor"], "mineral": r["mineral"], "value": r["value"], "lower": r["lower"], "upper": r["upper"], "n_components": int(r["n_components"])}
                 for r in idx_rows if r["index_name"] == "influence" and r["value"] is not None]
    (out / "index.json").write_text(json.dumps({"dataset": "REAL", "generated_on": today, "layer": "real" if influence else "none",
                                                "method": f"Composite influence index, method {quant_status.get('method_version')}, weights {quant_status.get('weights_version')}; band = 5th–95th percentile over {quant_status.get('draws')} weight and normalisation draws",
                                                "quant_model": quant_status, "rows": influence}, ensure_ascii=False, default=str), encoding="utf-8")
    (out / "quant.json").write_text(json.dumps(_quant_file(quant_status, idx_rows, comp_rows, sd_rows, flag_rows, conc_rows, node_rows, edge_rows, today, reg_rows, effect_rows), ensure_ascii=False, default=str, indent=1), encoding="utf-8")
    (out / "prices.json").write_text(json.dumps({"dataset": "REAL", "generated_on": today, "series": prices}, ensure_ascii=False, default=str), encoding="utf-8")
    (out / "policy.json").write_text(json.dumps({"dataset": "REAL", "generated_on": today, "documents": [{**p, "source": _src(p["source_id"], p["source_record_url"])} for p in policy]}, ensure_ascii=False, default=str), encoding="utf-8")
    meta = {
        "dataset": "REAL", "generated_on": today, "generated_at": datetime.now(UTC).isoformat(timespec="seconds"),
        "sources_ok": ok_sources, "ingest_runs": runs,
        "tables": {t: int(con.execute(f"SELECT count(*) FROM {t}").fetchone()[0]) for t in SCHEMAS if t != "ingest_run" and _table_exists(con, t)},
        # layers: "facts_only" = real records without model outputs; "real" = records plus labelled model outputs
        # (text_model says whether the classifier is a zero-shot baseline or validated); charts labelled accordingly
        "layers": {"facts": "real",
                   "model_outputs": ("validated" if text_status["validated"] else "zero_shot_baseline") if n_parl_coded or n_media_coded else "sample",
                   "parliament": "real" if n_parl_coded else "facts_only" if any(c["parliament_available"] for c in coverage.values()) else "sample",
                   "media": "real" if n_media_coded else "facts_only" if any(c["media_available"] for c in coverage.values()) else "sample",
                   "analysis": "real" if influence else "sample", "forecast": "sample"},
        "text_model": text_status,
        "quant_model": quant_status,
        "coverage": coverage,
    }
    (out / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, default=str, indent=1), encoding="utf-8")
    (out / "validation.json").write_text(json.dumps(_validation_file(metrics, sample_rows, text_status, today), ensure_ascii=False, default=str, indent=1), encoding="utf-8")
    (out / "coverage.json").write_text(json.dumps({"generated_on": today, "countries": coverage}, indent=1), encoding="utf-8")
    con.close()
    return {"countries": len(coverage), "tables": meta["tables"], "sources_ok": ok_sources}


def _table_exists(con: duckdb.DuckDBPyConnection, name: str) -> bool:
    return bool(con.execute("SELECT count(*) FROM information_schema.tables WHERE table_name = ?", [name]).fetchone()[0])
