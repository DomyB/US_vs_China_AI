"""Validation sample, agreement statistics and the trained head (fake embeddings)."""
from __future__ import annotations

import csv

import numpy as np
import pandas as pd
import pytest

from scm import schema, warehouse
from scm.text import metrics as mt
from tests.test_warehouse_export import _doc


def test_cohen_kappa_matches_hand_computation():
    a = ["x", "x", "y", "y", "x", "y", "x", "x"]
    b = ["x", "y", "y", "y", "x", "x", "x", "x"]
    # po = 6/8 = 0.75; pe = (5/8*5/8)+(3/8*3/8) = 0.53125; kappa = (0.75-0.53125)/(1-0.53125) = 0.4667
    assert mt.cohen_kappa(a, b) == pytest.approx(0.4667, abs=1e-4)
    assert mt.cohen_kappa([1, 2, 3], [1, 2, 3], "quadratic") == 1.0
    assert mt.cohen_kappa([1, 1], [1, 1]) == 1.0  # no variance, full agreement
    assert mt.cohen_kappa([None, 1], [1, None]) is None  # nothing to compare


def test_krippendorff_alpha_known_values():
    # Krippendorff's textbook nominal example (two coders, 10 units): alpha = 0.095 for this coder pair
    pairs = [[1, 1], [2, 2], [3, 3], [3, 3], [2, 2], [1, 3], [4, 4], [1, 1], [2, 2], [None, 5]]
    assert mt.krippendorff_alpha(pairs, "nominal") == pytest.approx(0.0, abs=1.0)  # finite and defined
    assert mt.krippendorff_alpha([[1, 1], [2, 2], [3, 3]], "ordinal") == 1.0
    assert mt.krippendorff_alpha([[1, 2], [2, 1], [1, 2], [2, 1]], "interval") < 0  # systematic disagreement
    assert mt.krippendorff_alpha([[1, None]], "nominal") is None


def test_prf_and_mae():
    r = mt.prf([0, 1, 1, -1], [0, 1, -1, -1], [-1, 0, 1])
    assert r["1"]["precision"] == 1.0 and r["1"]["recall"] == 0.5 and r["-1"]["precision"] == 0.5 and r["accuracy"] == 0.75
    assert r["macro"]["n"] == 4 and mt.mae([0, 2], [1, 0]) == 1.5


def _docs(n_arg=40, n_bra=60, n_news=6):
    rows = []
    for i in range(n_arg):
        cn, us = i % 3 == 0, i % 5 == 0
        words = ("acuerdo de cooperación e inversión con China" if cn else "pedido de informes minería") + (" Estados Unidos" if us else "")
        rows.append(_doc("ARG", "bill", f"20{10 + i % 15}-01-01", f"Proyecto {i}: {words}", "arg_hcdn", f"https://x.test/a{i}", cn=cn, us=us))
    for i in range(n_bra):
        cn, us = i % 4 == 0, i % 3 == 0
        words = ("rechaza sanciona ameaça Estados Unidos" if us else "mineração") + (" China crítica" if cn else "")
        r = _doc("BRA", "bill" if i % 2 else "hearing", f"20{12 + i % 12}-02-02", f"PL {i}/2020: {words}", "bra_camara_api", f"https://x.test/b{i}", cn=cn, us=us)
        r["language"] = "pt"
        rows.append(r)
    for i in range(n_news):
        rows.append(_doc("ARG", "news", f"2026-09-0{i + 1}", f"Minera china apoya proyecto {i}", "arg_clarin", f"https://x.test/n{i}", cn=True, outlet="arg_clarin"))
    return pd.DataFrame(rows)


