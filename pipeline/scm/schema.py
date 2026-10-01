"""Warehouse table schemas (pandera). Column names follow docs/PHASE0_PLAN.md section 4.

Every fact table carries the provenance columns in PROVENANCE. `value_type` is
"reported" (the country's own statistics), "mirror" (partner-reported) or
"estimated" (method required in `note`).
"""
from __future__ import annotations

import pandas as pd
import pandera.pandas as pa
from pandera.pandas import Check, Column, DataFrameSchema

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
        "year": Column(int, Check.in_range(1990, 2100)),
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

SCHEMAS: dict[str, DataFrameSchema] = {
    s.name: s for s in [trade_flow, finance_event, deal_event, production, price, governance, contract, policy_document, ingest_run]
}


def validate(table: str, df: pd.DataFrame) -> pd.DataFrame:
    schema = SCHEMAS[table]
    # add missing nullable provenance/optional columns as NA so adapters stay short
    for col, spec in schema.columns.items():
        if col not in df.columns and spec.nullable:
            df[col] = pd.NA
    return schema.validate(df, lazy=True)


__all__ = ["SCHEMAS", "validate", "pa"]
