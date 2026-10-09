"""Warehouse table schemas (pandera). Column names follow docs/PHASE0_PLAN.md section 4.

Every fact table carries the provenance columns in PROVENANCE. `value_type` is
"reported" (the country's own statistics), "mirror" (partner-reported) or
"estimated" (method required in `note`).
"""
from __future__ import annotations

import pandas as pd
import pandera.pandas as pa
from pandera.pandas import Check, Column, DataFrameSchema

from .registry import IN_SCOPE

RELIABILITY = ["official", "independent_academic", "partisan", "state_media", "analysis"]
CONFIDENCE = ["documented", "strongly_indicated", "speculative"]
VALUE_TYPE = ["reported", "mirror", "estimated"]

PROVENANCE: dict[str, Column] = {
    "source_id": Column(str),
    "source_url": Column(str),
    "source_record_url": Column(str, nullable=True),
    "retrieved_at": Column(str),
    "original_language": Column(str),
    "reliability": Column(str, Check.isin(RELIABILITY)),
    "confidence": Column(str, Check.isin(CONFIDENCE)),
}

trade_flow = DataFrameSchema(
    {
        "reporter": Column(str, Check.str_length(3, 3)),
        "partner": Column(str, Check.str_length(3, 3)),
        "reported_by": Column(str, Check.str_length(3, 3)),
        "hs6": Column(str, Check.str_length(6, 6)),
        "mineral": Column(str),
        "stage": Column(str),
        "year": Column(int, Check.in_range(1990, 2100)),
        "month": Column(pd.Int64Dtype(), nullable=True),
        "flow": Column(str, Check.isin(["X", "M"])),
        "value_usd": Column(float, Check.ge(0)),
        "qty": Column(float, nullable=True),
        "qty_unit": Column(str, nullable=True),
        "value_type": Column(str, Check.isin(VALUE_TYPE)),
        **PROVENANCE,
    },
    coerce=True, strict=True, name="trade_flow",
)

finance_event = DataFrameSchema(
    {
        "event_id": Column(str, unique=True),
        "country": Column(str, Check.str_length(3, 3)),
        "date": Column(str, nullable=True),
        "year": Column(int, Check.in_range(1900, 2100)),  # OPIC-era DFC records start in the 1960s
        "actor_from": Column(str, nullable=True),
        "actor_from_origin": Column(str, Check.isin(["US", "CN", "other", "unknown"])),
        "actor_to": Column(str, nullable=True),
        "type": Column(str),
        "amount_usd": Column(float, nullable=True),
        "currency": Column(str, nullable=True),
        "sector": Column(str, nullable=True),
        "mineral": Column(str, nullable=True),
        "description": Column(str),
        "value_type": Column(str, Check.isin(VALUE_TYPE)),
        **PROVENANCE,
    },
    coerce=True, strict=True, name="finance_event",
)

deal_event = DataFrameSchema(
    {
        "event_id": Column(str, unique=True),
        "country": Column(str, Check.str_length(3, 3)),
        "date": Column(str, nullable=True),
        "year": Column(int, Check.in_range(1990, 2100)),
        "type": Column(str),
        "actors": Column(str),
        "actor_origin": Column(str, Check.isin(["US", "CN", "other", "unknown"])),
        "amount_usd": Column(float, nullable=True),
        "mineral": Column(str, nullable=True),
        "project": Column(str, nullable=True),
        "description": Column(str),
        "value_type": Column(str, Check.isin(VALUE_TYPE)),
        **PROVENANCE,
    },
    coerce=True, strict=True, name="deal_event",
)

production = DataFrameSchema(
    {
        "country": Column(str, Check.str_length(3, 3)),
        "mineral": Column(str),
        "measure": Column(str, Check.isin(["production", "reserves"])),
        "year": Column(int, Check.in_range(1900, 2100)),  # national series (GGMC) start in 1979
        "qty": Column(float, nullable=True),
        "unit": Column(str),
        "value_type": Column(str, Check.isin(VALUE_TYPE)),
        "note": Column(str, nullable=True),
        **PROVENANCE,
    },
    coerce=True, strict=True, name="production",
)

