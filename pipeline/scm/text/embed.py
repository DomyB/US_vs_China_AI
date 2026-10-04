"""Sentence embeddings per document (reused by the topic model and the trained stance head)."""
from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd

from ..paths import WAREHOUSE_DIR
from ..warehouse import load_slot, upsert
from . import models
from .store import corpus, pending

SLOT = "minilm"


def run(warehouse: Path = WAREHOUSE_DIR, limit: int | None = None, force: bool = False, progress=None, batch: int = 500) -> dict:
    docs = corpus(warehouse)
    model = models.model_id("embed")
    todo = pending("doc_embedding", SLOT, docs, {"model": model}, warehouse, force)
    if limit is not None:
        todo = todo.head(limit)
    stats = {"pending": int(len(todo)), "embedded": 0, "stored": 0}
    if todo.empty:
        return stats
    enc = models.embedder()
    for start in range(0, len(todo), batch):
        chunk = todo.iloc[start:start + batch]
        vecs = np.asarray(enc([str(t) for t in chunk["text"]]), dtype="float32")
        rows = pd.DataFrame({"doc_id": list(chunk["doc_id"]), "model": model, "dim": int(vecs.shape[1]), "vector": [v.tolist() for v in vecs]})
        stats["stored"] = upsert("doc_embedding", SLOT, rows, warehouse)
        stats["embedded"] += len(chunk)
        if progress:
            progress({"step": "embed", "done": stats["embedded"], "pending": stats["pending"]})
    return stats


def matrix(warehouse: Path = WAREHOUSE_DIR, doc_ids: list[str] | None = None) -> tuple[list[str], np.ndarray]:
    """(doc_ids, float32 matrix) of the stored embeddings, optionally restricted and ordered by `doc_ids`."""
    emb = load_slot("doc_embedding", SLOT, warehouse)
    if emb.empty:
        return [], np.zeros((0, 0), dtype="float32")
    if doc_ids is not None:
        emb = emb.set_index("doc_id").reindex(doc_ids).dropna(subset=["vector"]).reset_index()
    return list(emb["doc_id"]), np.asarray([np.asarray(v, dtype="float32") for v in emb["vector"]])