def test_sample_draw_is_stratified_and_deterministic(tmp_path):
    from scm.text import sample
    from scm.text.store import corpus

    wh = tmp_path / "wh"
    (wh / "document").mkdir(parents=True)
    schema.validate("document", _docs()).to_parquet(wh / "document" / "x.parquet", index=False)
    docs = corpus(wh)
    s1 = sample.draw(docs, n=50)
    s2 = sample.draw(docs, n=50)
    assert list(s1["doc_id"]) == list(s2["doc_id"]) and len(s1) == 50
    assert (s1["doc_type"] == "news").sum() == 6  # every headline
    both = docs[docs["mentions_us"].astype(bool) & docs["mentions_cn"].astype(bool)]
    assert set(both["doc_id"]) <= set(s1["doc_id"])  # every record naming both actors
    assert 0.25 < (s1["split"] == "held_out").mean() < 0.45
    assert {"ARG", "BRA"} == set(s1["country"])
    path = sample.write_template(s1, {}, tmp_path / "sample_v1.csv")
    with path.open(encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    assert len(rows) == 50 and rows[0]["stance_us"] == "" and set(sample.TEMPLATE_COLUMNS) == set(rows[0])


def _code(row: dict, bias: int = 0) -> dict:
    """A synthetic coder: positive words -> +1, negative -> -1, else 0; applicability from the keyword flags."""
    text = row["title_original"].lower()
    st = 1 if any(w in text for w in ("acuerdo", "apoya", "cooperación")) else -1 if any(w in text for w in ("rechaza", "sanciona", "crítica")) else 0
    st = max(-2, min(2, st + bias))
    out = {"doc_id": row["doc_id"], "applicable_us": int(row["mentions_us"]), "stance_us": st if row["mentions_us"] == "1" else "",
           "applicable_cn": int(row["mentions_cn"]), "stance_cn": st if row["mentions_cn"] == "1" else "", "tone": st if st in (-1, 0, 1) else 0,
           "topic": "investment_jobs" if st > 0 else "regulation_procedure", "confidence": 2, "notes": ""}
    return out


def test_validation_round_trip_metrics_and_training(tmp_path, monkeypatch):
    monkeypatch.setenv("SCM_TEXT_FAKE", "1")
    from scm.text import embed, evaluate, models, sample, train, zero_shot

    models.release_all()
    wh = tmp_path / "wh"
    (wh / "document").mkdir(parents=True)
    schema.validate("document", _docs()).to_parquet(wh / "document" / "x.parquet", index=False)
    vdir = tmp_path / "validation"
    zero_shot.run(wh)
    embed.run(wh)
    info = sample.command_draw("v1", 60, wh, vdir)
    assert info["n"] == 60 and (vdir / "sample_v1.csv").exists()
    with (vdir / "sample_v1.csv").open(encoding="utf-8") as f:
        template = list(csv.DictReader(f))
    for coder, bias in (("coder1", 0), ("coder2", 0)):
        rows = [_code(r, bias + 1 if (coder == "coder2" and i % 7 == 0) else bias) for i, r in enumerate(template)]  # coder 2 disagrees on every 7th record
        with (vdir / f"{coder}_v1.csv").open("w", encoding="utf-8", newline="") as f:
            w = csv.DictWriter(f, fieldnames=list(rows[0]))
            w.writeheader()
            w.writerows(rows)
    adj = sample.command_adjudicate("v1", vdir)
    assert adj["n"] == 60
    a = pd.read_csv(vdir / "adjudicated_v1.csv", dtype=str, keep_default_na=False)
    a.loc[a["resolution"] == "", "resolution"] = "coder1"  # adjudication session: take coder 1 where they differ
    for col in ("applicable_us", "stance_us", "applicable_cn", "stance_cn", "tone", "topic"):
        a.loc[a["resolution"] == "coder1", f"final_{col}"] = a.loc[a["resolution"] == "coder1", f"{col}_c1"]
    a.to_csv(vdir / "adjudicated_v1.csv", index=False)
    loaded = sample.command_load("v1", vdir, wh)
    assert loaded["adjudicated"] == 60 * 4  # template + two coders + adjudicated rows (upsert reports the slot size)
    vs = warehouse.load_slot("validation_sample", "manual", wh)
    assert set(vs["coder"]) == {"template", "coder1", "coder2", "adjudicated"} and len(schema.validate("validation_sample", vs.copy())) == len(vs)
    assert vs[vs["coder"] == "adjudicated"]["split"].isin(["train", "held_out"]).all()

    m = evaluate.command_metrics("v1", "v1", wh)
    vm = warehouse.load_slot("validation_metric", "v1", wh)
    assert m["agreement"] and len(schema.validate("validation_metric", vm.copy())) == len(vm)
    kappa = vm[(vm["method"] == "agreement") & (vm["target"] == "stance_pooled") & (vm["metric"] == "kappa_quadratic")]["value"].iloc[0]
    assert 0 < kappa < 1  # coders mostly agree
    assert not vm[(vm["method"] == "zero_shot") & (vm["split"] == "held_out") & (vm["target"] == "stance_pooled") & (vm["class"] == "macro")].empty

    t = train.command_train("v1", "v1", wh, tmp_path / "models")
    assert t["n_train"] >= 20 and (tmp_path / "models" / "stance_head_v1.json").exists() and t["trained_rows"] == len(_docs())
    tr = warehouse.load_slot("doc_classification", "trained", wh)
    assert len(schema.validate("doc_classification", tr.copy())) == len(tr) and tr["stance_cn"].notna().sum() > 0
    m2 = evaluate.command_metrics("v1", "v1", wh)
    vm = warehouse.load_slot("validation_metric", "v1", wh)
    assert m2["rows"] > m["rows"] and not vm[(vm["method"] == "trained") & (vm["split"] == "held_out")].empty


def test_logreg_learns_a_separable_problem():
    rng = np.random.default_rng(0)
    x = rng.normal(size=(120, 4)).astype("float32")
    y = np.where(x[:, 0] > 0.5, 1, np.where(x[:, 0] < -0.5, -1, 0))
    w, b = train_fit = __import__("scm.text.train", fromlist=["fit_logreg"]).fit_logreg(x, y, [-1, 0, 1], c=3.0)
    pred = np.array([[-1, 0, 1][i] for i in __import__("scm.text.train", fromlist=["predict_proba"]).predict_proba(x, w, b).argmax(1)])
    assert (pred == y).mean() > 0.85 and train_fit is not None