price = DataFrameSchema(
    {
        "mineral": Column(str),
        "series": Column(str),
        "date": Column(str),
        "year": Column(int),
        "month": Column(pd.Int64Dtype(), nullable=True),
        "price": Column(float, nullable=True),
        "unit": Column(str),
        "value_type": Column(str, Check.isin(VALUE_TYPE)),
        "note": Column(str, nullable=True),
        **PROVENANCE,
    },
    coerce=True, strict=True, name="price",
)

governance = DataFrameSchema(
    {
        "country": Column(str, Check.str_length(3, 3)),
        "year": Column(int, Check.in_range(1900, 2100)),
        "indicator": Column(str),
        "indicator_name": Column(str),
        "value": Column(float, nullable=True),
        "value_type": Column(str, Check.isin(VALUE_TYPE)),
        **PROVENANCE,
    },
    coerce=True, strict=True, name="governance",
)

contract = DataFrameSchema(
    {
        "contract_id": Column(str, unique=True),
        "country": Column(str, Check.str_length(3, 3)),
        "title": Column(str),
        "resource": Column(str, nullable=True),
        "mineral": Column(str, nullable=True),
        "companies": Column(str, nullable=True),
        "signature_year": Column(pd.Int64Dtype(), nullable=True),
        "contract_type": Column(str, nullable=True),
        "language": Column(str, nullable=True),
        "value_type": Column(str, Check.isin(VALUE_TYPE)),
        **PROVENANCE,
    },
    coerce=True, strict=True, name="contract",
)

policy_document = DataFrameSchema(
    {
        "doc_id": Column(str, unique=True),
        "jurisdiction": Column(str, Check.isin(["US", "CN"])),
        "date": Column(str),
        "year": Column(int),
        "doc_type": Column(str),
        "title": Column(str),
        "agency": Column(str, nullable=True),
        "abstract": Column(str, nullable=True),
        "topics": Column(str, nullable=True),
        "value_type": Column(str, Check.isin(VALUE_TYPE)),
        **PROVENANCE,
    },
    coerce=True, strict=True, name="policy_document",
)

DOC_TYPES = ["bill", "vote", "debate", "hearing", "news", "gazette", "press_release", "policy"]
LANGUAGES = ["es", "pt", "en", "nl", "multi"]
CHOICES = ["yes", "no", "abstain", "absent", "obstruction", "other"]


def _news_has_no_summary(df: pd.DataFrame) -> bool:
    """Brief section 4: for news only headline, date, outlet and URL are stored."""
    if df.empty:
        return True
    news = df["doc_type"] == "news"
    return bool(df.loc[news, "summary"].isna().all())


document = DataFrameSchema(
    {
        "doc_id": Column(str, unique=True),
        "country": Column(str, Check.str_length(3, 3)),
        "doc_type": Column(str, Check.isin(DOC_TYPES)),
        "date": Column(str, Check.str_matches(r"^\d{4}-\d{2}-\d{2}$")),
        "date_precision": Column(str, Check.isin(["day", "month", "year", "seen"])),
        "year": Column(int, Check.in_range(1990, 2100)),
        "title_original": Column(str),
        "language": Column(str, Check.isin(LANGUAGES)),
        "venue": Column(str),  # chamber (parliament) or outlet name (news)
        "outlet_source_id": Column(str, nullable=True),
        "author": Column(str, nullable=True),
        "summary": Column(str, nullable=True),  # bill ementa / sumario only; null for news
        "status": Column(str, nullable=True),
        "native_id": Column(str, nullable=True),
        "url_norm": Column(str),
        "keywords_matched": Column(str),
        "minerals": Column(str, nullable=True),
        "mentions_us": Column(bool),
        "mentions_cn": Column(bool),
        "mining_related": Column(bool),
        "filter_version": Column(str),
        "full_text_stored": Column(bool, Check.isin([False])),
        "value_type": Column(str, Check.isin(VALUE_TYPE)),
        **PROVENANCE,
    },
    checks=[Check(_news_has_no_summary, error="news rows must not carry a summary (headline-only rule)")],
    coerce=True, strict=True, name="document",
)

