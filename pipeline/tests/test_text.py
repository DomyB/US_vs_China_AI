"""Phase 3 text steps on the deterministic fakes (SCM_TEXT_FAKE=1): no model download, same code paths."""
from __future__ import annotations

import sys

import pandas as pd
import pytest

from scm import schema, warehouse
from tests.test_warehouse_export import _doc


@pytest.fixture
def fake_env(monkeypatch):
    monkeypatch.setenv("SCM_TEXT_FAKE", "1")
    from scm.text import models

    models.release_all()
    yield
    models.release_all()


def _warehouse(tmp_path):
    wh = tmp_path / "wh"
    (wh / "document").mkdir(parents=True)
    rows = [
        _doc("ARG", "bill", "2022-03-01", "Proyecto de ley: acuerdo de cooperación con China para inversión en litio", "arg_hcdn", "https://x.test/a1", cn=True, minerals="lithium"),
        _doc("ARG", "bill", "2022-05-01", "Pedido de informes sobre concesiones mineras", "arg_hcdn", "https://x.test/a2"),
        _doc("ARG", "bill", "2023-01-10", "Rechaza la amenaza de sanción de Estados Unidos sobre exportaciones de cobre", "arg_hcdn", "https://x.test/a3", us=True, minerals="copper"),
        _doc("BRA", "bill", "2021-02-02", "PL 10/2021: Dispõe sobre parceria com os Estados Unidos em terras raras", "bra_camara_api", "https://x.test/b1", us=True, summary="Dispõe sobre parceria com os Estados Unidos em terras raras", minerals="rare_earths"),
        _doc("BRA", "hearing", "2024-06-06", "RIC 7/2024: Requer informações sobre mineração de nióbio", "bra_camara_api", "https://x.test/b2", summary="Requer informações sobre o controle da mineração de nióbio por empresa chinesa", cn=True),
        _doc("GUY", "news", "2026-09-01", "Zijin reports more gold from Aurora", "gdelt", "https://x.test/n1", cn=True, outlet="guy_kaieteur", minerals="gold"),
        _doc("ARG", "news", "2026-09-02", "Minera china apoya nuevo proyecto de litio", "arg_clarin", "https://x.test/n2", cn=True, outlet="arg_clarin", minerals="lithium"),
    ]
    rows[5]["language"] = rows[5]["original_language"] = "en"
    rows[3]["language"] = rows[4]["language"] = "pt"
    schema.validate("document", pd.DataFrame(rows)).to_parquet(wh / "document" / "docs.parquet", index=False)
    return wh


def test_text_package_does_not_import_torch():
    import scm.text.models  # noqa: F401
    import scm.text.pipeline  # noqa: F401
    import scm.text.series  # noqa: F401

    assert "torch" not in sys.modules and "transformers" not in sys.modules


def test_doc_text_avoids_doubling_the_brazilian_ementa():
    from scm.text.store import doc_text

    assert doc_text("PL 1/2020: Dispõe sobre o lítio", "Dispõe sobre o lítio") == "PL 1/2020: Dispõe sobre o lítio"
    assert doc_text("Título", "Resumen distinto") == "Título. Resumen distinto"
    assert doc_text("Título", "No Aplica") == "Título"


def test_upsert_keeps_the_last_row_per_key(tmp_path):
    wh = tmp_path / "wh"
    base = {"run_id": "r1", "method": "zero_shot", "model": "m", "codebook_version": "v1", "stance_us": pd.NA, "stance_us_conf": None,
            "stance_cn": 1, "stance_cn_conf": 0.8, "tone": 0.1, "tone_conf": 0.5, "frame": None, "created_at": "2026-10-04T00:00:00+00:00"}
    assert warehouse.upsert("doc_classification", "zero_shot", pd.DataFrame([{"doc_id": "d1", **base}]), wh) == 1
    n = warehouse.upsert("doc_classification", "zero_shot", pd.DataFrame([{"doc_id": "d1", **base, "stance_cn": -2}, {"doc_id": "d2", **base}]), wh)
    stored = warehouse.load_slot("doc_classification", "zero_shot", wh).set_index("doc_id")
    assert n == 2 and int(stored.loc["d1", "stance_cn"]) == -2


