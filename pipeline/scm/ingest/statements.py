"""Political statements on critical minerals (project dataset, hand-supplied) -> statement.

The owner's dataset: one row per statement or act by one actor on one date about minerals in Latin America,
collected by AI research agents under a fixed codebook, every record carrying the source URL consulted (see
data/manual/statements/README.md). Stance codes are the dataset's own coding and are exported as such: a coded
layer, not a model output of this project and not a validated measurement.
"""
from __future__ import annotations

import os
import re

import pandas as pd

from ..http import Snapshot
from .base import Adapter, fetch_manual

MANUAL_FILE = "data/manual/statements/political_statements_minerals.csv"
STANCE_SCORE = {"positive": 1.0, "neutral": 0.0, "mixed": 0.0, "negative": -1.0}
# reliability of the record's own source, from the dataset's source_type (the registry rating of the compiled
# dataset itself is "analysis"); Chinese and allied state outlets reported as news are state media
STATE_MEDIA_RE = re.compile(r"(?i)\b(xinhua|global times|cgtn|people's daily|china daily|telesur|granma|rt\b|sputnik|prensa latina)")
RELIABILITY_BY_TYPE = {"primary_official": "official", "legislative_record": "official", "news_media": "independent_academic", "think_tank_or_ngo": "analysis", "primary_social_media": "partisan"}
CONFIDENCE_BY_VERIFICATION = {"primary_verified": "documented", "secondary_reported": "strongly_indicated", "unverified": "speculative"}
LIST_FIELDS = ("minerals", "themes", "counterparts_mentioned", "hs6_links")


def _list(v: str) -> str | None:
    parts = [p.strip() for p in str(v or "").split(";") if p.strip()]
    return ",".join(parts) if parts else None


def _text(v) -> str | None:
    s = str(v).strip() if v is not None and not (isinstance(v, float) and pd.isna(v)) else ""
    return s or None


def normalise(df: pd.DataFrame) -> pd.DataFrame:
    """The dataset's columns to the `statement` table (without provenance): dates completed to a day with their
    precision, list fields comma-joined, stance codes kept and scored (+1 / 0 / −1, null when not mentioned)."""
    rows: list[dict] = []
    for r in df.fillna("").to_dict("records"):
        date = str(r["date"]).strip()
        if re.fullmatch(r"\d{4}-\d{2}", date):
            date, precision = f"{date}-01", "month"
        elif re.fullmatch(r"\d{4}-\d{2}-\d{2}", date):
            precision = "day"
        else:
            raise ValueError(f"statement {r.get('id')}: malformed date {date!r}")
        stance_cn, stance_us = str(r["stance_china"]).strip() or "not_mentioned", str(r["stance_us"]).strip() or "not_mentioned"
        source_type = str(r["source_type"]).strip()
        reliability = RELIABILITY_BY_TYPE.get(source_type, "analysis")
        if source_type == "news_media" and STATE_MEDIA_RE.search(str(r["source_name"])):
            reliability = "state_media"
        rows.append({
            "statement_id": str(r["id"]).strip(), "country": str(r["country"]).strip().upper(), "date": date, "date_precision": precision, "year": int(date[:4]),
            "speaker_name": _text(r["speaker_name"]) or "unnamed", "speaker_role": _text(r["speaker_role"]), "speaker_type": _text(r["speaker_type"]) or "other",
            "speaker_bloc": _text(r["speaker_bloc"]) or "Other", "speaker_country": _text(r["speaker_country"]), "party": _text(r["party_or_affiliation"]),
            "channel": _text(r["channel"]) or "other", "event_context": _text(r["event_context"]),
            "minerals": _list(r["minerals"]), "hs6_links": _list(r["hs6_links"]), "themes": _list(r["themes"]), "counterparts": _list(r["counterparts_mentioned"]),
            "stance_cn": stance_cn, "stance_us": stance_us, "stance_cn_score": STANCE_SCORE.get(stance_cn), "stance_us_score": STANCE_SCORE.get(stance_us),
            "related_entities": _text(r["related_entities"]), "summary_en": _text(r["summary_en"]) or "", "quote_original": _text(r["quote_original"]), "quote_en": _text(r["quote_en"]),
            "language": _text(r["language"]) or "other", "source_name": _text(r["source_name"]) or "unknown", "source_type": source_type or "news_media",
            "verification": _text(r["verification"]) or "unverified", "notes": _text(r["notes"]), "batch": _text(r["research_batch"]),
            "value_type": "reported", "source_record_url": _text(r["source_url"]), "original_language": _text(r["language"]) or "other",
            "reliability": reliability, "confidence": CONFIDENCE_BY_VERIFICATION.get(str(r["verification"]).strip(), "speculative"),
        })
    return pd.DataFrame(rows)


class Statements(Adapter):
    source_id = "manual_statements"
    tables = ("statement",)

    def fetch(self, snap: Snapshot) -> None:
        manual = os.environ.get("STATEMENTS_FILE_URL") or MANUAL_FILE
        fetch_manual(snap, manual, "statements.csv", self.src.url)
        snap.manifest["resource_used"] = {"url": manual, "via": "STATEMENTS_FILE_URL or data/manual"}
        snap.save()

    def parse(self, snap: Snapshot) -> dict[str, pd.DataFrame]:
        df = pd.read_csv(snap.path("statements.csv"), dtype=str, keep_default_na=False)
        out = normalise(df)
        # per-record reliability and confidence are set by normalise(); stamp() fills the rest
        return {"statement": self.stamp(snap, out)}
