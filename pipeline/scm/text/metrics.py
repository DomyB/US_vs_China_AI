"""Agreement and accuracy statistics (numpy only): Cohen's kappa (nominal or quadratic-weighted), Krippendorff's
alpha (nominal, ordinal or interval), per-class precision/recall/F1 and mean absolute error."""
from __future__ import annotations

from collections import Counter

import numpy as np


def _pairs(a, b) -> tuple[list, list]:
    """Drop positions where either side is missing (None/NaN)."""
    xa, xb = [], []
    for u, v in zip(a, b, strict=True):
        if u is None or v is None or (isinstance(u, float) and np.isnan(u)) or (isinstance(v, float) and np.isnan(v)):
            continue
        xa.append(u)
        xb.append(v)
    return xa, xb


def cohen_kappa(a, b, weights: str | None = None) -> float | None:
    """Cohen's kappa; weights=None (nominal) or "quadratic" (ordinal, integer-valued labels)."""
    xa, xb = _pairs(a, b)
    n = len(xa)
    if n == 0:
        return None
    cats = sorted(set(xa) | set(xb), key=lambda c: (str(type(c)), c))
    idx = {c: i for i, c in enumerate(cats)}
    k = len(cats)
    obs = np.zeros((k, k))
    for u, v in zip(xa, xb, strict=True):
        obs[idx[u], idx[v]] += 1
    obs /= n
    exp = np.outer(obs.sum(1), obs.sum(0))
    if weights == "quadratic":
        vals = np.array([float(c) for c in cats])
        w = (vals[:, None] - vals[None, :]) ** 2
        w = w / w.max() if w.max() > 0 else w
    else:
        w = 1.0 - np.eye(k)
    denom = (w * exp).sum()
    if denom == 0:
        return 1.0 if (w * obs).sum() == 0 else 0.0
    return round(float(1 - (w * obs).sum() / denom), 4)


def krippendorff_alpha(ratings: list[list], level: str = "nominal") -> float | None:
    """Krippendorff's alpha for `ratings[unit] = [value by coder, None when missing]`; level nominal/ordinal/interval
    (ordinal and interval need numeric values). Units with fewer than two ratings are ignored."""
    units = [[v for v in unit if v is not None and not (isinstance(v, float) and np.isnan(v))] for unit in ratings]
    units = [u for u in units if len(u) >= 2]
    if not units:
        return None
    values = sorted({v for u in units for v in u}, key=lambda c: (str(type(c)), c))
    n_total = sum(len(u) for u in units)
    if len(values) < 2:
        return 1.0
    counts = Counter(v for u in units for v in u)
    if level == "nominal":
        def delta(c, k):
            return 0.0 if c == k else 1.0
    elif level == "interval":
        def delta(c, k):
            return (float(c) - float(k)) ** 2
    elif level == "ordinal":
        order = sorted(values, key=float)
        n_c = {v: counts[v] for v in values}

        def delta(c, k):
            if c == k:
                return 0.0
            lo, hi = sorted((order.index(c), order.index(k)))
            inner = sum(n_c[order[g]] for g in range(lo, hi + 1))
            return (inner - (n_c[c] + n_c[k]) / 2) ** 2
    else:
        raise ValueError(level)
    d_o = 0.0
    for u in units:
        m = len(u)
        d_o += sum(delta(c, k) for i, c in enumerate(u) for j, k in enumerate(u) if i != j) / (m - 1)
    d_o /= n_total
    d_e = sum(counts[c] * counts[k] * delta(c, k) for c in values for k in values if c != k) / (n_total * (n_total - 1))
    if d_e == 0:
        return 1.0
    return round(float(1 - d_o / d_e), 4)


def prf(y_true, y_pred, classes: list | None = None) -> dict:
    """Per-class precision, recall, F1 and support, plus macro averages and accuracy."""
    yt, yp = _pairs(y_true, y_pred)
    classes = classes or sorted(set(yt) | set(yp), key=lambda c: (str(type(c)), c))
    out: dict = {}
    for c in classes:
        tp = sum(1 for t, p in zip(yt, yp, strict=True) if t == c and p == c)
        fp = sum(1 for t, p in zip(yt, yp, strict=True) if t != c and p == c)
        fn = sum(1 for t, p in zip(yt, yp, strict=True) if t == c and p != c)
        prec = tp / (tp + fp) if tp + fp else 0.0
        rec = tp / (tp + fn) if tp + fn else 0.0
        f1 = 2 * prec * rec / (prec + rec) if prec + rec else 0.0
        out[str(c)] = {"precision": round(prec, 4), "recall": round(rec, 4), "f1": round(f1, 4), "n": tp + fn}
    present = [c for c in classes if out[str(c)]["n"] > 0]
    out["macro"] = {k: round(float(np.mean([out[str(c)][k] for c in present])) if present else 0.0, 4) for k in ("precision", "recall", "f1")}
    out["macro"]["n"] = len(yt)
    out["accuracy"] = round(sum(1 for t, p in zip(yt, yp, strict=True) if t == p) / len(yt), 4) if yt else None
    return out


def mae(y_true, y_pred) -> float | None:
    yt, yp = _pairs(y_true, y_pred)
    return round(float(np.mean([abs(float(t) - float(p)) for t, p in zip(yt, yp, strict=True)])), 4) if yt else None