vote = DataFrameSchema(
    {
        "vote_id": Column(str, unique=True),
        "doc_id": Column(str),
        "country": Column(str, Check.str_length(3, 3)),
        "chamber": Column(str),
        "date": Column(str, Check.str_matches(r"^\d{4}-\d{2}-\d{2}$")),
        "year": Column(int, Check.in_range(1990, 2100)),
        "title_original": Column(str),
        "result": Column(str, nullable=True),
        "yes": Column(pd.Int64Dtype(), nullable=True),
        "no": Column(pd.Int64Dtype(), nullable=True),
        "abstain": Column(pd.Int64Dtype(), nullable=True),
        "absent": Column(pd.Int64Dtype(), nullable=True),
        "total": Column(pd.Int64Dtype(), nullable=True),
        "native_id": Column(str, nullable=True),
        "value_type": Column(str, Check.isin(VALUE_TYPE)),
        **PROVENANCE,
    },
    coerce=True, strict=True, name="vote",
)

vote_member = DataFrameSchema(
    {
        "vote_id": Column(str),
        "country": Column(str, Check.str_length(3, 3)),
        "member_id": Column(str),
        "member_name": Column(str),
        "party": Column(str, nullable=True),
        "region": Column(str, nullable=True),
        "choice": Column(str, Check.isin(CHOICES)),
        "choice_original": Column(str),
        **PROVENANCE,
    },
    coerce=True, strict=True, name="vote_member",
)

concession = DataFrameSchema(
    {
        "concession_id": Column(str, unique=True),
        "country": Column(str, Check.str_length(3, 3)),
        "title": Column(str),
        "holder": Column(str, nullable=True),
        "minerals": Column(str, nullable=True),
        "mineral": Column(str, nullable=True),
        "status": Column(str, nullable=True),
        "granted_date": Column(str, nullable=True),
        "granted_year": Column(pd.Int64Dtype(), nullable=True),
        "expires_year": Column(pd.Int64Dtype(), nullable=True),
        "area_ha": Column(float, nullable=True),
        "lat": Column(float, nullable=True),
        "lon": Column(float, nullable=True),
        "native_id": Column(str, nullable=True),
        "value_type": Column(str, Check.isin(VALUE_TYPE)),
        **PROVENANCE,
    },
    coerce=True, strict=True, name="concession",
)

media_volume = DataFrameSchema(
    {
        "country": Column(str, Check.str_length(3, 3)),
        "period": Column(str),  # ISO date of the fetch (RSS) or window start (GDELT)
        "items_total": Column(int),
        "items_mining": Column(int),
        "items_cn": Column(int),
        "items_us": Column(int),
        **PROVENANCE,
    },
    coerce=True, strict=True, name="media_volume",
)

ingest_run = DataFrameSchema(
    {
        "run_id": Column(str),
        "source_id": Column(str),
        "started_at": Column(str),
        "finished_at": Column(str),
        "status": Column(str, Check.isin(["ok", "failed", "skipped"])),
        "rows": Column(str),
        "error": Column(str, nullable=True),
        "snapshot_dir": Column(str, nullable=True),
    },
    coerce=True, strict=True, name="ingest_run",
)

# ---- Phase 3 model outputs: separate tables from facts (docs/PHASE0_PLAN.md section 4.3). They carry the
# model, run and codebook version instead of source provenance; the exporter labels them as model outputs.
TEXT_METHODS = ["zero_shot", "trained", "human"]
CODERS = ["template", "coder1", "coder2", "adjudicated"]

