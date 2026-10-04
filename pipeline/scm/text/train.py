"""Trained stance head: multinomial logistic regression (numpy, L2, full-batch gradient descent) on the frozen
sentence embeddings, fitted on the adjudicated training split and applied to every document (method `trained`).
The head is saved as JSON so inference needs numpy only."""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd

from ..paths import REPO_ROOT, WAREHOUSE_DIR
from ..warehouse import load_slot, upsert
from . import models
from .embed import matrix
from .store import corpus, new_run_id, now_iso

MODEL_DIR = REPO_ROOT / "data" / "models"
MIN_PER_CLASS = 5
SEED = 20261004


def features(vectors: np.ndarray, actor: np.ndarray, mentions_us: np.ndarray, mentions_cn: np.ndarray) -> np.ndarray:
    """embedding ⊕ actor one-hot (US, CN) ⊕ mention flags."""
    a = np.stack([actor == "US", actor == "CN"], axis=1).astype("float32")
    f = np.stack([mentions_us, mentions_cn], axis=1).astype("float32")
    return np.hstack([vectors.astype("float32"), a, f])


def fit_logreg(x: np.ndarray, y: np.ndarray, classes: list[int], c: float = 1.0, iters: int = 400, lr: float = 0.5, seed: int = SEED) -> tuple[np.ndarray, np.ndarray]:
    """Balanced multinomial logistic regression; returns (W[d,k], b[k])."""
    rng = np.random.default_rng(seed)
    n, d = x.shape
    k = len(classes)
    idx = np.array([classes.index(int(v)) for v in y])
    counts = np.bincount(idx, minlength=k).astype("float64")
    weights = (n / (k * np.maximum(counts, 1)))[idx]
    w = rng.normal(0, 0.01, (d, k))
    b = np.zeros(k)
    onehot = np.eye(k)[idx]
    lam = 1.0 / (c * n)
    for _ in range(iters):
        logits = x @ w + b
        logits -= logits.max(1, keepdims=True)
        p = np.exp(logits)
        p /= p.sum(1, keepdims=True)
        g = (p - onehot) * weights[:, None] / n
        w -= lr * (x.T @ g + lam * w)
        b -= lr * g.sum(0)
    return w, b


def predict_proba(x: np.ndarray, w: np.ndarray, b: np.ndarray) -> np.ndarray:
    logits = x @ w + b
    logits -= logits.max(1, keepdims=True)
    p = np.exp(logits)
    return p / p.sum(1, keepdims=True)


def cross_validate(x: np.ndarray, y: np.ndarray, classes: list[int], cs=(0.1, 0.3, 1.0, 3.0, 10.0), folds: int = 5, seed: int = SEED) -> tuple[float, dict]:
    from .metrics import prf

    rng = np.random.default_rng(seed)
    order = rng.permutation(len(y))
    results = {}
    for c in cs:
        scores = []
        for f in range(folds):
            test = order[f::folds]
            train = np.setdiff1d(order, test)
            if len(set(y[train].tolist())) < 2 or len(test) == 0:
                continue
            w, b = fit_logreg(x[train], y[train], classes, c=c)
            pred = [classes[i] for i in predict_proba(x[test], w, b).argmax(1)]
            scores.append(prf([int(v) for v in y[test]], pred, classes)["macro"]["f1"])
        results[c] = {"mean": round(float(np.mean(scores)), 4) if scores else 0.0, "sd": round(float(np.std(scores)), 4) if scores else 0.0}
    best = max(results, key=lambda c: results[c]["mean"])
    return best, results


def training_examples(adjudicated: pd.DataFrame, docs: pd.DataFrame, warehouse: Path) -> tuple[np.ndarray, np.ndarray, list[str]]:
    """One example per (document, applicable actor) with its final stance."""
    ids, vecs = matrix(warehouse, list(adjudicated["doc_id"]))
    vec_of = dict(zip(ids, vecs, strict=True))
    meta = docs.set_index("doc_id")
    xs, ys, keys = [], [], []
    for _, r in adjudicated.iterrows():
        if r["doc_id"] not in vec_of or r["doc_id"] not in meta.index:
            continue
        for actor, app, st in (("US", r["applicable_us"], r["stance_us"]), ("CN", r["applicable_cn"], r["stance_cn"])):
            if not app or st is None or pd.isna(st):
                continue
            d = meta.loc[r["doc_id"]]
            xs.append(features(vec_of[r["doc_id"]][None, :], np.array([actor]), np.array([bool(d["mentions_us"])]), np.array([bool(d["mentions_cn"])]))[0])
            ys.append(int(st))
            keys.append(f"{r['doc_id']}:{actor}")
    return (np.array(xs, dtype="float32") if xs else np.zeros((0, 0), dtype="float32")), np.array(ys, dtype=int), keys


