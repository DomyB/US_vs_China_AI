"""Agreement statistics between the two coders and accuracy of each classifier against the adjudicated labels."""
from __future__ import annotations

from pathlib import Path

import pandas as pd

from ..paths import WAREHOUSE_DIR
from ..warehouse import load_slot, upsert
from . import metrics as mt
from .store import new_run_id, now_iso

STANCE_CLASSES = [-2, -1, 0, 1, 2]


def _rows_from(result: dict, run_id: str, codebook: str, method: str, target: str, split: str, stamp: str) -> list[dict]:
    rows = []
    for cls, vals in result.items():
        if cls == "accuracy":
            rows.append({"run_id": run_id, "codebook_version": codebook, "method": method, "target": target, "class": "all", "metric": "accuracy",
                         "value": vals, "n": result["macro"]["n"], "split": split, "created_at": stamp})
            continue
        for metric, v in vals.items():
            if metric == "n":
                continue
            rows.append({"run_id": run_id, "codebook_version": codebook, "method": method, "target": target, "class": str(cls), "metric": metric,
                         "value": v, "n": int(vals["n"]), "split": split, "created_at": stamp})
    return rows


def agreement_rows(c1: pd.DataFrame, c2: pd.DataFrame, run_id: str, codebook: str) -> list[dict]:
    m = c1.merge(c2, on="doc_id", suffixes=("_1", "_2"))
    stamp = now_iso()
    rows = []

    def add(target, metric, value, n):
        rows.append({"run_id": run_id, "codebook_version": codebook, "method": "agreement", "target": target, "class": "all", "metric": metric,
                     "value": value, "n": int(n), "split": "all", "created_at": stamp})

    for actor in ("us", "cn"):
        a1, a2 = m[f"applicable_{actor}_1"].astype(object), m[f"applicable_{actor}_2"].astype(object)
        add(f"applicability_{actor}", "kappa", mt.cohen_kappa(list(a1), list(a2)), len(m))
        both = m[(a1 == True) & (a2 == True)]  # noqa: E712 - pandas object comparison
        s1, s2 = list(both[f"stance_{actor}_1"]), list(both[f"stance_{actor}_2"])
        add(f"stance_{actor}", "kappa_quadratic", mt.cohen_kappa(s1, s2, "quadratic"), len(both))
        add(f"stance_{actor}", "alpha_ordinal", mt.krippendorff_alpha([[a, b] for a, b in zip(s1, s2, strict=True)], "ordinal"), len(both))
        add(f"stance_{actor}", "agreement_exact", mt.prf(s1, s2)["accuracy"], len(both))
    pooled1, pooled2 = [], []
    for actor in ("us", "cn"):
        both = m[(m[f"applicable_{actor}_1"].astype(object) == True) & (m[f"applicable_{actor}_2"].astype(object) == True)]  # noqa: E712
        pooled1 += list(both[f"stance_{actor}_1"])
        pooled2 += list(both[f"stance_{actor}_2"])
    add("stance_pooled", "kappa_quadratic", mt.cohen_kappa(pooled1, pooled2, "quadratic"), len(pooled1))
    add("stance_pooled", "alpha_ordinal", mt.krippendorff_alpha([[a, b] for a, b in zip(pooled1, pooled2, strict=True)], "ordinal"), len(pooled1))
    add("tone", "kappa_quadratic", mt.cohen_kappa(list(m["tone_1"]), list(m["tone_2"]), "quadratic"), len(m))
    add("topic", "kappa", mt.cohen_kappa(list(m["topic_1"]), list(m["topic_2"])), len(m))
    return rows


def model_rows(adjudicated: pd.DataFrame, predictions: pd.DataFrame, method: str, run_id: str, codebook: str, split_of: dict[str, str]) -> list[dict]:
    """Per-class P/R/F1 (classes -2..2 plus NA for not applicable), accuracy and MAE per actor and pooled, on the
    adjudicated docs of each split (all docs, held_out, train)."""
    stamp = now_iso()
    m = adjudicated.merge(predictions, on="doc_id", suffixes=("", "_pred"))
    rows = []
    for split in ("held_out", "train", "all"):
        sub = m if split == "all" else m[[split_of.get(d) == split for d in m["doc_id"]]]
        if sub.empty:
            continue
        pooled_t, pooled_p = [], []
        for actor in ("us", "cn"):
            truth = [("NA" if not a else int(s)) if s is not None and not pd.isna(s) else "NA" for a, s in zip(sub[f"applicable_{actor}"], sub[f"stance_{actor}"], strict=True)]
            pred = ["NA" if pd.isna(s) else int(s) for s in sub[f"stance_{actor}_pred"]]
            rows += _rows_from(mt.prf(truth, pred, STANCE_CLASSES + ["NA"]), run_id, codebook, method, f"stance_{actor}", split, stamp)
            app_t = [t != "NA" for t in truth]
            app_p = [p != "NA" for p in pred]
            rows += _rows_from(mt.prf(app_t, app_p, [True, False]), run_id, codebook, method, f"applicability_{actor}", split, stamp)
            keep = [(t, p) for t, p in zip(truth, pred, strict=True) if t != "NA" and p != "NA"]
            if keep:
                rows.append({"run_id": run_id, "codebook_version": codebook, "method": method, "target": f"stance_{actor}", "class": "all", "metric": "mae",
                             "value": mt.mae([t for t, _ in keep], [p for _, p in keep]), "n": len(keep), "split": split, "created_at": stamp})
            pooled_t += truth
            pooled_p += pred
        rows += _rows_from(mt.prf(pooled_t, pooled_p, STANCE_CLASSES + ["NA"]), run_id, codebook, method, "stance_pooled", split, stamp)
        if "tone_pred" in sub.columns:
            t_true = [int(t) if t is not None and not pd.isna(t) else None for t in sub["tone"]]
            t_pred = [None if pd.isna(v) else (1 if v > 0.2 else -1 if v < -0.2 else 0) for v in sub["tone_pred"]]
            rows += _rows_from(mt.prf(t_true, t_pred, [-1, 0, 1]), run_id, codebook, method, "tone", split, stamp)
    return rows


def command_metrics(round_: str = "v1", codebook: str = "v1", warehouse: Path = WAREHOUSE_DIR) -> dict:
    vs = load_slot("validation_sample", "manual", warehouse)
    vs = vs[vs["round"] == round_] if not vs.empty else vs
    if vs.empty:
        raise RuntimeError("no validation rows loaded; run `validation load` first")
    run_id = new_run_id("validation")
    rows: list[dict] = []
    c1, c2 = vs[vs["coder"] == "coder1"], vs[vs["coder"] == "coder2"]
    if not c1.empty and not c2.empty:
        rows += agreement_rows(c1, c2, run_id, codebook)
    adj = vs[vs["coder"] == "adjudicated"]
    split_of = dict(zip(vs[vs["coder"] == "template"]["doc_id"], vs[vs["coder"] == "template"]["split"], strict=True))
    if not adj.empty:
        for method, slot in (("zero_shot", "zero_shot"), ("trained", "trained")):
            cls = load_slot("doc_classification", slot, warehouse)
            if cls.empty:
                continue
            cls = cls[cls["codebook_version"] == codebook]
            rows += model_rows(adj, cls[["doc_id", "stance_us", "stance_cn", "tone"]], method, run_id, codebook, split_of)
    stored = upsert("validation_metric", round_, pd.DataFrame(rows), warehouse) if rows else 0
    return {"rows": len(rows), "stored": stored, "agreement": bool(not c1.empty and not c2.empty), "adjudicated": int(len(adj))}