doc_translation = DataFrameSchema(
    {
        "doc_id": Column(str),
        "field": Column(str, Check.isin(["title", "summary"])),
        "lang_from": Column(str, Check.isin(LANGUAGES)),
        "lang_to": Column(str),
        "text": Column(str),
        "method": Column(str, Check.isin(["mt", "llm", "human"])),
        "model": Column(str),
        "created_at": Column(str),
    },
    coerce=True, strict=True, name="doc_translation",
)

doc_classification = DataFrameSchema(
    {
        "doc_id": Column(str),
        "run_id": Column(str),
        "method": Column(str, Check.isin(TEXT_METHODS)),
        "model": Column(str),
        "codebook_version": Column(str),
        "stance_us": Column("Int64", Check.in_range(-2, 2), nullable=True),  # null = actor not mentioned (not applicable)
        "stance_us_conf": Column(float, Check.in_range(0, 1), nullable=True),
        "stance_cn": Column("Int64", Check.in_range(-2, 2), nullable=True),
        "stance_cn_conf": Column(float, Check.in_range(0, 1), nullable=True),
        "tone": Column(float, Check.in_range(-1, 1), nullable=True),
        "tone_conf": Column(float, Check.in_range(0, 1), nullable=True),
        "frame": Column(str, nullable=True),
        "created_at": Column(str),
    },
    coerce=True, strict=True, name="doc_classification",
)

doc_embedding = DataFrameSchema(
    {
        "doc_id": Column(str),
        "model": Column(str),
        "dim": Column(int),
        "vector": Column(object),  # list[float] of length dim
    },
    coerce=True, strict=True, name="doc_embedding",
)

topic_model_run = DataFrameSchema(
    {
        "run_id": Column(str),
        "corpus": Column(str, Check.isin(["parliament", "media"])),
        "method": Column(str),
        "params": Column(str),  # JSON
        "n_docs": Column(int),
        "created_at": Column(str),
    },
    coerce=True, strict=True, name="topic_model_run",
)

topic = DataFrameSchema(
    {
        "run_id": Column(str),
        "topic_id": Column(int),
        "label": Column(str),
        "keywords": Column(str),  # comma-separated, most specific first
        "example_doc_ids": Column(str),  # comma-separated doc_ids nearest the centroid
        "n_docs": Column(int),
    },
    coerce=True, strict=True, name="topic",
)

doc_topic = DataFrameSchema(
    {
        "doc_id": Column(str),
        "run_id": Column(str),
        "topic_id": Column(int),
        "prob": Column(float, Check.in_range(0, 1)),
    },
    coerce=True, strict=True, name="doc_topic",
)

validation_sample = DataFrameSchema(
    {
        "doc_id": Column(str),
        "coder": Column(str, Check.isin(CODERS)),
        "round": Column(str),
        "applicable_us": Column("boolean", nullable=True),
        "stance_us": Column("Int64", Check.in_range(-2, 2), nullable=True),
        "applicable_cn": Column("boolean", nullable=True),
        "stance_cn": Column("Int64", Check.in_range(-2, 2), nullable=True),
        "tone": Column("Int64", Check.in_range(-1, 1), nullable=True),
        "topic": Column(str, nullable=True),
        "confidence": Column("Int64", Check.in_range(1, 3), nullable=True),
        "notes": Column(str, nullable=True),
        "split": Column(str, Check.isin(["train", "held_out"]), nullable=True),
        "coded_at": Column(str, nullable=True),
    },
    coerce=True, strict=True, name="validation_sample",
)

validation_metric = DataFrameSchema(
    {
        "run_id": Column(str),
        "codebook_version": Column(str),
        "method": Column(str, Check.isin(["agreement", "zero_shot", "trained"])),
        "target": Column(str),
        "class": Column(str),
        "metric": Column(str),
        "value": Column(float, nullable=True),
        "n": Column(int),
        "split": Column(str),
        "created_at": Column(str),
    },
    coerce=True, strict=True, name="validation_metric",
)

