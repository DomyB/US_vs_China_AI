from __future__ import annotations

import numpy as np

from scm import geometry


def test_pca_keeps_the_line_and_signs_the_axes():
    x = np.array([[0.0, 0.0, 0.0], [1.0, 2.0, 2.0], [2.0, 4.0, 4.0], [3.0, 6.0, 6.0]])
    coords, explained = geometry.pca_2d(x)
    assert coords.shape == (4, 2) and explained[0] > 0.999 and explained[1] < 1e-6
    assert coords[0, 0] >= 0 and abs(coords[3, 0] - coords[0, 0]) > 5  # the line survives, spread along the first axis
    empty, e0 = geometry.pca_2d(np.zeros((0, 3)))
    assert empty.shape == (0, 2) and e0 == [0.0, 0.0]


def test_nearest_neighbours_exclude_self_and_rank_by_similarity():
    x = geometry.unit_rows(np.array([[1.0, 0.0], [0.9, 0.1], [0.0, 1.0], [-1.0, 0.0]]))
    idx, sims = geometry.nearest(x, k=2, block=3)
    assert list(idx[0]) == [1, 2] and sims[0][0] > sims[0][1] > sims[0].min() - 1
    assert 0 not in idx[0] and list(idx[3]) == [2, 1]
    idx1, _ = geometry.nearest(x[:1], k=3)
    assert idx1.shape == (1, 0)


def _doc(i, country="CHL", doc_type="news", lang="es", title="Producción de cobre en Chile cae", venue=None, outlet="chl_latercera"):
    return {"doc_id": f"d{i}", "country": country, "doc_type": doc_type, "date": f"2024-0{i % 9 + 1}-15", "language": lang, "title_original": f"{title} {i}",
            "venue": venue, "outlet_source_id": outlet, "source_id": outlet}


def test_words_file_points_neighbours_topics_and_featured():
    docs = [_doc(i) for i in range(5)] + [_doc(5, doc_type="bill", lang="pt", title="Projeto de lei sobre o nióbio", venue="Câmara", outlet=None)]
    vecs = {"d0": [1, 0, 0, 0], "d1": [0.9, 0.1, 0, 0], "d2": [0, 1, 0, 0], "d3": [0, 0.9, 0.1, 0], "d4": [0, 0, 1, 0], "d5": [0, 0, 0, 1]}
    emb = [{"doc_id": k, "model": "m", "dim": 4, "vector": v} for k, v in vecs.items()] + [{"doc_id": "ghost", "model": "m", "dim": 4, "vector": [1, 1, 1, 1]}]
    translations = {("d0", "title"): {"text": "Copper output in Chile falls 0", "method": "mt", "model": "opus"}, ("d0", "summary"): {"text": "x", "method": "mt", "model": "opus"}}
    chosen = {"d1": {"stance_us": None, "stance_cn": 1, "tone": 0.2}}
    topics = [{"run_id": "r1", "topic_id": 0, "label": "copper output", "keywords": "cobre,producción,chile,cae", "example_doc_ids": "d0,d1", "n_docs": 2, "created_at": "2026-10-01"},
              {"run_id": "r1", "topic_id": 1, "label": "topic 1", "keywords": "nióbio,projeto,lei", "example_doc_ids": "d5", "n_docs": 1, "created_at": "2026-10-01"}]
    doc_topic = [{"doc_id": "d0", "run_id": "r1", "topic_id": 0, "prob": 0.9}, {"doc_id": "d1", "run_id": "r1", "topic_id": 0, "prob": 0.8}, {"doc_id": "d5", "run_id": "r1", "topic_id": 1, "prob": 0.7}]
    out = geometry.words_file(docs, emb, translations, chosen, topics, doc_topic, "2026-10-13", human_labels={"nióbio,projeto,lei": "Niobium bills"})
    assert out["n"] == 6 and out["n_documents"] == 6 and out["model"] == "m" and out["dim"] == 4
    assert out["by_type"] == {"bill": 1, "news": 5} and out["by_language"] == {"es": 5, "pt": 1}
    assert abs(sum(out["pca"]["explained"]) - 1) < 1 and out["pca"]["explained"][0] >= out["pca"]["explained"][1] > 0
    d0 = next(d for d in out["docs"] if d["id"] == "d0")
    assert d0["e"] == "Copper output in Chile falls 0" and d0["h"].startswith("Producción") and d0["nn"][0] == "d1" and len(d0["nn"]) == 3 and "d0" not in d0["nn"]
    assert d0["k"] == 0 and d0["su"] is None and d0["sc"] is None and d0["c"] == "CHL" and d0["t"] == "news" and d0["o"] == "chl_latercera"
    d1 = next(d for d in out["docs"] if d["id"] == "d1")
    assert d1["sc"] == 1 and d1["e"] is None
    d5 = next(d for d in out["docs"] if d["id"] == "d5")
    assert d5["o"] == "Câmara" and d5["k"] == 1
    assert [t["label"] for t in out["topics"]] == ["copper output", "Niobium bills"] and out["topics"][1]["keywords"] == ["nióbio", "projeto", "lei"]
    assert [f["id"] for f in out["featured"]] == ["d0", "d5"]
    f0 = out["featured"][0]
    assert f0["vector"] == [1.0, 0.0, 0.0, 0.0] and f0["near"][0]["id"] == "d1" and f0["near"][0]["sim"] > 0.99 and all(n["id"] != "d0" for n in f0["near"])
    assert len(f0["far"]) == 3 and f0["far"][0]["sim"] <= f0["near"][-1]["sim"]


def test_words_file_without_embeddings_has_no_points():
    out = geometry.words_file([_doc(0)], [], {}, {}, [], [], "2026-10-13")
    assert out["n"] == 0 and out["docs"] == [] and out["featured"] == [] and out["model"] is None


def test_components_file_keeps_all_minerals_rows_only():
    comps = [{"country": "CHL", "year": 2024, "actor": "CN", "mineral": "all", "component": "trade_export_share", "raw_value": 0.505, "normalized_value": 71.6, "available": True, "note": None},
             {"country": "CHL", "year": 2024, "actor": "CN", "mineral": "lithium", "component": "trade_export_share", "raw_value": 0.9, "normalized_value": 99.0, "available": True, "note": None},
             {"country": "CHL", "year": 2024, "actor": "US", "mineral": "all", "component": "debt_stock", "raw_value": float("nan"), "normalized_value": None, "available": False, "note": "no source for debt owed to the United States"}]
    idx = [{"country": "CHL", "year": 2024, "actor": "CN", "mineral": "all", "index_name": "influence", "value": 48.84, "n_components": 3},
           {"country": "CHL", "year": 2024, "actor": "CN", "mineral": "lithium", "index_name": "influence", "value": 70.0, "n_components": 3},
           {"country": "CHL", "year": 2025, "actor": "US", "mineral": "all", "index_name": "influence", "value": float("nan"), "n_components": 4}]
    out = geometry.components_file(comps, idx, {"trade_export_share": {"lo": 0.0, "hi": 0.705, "n": 582}}, "2026-10-13")
    assert [c["k"] for c in out["components"]] == ["trade_export_share", "debt_stock"]
    assert out["components"][0] == {"c": "CHL", "y": 2024, "a": "CN", "k": "trade_export_share", "raw": 0.505, "norm": 71.6, "ok": True, "note": None}
    assert out["components"][1]["raw"] is None and out["components"][1]["ok"] is False and "no source" in out["components"][1]["note"]
    assert [(i["y"], i["v"]) for i in out["index"]] == [(2024, 48.84), (2025, None)] and out["scales"]["trade_export_share"]["hi"] == 0.705
