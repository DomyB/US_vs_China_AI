"""The two step-by-step pages' exports.

`words_file`: every embedded document as a point (the sentence embedding folded to two dimensions by principal
component analysis), with its country, type, date, language, outlet or chamber, narrative, stance labels where
coded, the original title and its English translation, and its three nearest neighbours in the full space; the
narratives' labels; the "featured" documents (each narrative's record nearest its centroid) with their full
vectors and their nearest and farthest records, so the walkthrough can show real numbers.

`components_file`: every all-minerals index component row (country, year, actor, component, raw and normalised
value, availability) with the normalisation bounds and the published index values, so the index walkthrough can
show a country-year as a point and compute distances and projections in the browser.

Nothing is estimated: a document without an embedding is not a point, a component without a value is absent.
"""
from __future__ import annotations

import math
from collections import Counter

import numpy as np

TITLE_CHARS = 160
NEIGHBOURS = 3
FEATURED_NEAR = 5
FEATURED_FAR = 3
NN_BLOCK = 1024


def pca_2d(x: np.ndarray) -> tuple[np.ndarray, list[float]]:
    """(n × 2 coordinates, explained variance ratio of the two components) by singular value decomposition of the
    centred matrix; coordinates are signed so that the first point of each axis is non-negative (a stable sign)."""
    if len(x) == 0:
        return np.zeros((0, 2)), [0.0, 0.0]
    c = x - x.mean(axis=0, keepdims=True)
    k = min(2, c.shape[1])
    u, s, vt = np.linalg.svd(c, full_matrices=False)
    total = float((s**2).sum()) or 1.0
    coords = u[:, :k] * s[:k]
    if k < 2:
        coords = np.hstack([coords, np.zeros((len(x), 2 - k))])
    for j in range(k):
        if coords[0, j] < 0:
            coords[:, j] = -coords[:, j]
    ratio = [float(s[j] ** 2 / total) if j < len(s) else 0.0 for j in range(2)]
    return coords, ratio


def unit_rows(x: np.ndarray) -> np.ndarray:
    n = np.linalg.norm(x, axis=1, keepdims=True)
    n[n == 0] = 1.0
    return x / n


def nearest(x: np.ndarray, k: int = NEIGHBOURS, block: int = NN_BLOCK) -> tuple[np.ndarray, np.ndarray]:
    """For each row of the unit matrix `x`, the indices of its `k` nearest other rows by cosine similarity and the
    similarities, computed in blocks so the full similarity matrix is never held."""
    n = len(x)
    k = min(k, max(n - 1, 0))
    idx = np.zeros((n, k), dtype=int)
    sims = np.zeros((n, k), dtype=float)
    if k == 0:
        return idx, sims
    for start in range(0, n, block):
        s = x[start : start + block] @ x.T
        for i in range(s.shape[0]):
            s[i, start + i] = -2.0  # never its own neighbour
        part = np.argpartition(-s, k - 1, axis=1)[:, :k]
        for i in range(s.shape[0]):
            order = part[i][np.argsort(-s[i, part[i]])]
            idx[start + i] = order
            sims[start + i] = s[i, order]
    return idx, sims


def _title(text: object) -> str | None:
    if text is None or (isinstance(text, float) and math.isnan(text)):
        return None
    t = " ".join(str(text).split())
    return t if len(t) <= TITLE_CHARS else t[: TITLE_CHARS - 1].rstrip() + "…"


def _safe_int(v: object) -> int | None:
    if v is None or (isinstance(v, float) and math.isnan(v)):
        return None
    try:
        return int(v)
    except (TypeError, ValueError):
        return None