def test_fake_pipeline_end_to_end(tmp_path, fake_env, monkeypatch):
    from scm.text import embed, pipeline, topics, translate, zero_shot
    from scm.text.store import corpus, pending

    wh = _warehouse(tmp_path)
    docs = corpus(wh)
    assert len(docs) == 7 and set(docs["lang"]) == {"es", "pt", "en"}

    t = translate.run(wh)
    assert t["translated"] == 6 and t["skipped_english"] == 1
    tr = warehouse.load_slot("doc_translation", translate.SLOT, wh)
    assert len(schema.validate("doc_translation", tr.copy())) == 6 and tr["text"].str.startswith("[en] ").all()
    assert translate.run(wh)["translated"] == 0  # incremental: nothing pending the second time

    c = zero_shot.run(wh)
    cls = warehouse.load_slot("doc_classification", zero_shot.SLOT, wh).set_index("doc_id")
    assert c["classified"] == 7 and c["stance_scored"] == 6
    a1 = cls.loc[docs.set_index("source_record_url").loc["https://x.test/a1", "doc_id"]]
    assert int(a1["stance_cn"]) > 0 and pd.isna(a1["stance_us"])  # cooperation/inversión -> positive; US not mentioned -> not applicable
    a3 = cls.loc[docs.set_index("source_record_url").loc["https://x.test/a3", "doc_id"]]
    assert int(a3["stance_us"]) < 0 and a3["tone"] < 0
    assert pending("doc_classification", zero_shot.SLOT, docs, {"method": "zero_shot", "model": cls["model"].iloc[0], "codebook_version": "v1"}, wh).empty

    e = embed.run(wh)
    assert e["embedded"] == 7
    ids, m = embed.matrix(wh)
    assert len(ids) == 7 and m.shape == (7, 32)

    monkeypatch.setattr(topics, "MIN_DOCS", {"parliament": 3, "media": 100})
    monkeypatch.setattr(topics, "K", {"parliament": 2, "media": 2})
    tp = topics.run(wh)
    assert tp["parliament"]["topics"] == 2 and tp["media"]["topics"] == 0 and "fewer than" in tp["media"]["note"]
    top = warehouse.load_slot("topic", "parliament", wh)
    assert len(schema.validate("topic", top.copy())) == 2 and all(top["label"].str.len() > 0)
    assert len(warehouse.load_slot("doc_topic", "parliament", wh)) == 5

    lines = []
    res = pipeline.run_steps(("classify",), warehouse=wh, out=lambda s, **kw: lines.append(s))
    assert res["classify"]["pending"] == 0 and any('"status": "ok"' in ln for ln in lines)


def test_series_aggregates(tmp_path, fake_env, monkeypatch):
    from scm.text import embed, series, topics, zero_shot
    from scm.text.store import corpus

    wh = _warehouse(tmp_path)
    zero_shot.run(wh)
    embed.run(wh)
    monkeypatch.setattr(topics, "MIN_DOCS", {"parliament": 3, "media": 1})
    monkeypatch.setattr(topics, "K", {"parliament": 2, "media": 1})
    topics.run(wh)
    docs = corpus(wh)
    cls = warehouse.load_slot("doc_classification", zero_shot.SLOT, wh)
    st = series.stance_series(docs, cls)
    assert set(st) == {"ARG", "BRA"} and [r["year"] for r in st["ARG"]] == [2022, 2023]
    assert st["ARG"][0]["n_docs"] == 1 and st["ARG"][0]["stance_us_mean"] is None and st["ARG"][0]["stance_cn_mean"] > 0
    mv, basis = series.media_series(docs, cls, pd.DataFrame([{"country": "GUY", "period": "2026-09-01", "items_total": 40, "items_mining": 3, "items_cn": 1, "items_us": 0}]))
    assert basis == "feed_totals" and mv["GUY"][0]["total_articles"] == 40 and mv["GUY"][0]["articles_cn"] == 1 and mv["ARG"][0]["total_articles"] == 1
    narr = series.narratives(docs, pd.concat([warehouse.load_slot("doc_topic", "parliament", wh), warehouse.load_slot("doc_topic", "media", wh)]),
                             pd.concat([warehouse.load_slot("topic", "parliament", wh), warehouse.load_slot("topic", "media", wh)]))
    assert "ARG" in narr and abs(sum(r["share"] for r in narr["ARG"] if r["year"] == 2022) - 1.0) < 1e-6
    assert series.outlet_key("col_semana", "2019-05-01") == "col_semana_pre2020" and series.outlet_key("col_semana", "2021-05-01") == "col_semana"
