"""Machine translation of titles (and optionally summaries) into English; the original is always kept."""
from __future__ import annotations

from pathlib import Path

import pandas as pd

from ..paths import WAREHOUSE_DIR
from ..warehouse import upsert
from . import models
from .store import corpus, now_iso, pending

SLOT = "opus_mt"
FIELD_COLUMN = {"title": "title_original", "summary": "summary"}


def model_for(lang: str) -> str:
    return models.model_id("translate_nl" if lang == "nl" else "translate_romance")


def run(warehouse: Path = WAREHOUSE_DIR, fields: tuple[str, ...] = ("title",), limit: int | None = None, force: bool = False,
        progress=None) -> dict:
    docs = corpus(warehouse)
    stats = {"stored": 0, "translated": 0, "skipped_english": 0}
    for field in fields:
        col = FIELD_COLUMN[field]
        cand = docs[docs[col].notna() & (docs[col].astype(str).str.strip() != "")][["doc_id", "lang", col]].rename(columns={col: "source"})
        stats["skipped_english"] += int((cand["lang"] == "en").sum())
        cand = cand[cand["lang"] != "en"]
        rows = []
        for lang, group in cand.groupby("lang"):
            model = model_for(lang)
            todo = pending("doc_translation", SLOT, group, {"field": field, "lang_to": "en", "model": model}, warehouse, force)
            if limit is not None:
                todo = todo.head(max(0, limit - stats["translated"]))
            if todo.empty:
                continue
            texts = [str(t) for t in todo["source"]]
            out = models.translator(lang)(texts)
            stamp = now_iso()
            rows += [{"doc_id": d, "field": field, "lang_from": lang, "lang_to": "en", "text": t, "method": "mt", "model": model, "created_at": stamp}
                     for d, t in zip(todo["doc_id"], out, strict=True)]
            stats["translated"] += len(todo)
            if progress:
                progress({"step": "translate", "field": field, "lang": lang, "done": len(todo)})
        if rows:
            stats["stored"] = upsert("doc_translation", SLOT, pd.DataFrame(rows), warehouse)
    return stats
