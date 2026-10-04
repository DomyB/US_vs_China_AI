"""Corpus access and bookkeeping shared by the text steps."""
from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path

import pandas as pd

from ..paths import WAREHOUSE_DIR
from ..schema import KEY_COLUMNS
from ..warehouse import load_slot, news_clusters, table_frames

COUNTRY_LANG = {"BRA": "pt", "GUY": "en", "SUR": "nl"}


def now_iso() -> str:
    return datetime.now(UTC).isoformat(timespec="seconds")


def new_run_id(step: str) -> str:
    return f"{step}-{datetime.now(UTC).strftime('%Y%m%dT%H%M%SZ')}"


def doc_text(title: str | None, summary: str | None) -> str:
    """Unit of analysis: title plus summary, unless the title already carries the summary (Brazilian
    titles are 'PL n/yyyy: <ementa>')."""
    title = (title or "").strip()
    summary = (summary or "").strip() if isinstance(summary, str) else ""
    if not summary or summary.lower() in ("no aplica", "n/a"):
        return title
    probe = summary[:60].lower()
    if probe and probe in title.lower():
        return title if len(title) >= len(summary) else summary
    return f"{title}. {summary}" if title else summary


def corpus(warehouse: Path = WAREHOUSE_DIR) -> pd.DataFrame:
    """Deduplicated documents with `text` and `lang` columns (news de-duplicated across RSS and GDELT)."""
    docs = news_clusters(table_frames("document", warehouse))
    if docs.empty:
        docs["text"] = pd.Series(dtype=str)
        docs["lang"] = pd.Series(dtype=str)
        return docs
    docs = docs.copy()
    docs["text"] = [doc_text(t, s) for t, s in zip(docs["title_original"], docs["summary"], strict=True)]
    docs["lang"] = [lang if lang in ("es", "pt", "en", "nl") else COUNTRY_LANG.get(c, "es") for lang, c in zip(docs["language"], docs["country"], strict=True)]
    # applicability for stance uses the current keyword rule on the text (stored flags are the filter's at ingestion time)
    from ..ingest.keywords import relevance

    rel = [relevance(t) for t in docs["text"]]
    docs["actor_us"] = [r.mentions_us for r in rel]
    docs["actor_cn"] = [r.mentions_cn for r in rel]
    return docs


def pending(table: str, slot: str, candidates: pd.DataFrame, fixed: dict, warehouse: Path = WAREHOUSE_DIR, force: bool = False) -> pd.DataFrame:
    """Rows of `candidates` (which carry doc_id) that have no stored row in warehouse/<table>/<slot> with the
    same key, where the non-doc_id key columns take the `fixed` values (model, codebook_version, ...)."""
    if force or candidates.empty:
        return candidates
    prev = load_slot(table, slot, warehouse)
    if prev.empty:
        return candidates
    for k, v in fixed.items():
        if k in prev.columns:
            prev = prev[prev[k] == v]
    keys = [k for k in KEY_COLUMNS[table] if k not in fixed]
    if keys == ["doc_id"]:
        done = set(prev["doc_id"])
        return candidates[~candidates["doc_id"].isin(done)]
    done = set(map(tuple, prev[keys].itertuples(index=False, name=None)))
    mask = [tuple(r) not in done for r in candidates[keys].itertuples(index=False, name=None)]
    return candidates[mask]