def command_train(codebook: str = "v1", round_: str = "v1", warehouse: Path = WAREHOUSE_DIR, model_dir: Path = MODEL_DIR) -> dict:
    vs = load_slot("validation_sample", "manual", warehouse)
    adj = vs[(vs["coder"] == "adjudicated") & (vs["round"] == round_)] if not vs.empty else vs
    if adj.empty:
        raise RuntimeError("no adjudicated rows; run `validation load` after adjudication")
    train_ids = set(adj[adj["split"] != "held_out"]["doc_id"])
    docs = corpus(warehouse)
    x, y, keys = training_examples(adj[adj["doc_id"].isin(train_ids)], docs, warehouse)
    if len(y) < 20:
        raise RuntimeError(f"only {len(y)} training examples; need at least 20")
    classes = [-2, -1, 0, 1, 2]
    collapsed = any((y == c).sum() < MIN_PER_CLASS for c in classes if (y == c).sum() > 0 or c in (-2, 2))
    if collapsed:
        y = np.sign(y)
        classes = [-1, 0, 1]
    best_c, cv = cross_validate(x, y, classes)
    w, b = fit_logreg(x, y, classes, c=best_c)
    head = {"codebook_version": codebook, "embedding_model": models.model_id("embed"), "classes": classes, "classes_collapsed": collapsed,
            "n_train": int(len(y)), "C": best_c, "cv_macro_f1": cv, "coef": w.tolist(), "intercept": b.tolist(), "created_at": now_iso(),
            "features": "embedding ⊕ actor one-hot ⊕ mention flags"}
    model_dir.mkdir(parents=True, exist_ok=True)
    (model_dir / f"stance_head_{codebook}.json").write_text(json.dumps(head), encoding="utf-8")
    applied = apply_head(head, warehouse)
    return {"n_train": int(len(y)), "classes": classes, "collapsed": collapsed, "C": best_c, "cv": cv, **applied}


def apply_head(head: dict, warehouse: Path = WAREHOUSE_DIR) -> dict:
    """Label every document with the head (method `trained`); tone is copied from the zero-shot row."""
    docs = corpus(warehouse)
    ids, vecs = matrix(warehouse, list(docs["doc_id"]))
    if not ids:
        return {"trained_rows": 0}
    w, b = np.array(head["coef"]), np.array(head["intercept"])
    classes = head["classes"]
    meta = docs.set_index("doc_id")
    zs = load_slot("doc_classification", "zero_shot", warehouse)
    tone_of = dict(zip(zs["doc_id"], zip(zs["tone"], zs["tone_conf"], strict=True), strict=True)) if not zs.empty else {}
    run_id, stamp = new_run_id("trained"), now_iso()
    rows = []
    for i, d in enumerate(ids):
        m = meta.loc[d]
        rec = {"doc_id": d, "run_id": run_id, "method": "trained", "model": f"logreg-on-{head['embedding_model']}", "codebook_version": head["codebook_version"],
               "stance_us": pd.NA, "stance_us_conf": None, "stance_cn": pd.NA, "stance_cn_conf": None,
               "tone": tone_of.get(d, (None, None))[0], "tone_conf": tone_of.get(d, (None, None))[1], "frame": "trained head; tone from zero_shot", "created_at": stamp}
        for actor, flag in (("US", "mentions_us"), ("CN", "mentions_cn")):
            if bool(m[flag]):
                p = predict_proba(features(vecs[i][None, :], np.array([actor]), np.array([bool(m["mentions_us"])]), np.array([bool(m["mentions_cn"])])), w, b)[0]
                rec[f"stance_{actor.lower()}"], rec[f"stance_{actor.lower()}_conf"] = int(classes[int(p.argmax())]), round(float(p.max()), 4)
        rows.append(rec)
    stored = upsert("doc_classification", "trained", pd.DataFrame(rows), warehouse)
    return {"trained_rows": stored}