# ---- Phase 4 model outputs (docs/PHASE0_PLAN.md section 4.4): computed from the fact tables by `scm analyse`, replaced
# wholesale on every run. Every row names the method version, the run and the data release it was computed from.
QUANT_STAMP = {
    "method_version": Column(str),
    "run_id": Column(str),
    "inputs_release": Column(str),
}
ACTORS = ["US", "CN"]
INDEX_NAMES = ["influence", "economic_ties", "political_alignment"]

concentration = DataFrameSchema(
    {
        "country": Column(str, Check.isin(IN_SCOPE)),
        "mineral": Column(str),  # a mineral id or "all"
        "year": Column(int),
        "metric": Column(str),
        "value": Column(float, nullable=True),  # null = not computable (the note says why)
        "note": Column(str, nullable=True),
        **QUANT_STAMP,
    },
    coerce=True, strict=True, name="concentration",
)

index_value = DataFrameSchema(
    {
        "country": Column(str, Check.isin(IN_SCOPE)),
        "year": Column(int),
        "actor": Column(str, Check.isin(ACTORS)),
        "mineral": Column(str),
        "index_name": Column(str, Check.isin(INDEX_NAMES)),
        "value": Column(float, Check.in_range(0, 100), nullable=True),
        "lower": Column(float, Check.in_range(0, 100), nullable=True),  # 5th percentile over the sensitivity draws
        "upper": Column(float, Check.in_range(0, 100), nullable=True),  # 95th percentile
        "n_components": Column(int),
        "components_available": Column(str),  # comma-separated component names behind the value
        "weights_version": Column(str),
        **QUANT_STAMP,
    },
    coerce=True, strict=True, name="index_value",
)

index_component = DataFrameSchema(
    {
        "country": Column(str, Check.isin(IN_SCOPE)),
        "year": Column(int),
        "actor": Column(str, Check.isin(ACTORS)),
        "mineral": Column(str),
        "component": Column(str),
        "raw_value": Column(float, nullable=True),
        "normalized_value": Column(float, Check.in_range(0, 100), nullable=True),
        "weight": Column(float, Check.in_range(0, 1)),
        "available": Column(bool),
        "source_ids": Column(str),  # comma-separated
        "note": Column(str, nullable=True),  # why a component is unavailable
        "weights_version": Column(str),
        **QUANT_STAMP,
    },
    coerce=True, strict=True, name="index_component",
)

say_do_gap = DataFrameSchema(
    {
        "country": Column(str, Check.isin(IN_SCOPE)),
        "year": Column(int),
        "actor": Column(str, Check.isin(ACTORS)),
        "rhetoric": Column(float, nullable=True),  # standardised mean legislative stance toward the actor
        "action": Column(float, nullable=True),  # standardised year-on-year change of the economic-ties sub-index
        "gap": Column(float, nullable=True),  # rhetoric minus action
        "n_docs": Column(int),
        "evidence_doc_ids": Column(str),  # '|'-separated doc_ids behind the rhetoric value
        "text_model_status": Column(str),  # the classifier's status label at computation time
        **QUANT_STAMP,
    },
    coerce=True, strict=True, name="say_do_gap",
)

anomaly_flag = DataFrameSchema(
    {
        "flag_id": Column(str, unique=True),
        "country": Column(str, Check.isin(IN_SCOPE)),
        "year": Column(int),
        "actor": Column(str, Check.isin(ACTORS), nullable=True),
        "type": Column(str),
        "evidence_level": Column(str, Check.isin(CONFIDENCE)),
        "description": Column(str),
        "evidence_source_ids": Column(str),  # comma-separated registry source ids
        "score": Column(float, nullable=True),
        **QUANT_STAMP,
    },
    coerce=True, strict=True, name="anomaly_flag",
)

network_metric = DataFrameSchema(
    {
        "node_id": Column(str),
        "node_type": Column(str, Check.isin(["lender", "recipient"])),
        "label": Column(str),
        "origin": Column(str, nullable=True),  # US / CN for lenders
        "country": Column(str, nullable=True),  # recipient's country
        "degree": Column(int),
        "weighted_degree": Column(float),  # summed amounts over the node's edges, USD
        "betweenness": Column(float),
        "eigenvector": Column(float, nullable=True),
        "community": Column(int),
        **QUANT_STAMP,
    },
    coerce=True, strict=True, name="network_metric",
)

