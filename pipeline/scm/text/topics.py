"""Narratives: k-means over sentence embeddings, labelled by class-based TF-IDF keywords (no BERTopic: its
umap/hdbscan/numba stack is heavy and version-fragile; k-means on normalised embeddings is deterministic)."""
from __future__ import annotations

import json
import re
import unicodedata
from collections import Counter
from pathlib import Path

import numpy as np
import pandas as pd

from ..paths import REPO_ROOT, WAREHOUSE_DIR
from ..warehouse import replace_slot
from . import models
from .embed import matrix
from .store import corpus, new_run_id, now_iso

STOPWORD_DIR = REPO_ROOT / "pipeline" / "config" / "stopwords"
LABEL_FILE = REPO_ROOT / "pipeline" / "config" / "topic_labels.yaml"
K = {"parliament": 12, "media": 6}
MIN_DOCS = {"parliament": 60, "media": 100}
SEED = 20261004


def _fold(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFKD", s.lower()) if not unicodedata.combining(c))


def stopwords(langs: set[str]) -> set[str]:
    words: set[str] = set()
    for name in sorted(langs | {"domain"}):
        p = STOPWORD_DIR / f"{name}.txt"
        if p.exists():
            words |= {_fold(w.strip()) for w in p.read_text(encoding="utf-8").splitlines() if w.strip() and not w.startswith("#")}
    return words


def tokens(text: str, stop: set[str]) -> list[str]:
    return [t for t in re.findall(r"[a-z][a-z0-9-]{2,}", _fold(text)) if t not in stop and not t.isdigit()]


def kmeans(x: np.ndarray, k: int, seed: int = SEED, iters: int = 30) -> tuple[np.ndarray, np.ndarray]:
    """Plain k-means++ on L2-normalised rows (cosine geometry); returns (labels, centroids)."""
    rng = np.random.default_rng(seed)
    n = len(x)
    k = min(k, n)
    centroids = np.empty((k, x.shape[1]), dtype="float32")
    centroids[0] = x[rng.integers(n)]
    d2 = ((x - centroids[0]) ** 2).sum(1)
    for j in range(1, k):
        probs = d2 / d2.sum() if d2.sum() > 0 else np.full(n, 1 / n)
        centroids[j] = x[rng.choice(n, p=probs)]
        d2 = np.minimum(d2, ((x - centroids[j]) ** 2).sum(1))
    labels = np.zeros(n, dtype=int)
    for _ in range(iters):
        dist = ((x[:, None, :] - centroids[None, :, :]) ** 2).sum(2)
        new = dist.argmin(1)
        if np.array_equal(new, labels) and _:
            break
        labels = new
        for j in range(k):
            members = x[labels == j]
            if len(members):
                c = members.mean(0)
                centroids[j] = c / (np.linalg.norm(c) or 1.0)
    return labels, centroids


def ctfidf_keywords(texts: list[str], labels: np.ndarray, stop: set[str], top: int = 8) -> dict[int, list[str]]:
    """Class-based TF-IDF (BERTopic's labelling idea): term frequency within the cluster, weighted by how
    rare the term is across clusters."""
    per_cluster: dict[int, Counter] = {}
    for t, lab in zip(texts, labels, strict=True):
        per_cluster.setdefault(int(lab), Counter()).update(tokens(t, stop))
    df = Counter()
    for c in per_cluster.values():
        df.update(c.keys())
    n_clusters = len(per_cluster)
    out = {}
    for lab, c in per_cluster.items():
        total = sum(c.values()) or 1
        scored = {w: (cnt / total) * np.log(1 + n_clusters / df[w]) for w, cnt in c.items() if cnt >= 2}
        out[lab] = [w for w, _ in sorted(scored.items(), key=lambda kv: (-kv[1], kv[0]))[:top]]
    return out


def human_labels() -> dict[str, str]:
    """Optional owner-written labels keyed by the first three keywords (survive re-fits that give the same cluster)."""
    if not LABEL_FILE.exists():
        return {}
    import yaml

    data = yaml.safe_load(LABEL_FILE.read_text(encoding="utf-8")) or {}
    return {str(k): str(v) for k, v in data.items()}


def fit(doc_ids: list[str], texts: list[str], vectors: np.ndarray, langs: set[str], k: int, seed: int = SEED) -> tuple[pd.DataFrame, pd.DataFrame]:
    labels, centroids = kmeans(vectors, k, seed)
    keywords = ctfidf_keywords(texts, labels, stopwords(langs))
    custom = human_labels()
    topics, assignments = [], []
    for j in range(len(centroids)):
        idx = np.where(labels == j)[0]
        if not len(idx):
            continue
        kws = keywords.get(j, [])
        sig = ",".join(kws[:3])
        label = custom.get(sig) or " · ".join(kws[:4]) or f"topic {j}"
        dist = ((vectors[idx] - centroids[j]) ** 2).sum(1)
        examples = [doc_ids[i] for i in idx[np.argsort(dist)[:3]]]
        topics.append({"topic_id": j, "label": label, "keywords": ",".join(kws), "example_doc_ids": ",".join(examples), "n_docs": int(len(idx))})
        sims = vectors[idx] @ centroids[j]
        for i, sim in zip(idx, sims, strict=True):
            assignments.append({"doc_id": doc_ids[i], "topic_id": j, "prob": float(max(0.0, min(1.0, (sim + 1) / 2)))})
    return pd.DataFrame(topics), pd.DataFrame(assignments)


def run(warehouse: Path = WAREHOUSE_DIR, corpora: tuple[str, ...] = ("parliament", "media"), progress=None) -> dict:
    docs = corpus(warehouse)
    stats = {}
    for name in corpora:
        sub = docs[docs["doc_type"] == "news"] if name == "media" else docs[docs["doc_type"] != "news"]
        ids, vecs = matrix(warehouse, list(sub["doc_id"]))
        run_id = new_run_id(f"topics-{name}")
        if len(ids) < MIN_DOCS[name]:
            replace_slot("topic_model_run", name, pd.DataFrame([{"run_id": run_id, "corpus": name, "method": "kmeans+ctfidf", "params": json.dumps({"k": K[name], "min_docs": MIN_DOCS[name]}),
                                                                   "n_docs": len(ids), "created_at": now_iso()}]), warehouse)
            replace_slot("topic", name, pd.DataFrame(), warehouse)
            replace_slot("doc_topic", name, pd.DataFrame(), warehouse)
            stats[name] = {"n_docs": len(ids), "topics": 0, "note": f"fewer than {MIN_DOCS[name]} documents; narratives not estimated"}
            continue
        text_by_id = dict(zip(sub["doc_id"], sub["text"], strict=True))
        langs = set(sub["lang"])
        topics, assign = fit(ids, [text_by_id[i] for i in ids], vecs, langs, K[name])
        topics["run_id"], assign["run_id"] = run_id, run_id
        replace_slot("topic_model_run", name, pd.DataFrame([{"run_id": run_id, "corpus": name, "method": "kmeans+ctfidf",
                                                               "params": json.dumps({"k": K[name], "seed": SEED, "embedding": models.model_id("embed")}),
                                                               "n_docs": len(ids), "created_at": now_iso()}]), warehouse)
        replace_slot("topic", name, topics[["run_id", "topic_id", "label", "keywords", "example_doc_ids", "n_docs"]], warehouse)
        replace_slot("doc_topic", name, assign[["doc_id", "run_id", "topic_id", "prob"]], warehouse)
        stats[name] = {"n_docs": len(ids), "topics": int(len(topics))}
        if progress:
            progress({"step": "topics", "corpus": name, **stats[name]})
    return stats