def words_file(docs: list[dict], emb_rows: list[dict], translations: dict[tuple[str, str], dict], chosen: dict[str, dict],
               topic_rows: list[dict], doc_topic_rows: list[dict], today: str, human_labels: dict[str, str] | None = None) -> dict:
    """The words-to-geometry export (see the module docstring). `docs` are document_dedup rows, `emb_rows`
    doc_embedding rows (doc_id, model, dim, vector), `translations` (doc_id, field) -> {text, …}, `chosen`
    doc_id -> classification row, `topic_rows` / `doc_topic_rows` the topic model's tables."""
    by_id = {d["doc_id"]: d for d in docs}
    emb = [e for e in emb_rows if e["doc_id"] in by_id and e.get("vector") is not None]
    model = emb[0]["model"] if emb else None
    dim = int(emb[0]["dim"]) if emb else 0
    ids = [e["doc_id"] for e in emb]
    x = np.array([list(map(float, e["vector"])) for e in emb], dtype=float) if emb else np.zeros((0, dim or 1))
    coords, explained = pca_2d(x)
    unit = unit_rows(x) if len(x) else x
    nn_idx, nn_sim = nearest(unit)
    pos = {d: i for i, d in enumerate(ids)}
    # narratives: the latest run per corpus, labelled by the owner's file where a label exists
    labels = human_labels or {}
    topics_out = []
    for r in topic_rows:
        kws = [k.strip() for k in str(r.get("keywords") or "").split(",") if k.strip()]
        lab = labels.get(",".join(kws[:3])) or str(r.get("label") or f"topic {r['topic_id']}")
        examples = [e.strip() for e in str(r.get("example_doc_ids") or "").split(",") if e.strip()]
        topics_out.append({"run_id": r["run_id"], "id": int(r["topic_id"]), "label": lab, "keywords": kws, "n": int(r.get("n_docs") or 0), "example": next((e for e in examples if e in pos), None)})
    doc_topic: dict[str, tuple[str, int]] = {}
    for r in doc_topic_rows:
        doc_topic[r["doc_id"]] = (r["run_id"], int(r["topic_id"]))
    topic_index = {(t["run_id"], t["id"]): i for i, t in enumerate(topics_out)}
    out_docs = []
    for i, doc_id in enumerate(ids):
        d = by_id[doc_id]
        c = chosen.get(doc_id)
        tr = translations.get((doc_id, "title"))
        k = topic_index.get(doc_topic.get(doc_id)) if doc_id in doc_topic else None
        out_docs.append({
            "id": doc_id, "c": d.get("country"), "t": d.get("doc_type"), "d": str(d.get("date") or "")[:10], "l": d.get("language"),
            "o": d.get("outlet_source_id") or d.get("venue") or d.get("source_id"),
            "su": _safe_int(c["stance_us"]) if c else None, "sc": _safe_int(c["stance_cn"]) if c else None,
            "k": k, "x": round(float(coords[i, 0]), 3), "y": round(float(coords[i, 1]), 3),
            "nn": [ids[j] for j in nn_idx[i]],
            "h": _title(d.get("title_original")), "e": _title(tr["text"]) if tr else None,
        })
    featured = []
    for t in topics_out:
        if t["example"] is None:
            continue
        i = pos[t["example"]]
        sims = unit @ unit[i] if len(unit) else np.zeros(0)
        order = np.argsort(-sims)
        near = [{"id": ids[j], "sim": round(float(sims[j]), 3)} for j in order if j != i][:FEATURED_NEAR]
        far = [{"id": ids[j], "sim": round(float(sims[j]), 3)} for j in order[::-1][:FEATURED_FAR]]
        featured.append({"id": t["example"], "topic": topic_index[(t["run_id"], t["id"])], "vector": [round(float(v), 4) for v in x[i]], "near": near, "far": far})
    counts = Counter(d["t"] for d in out_docs)
    langs = Counter(d["l"] for d in out_docs)
    return {
        "dataset": "REAL", "generated_on": today, "layer": "model",
        "model": model, "dim": dim, "n": len(out_docs), "n_documents": len(docs),
        "by_type": dict(sorted(counts.items())), "by_language": dict(sorted(langs.items())),
        "pca": {"explained": [round(v, 4) for v in explained], "method": "principal component analysis of the centred embedding matrix (singular value decomposition); the two axes are the directions of greatest variance and keep the share of variance stated in `explained`"},
        "neighbours": {"k": NEIGHBOURS, "metric": "cosine similarity in the full embedding space"},
        "topics": [{k: v for k, v in t.items() if k != "run_id"} for t in topics_out],
        "featured": featured,
        "docs": out_docs,
    }


def components_file(comp_rows: list[dict], idx_rows: list[dict], scales: dict[str, dict] | None, today: str) -> dict:
    """The data-as-geometry export: the all-minerals component rows and index values of every country, year and
    actor, with the normalisation bounds the quant run used."""
    comps = []
    for r in comp_rows:
        if (r.get("mineral") or "all") != "all":
            continue
        raw = r.get("raw_value")
        norm = r.get("normalized_value")
        comps.append({
            "c": r["country"], "y": int(r["year"]), "a": r["actor"], "k": r["component"],
            "raw": None if raw is None or (isinstance(raw, float) and math.isnan(raw)) else round(float(raw), 6),
            "norm": None if norm is None or (isinstance(norm, float) and math.isnan(norm)) else round(float(norm), 2),
            "ok": bool(r.get("available")), "note": r.get("note") or None,
        })
    index = []
    for r in idx_rows:
        if (r.get("mineral") or "all") != "all":
            continue
        v = r.get("value")
        index.append({"c": r["country"], "y": int(r["year"]), "a": r["actor"], "i": r.get("index_name") or "influence",
                      "v": None if v is None or (isinstance(v, float) and math.isnan(v)) else round(float(v), 2), "n": _safe_int(r.get("n_components"))})
    return {"dataset": "REAL", "generated_on": today, "layer": "model", "scales": scales or {}, "components": comps, "index": index,
            "note": "All-minerals rows of index_component and index_value; raw values are the components' own units (shares, ratios to GDP, agreement rates, stance means), normalised values the 0–100 scale after winsorising at the bounds in `scales`."}