network_edge = DataFrameSchema(
    {
        "source_node": Column(str),
        "target_node": Column(str),
        "country": Column(str, Check.isin(IN_SCOPE)),
        "weight_usd": Column(float),
        "n_events": Column(int),
        "source_ids": Column(str),
        **QUANT_STAMP,
    },
    coerce=True, strict=True, name="network_edge",
)

quant_run = DataFrameSchema(
    {
        "created_at": Column(str),
        "weights_version": Column(str),
        "draws": Column(int),
        "rank_stability": Column(float, nullable=True),  # mean Spearman correlation of the perturbed rankings with the baseline
        "notes": Column(str, nullable=True),
        **QUANT_STAMP,
    },
    coerce=True, strict=True, name="quant_run",
)

SCHEMAS: dict[str, DataFrameSchema] = {
    s.name: s for s in [trade_flow, finance_event, deal_event, production, price, governance, contract, policy_document,
                        document, vote, vote_member, concession, media_volume, ingest_run,
                        doc_translation, doc_classification, doc_embedding, topic_model_run, topic, doc_topic,
                        validation_sample, validation_metric,
                        concentration, index_value, index_component, say_do_gap, anomaly_flag, network_metric, network_edge, quant_run]
}
MODEL_OUTPUT_TABLES = ["doc_translation", "doc_classification", "doc_embedding", "topic_model_run", "topic", "doc_topic",
                       "validation_sample", "validation_metric"]
QUANT_TABLES = ["concentration", "index_value", "index_component", "say_do_gap", "anomaly_flag", "network_metric", "network_edge", "quant_run"]

# Merge keys for tables that accumulate across runs (Adapter.incremental): rows with the same key
# are kept once, the first-seen row winning so `retrieved_at` records the first observation.
KEY_COLUMNS: dict[str, list[str]] = {
    "document": ["doc_id"],
    "vote": ["vote_id"],
    "vote_member": ["vote_id", "member_id"],
    "concession": ["concession_id"],
    "media_volume": ["source_id", "country", "period"],
    # model outputs (warehouse.upsert keeps the LAST row per key: a re-run replaces)
    "doc_translation": ["doc_id", "field", "lang_to", "model"],
    "doc_classification": ["doc_id", "method", "model", "codebook_version"],
    "doc_embedding": ["doc_id", "model"],
    "topic_model_run": ["run_id"],
    "topic": ["run_id", "topic_id"],
    "doc_topic": ["doc_id", "run_id"],
    "validation_sample": ["doc_id", "coder", "round"],
    "validation_metric": ["run_id", "method", "target", "class", "metric", "split"],
    # Phase 4 quant outputs (replaced wholesale per run; keys document the grain)
    "concentration": ["country", "mineral", "year", "metric"],
    "index_value": ["country", "year", "actor", "mineral", "index_name"],
    "index_component": ["country", "year", "actor", "mineral", "component"],
    "say_do_gap": ["country", "year", "actor"],
    "anomaly_flag": ["flag_id"],
    "network_metric": ["run_id", "node_id"],
    "network_edge": ["run_id", "source_node", "target_node"],
    "quant_run": ["run_id"],
}


def validate(table: str, df: pd.DataFrame) -> pd.DataFrame:
    schema = SCHEMAS[table]
    # add missing nullable provenance/optional columns as NA so adapters stay short
    for col, spec in schema.columns.items():
        if col not in df.columns and spec.nullable:
            df[col] = pd.NA
    return schema.validate(df, lazy=True)


__all__ = ["SCHEMAS", "KEY_COLUMNS", "MODEL_OUTPUT_TABLES", "QUANT_TABLES", "validate", "pa"]
