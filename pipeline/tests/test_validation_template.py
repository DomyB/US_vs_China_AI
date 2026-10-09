"""The coders' template and the coder-file reader: empty cells for missing text, the codebook's minus sign, topic checks."""
from __future__ import annotations

import csv

import numpy as np
import pandas as pd
import pytest

from scm.text import sample


def test_template_writes_empty_cells_for_missing_summaries(tmp_path):
    rows = pd.DataFrame([
        {"doc_id": "d1", "country": "ARG", "doc_type": "legis", "date": "2024-01-02", "language": "es", "title_original": "Litio", "summary": np.nan,
         "source_record_url": None, "mentions_us": True, "mentions_cn": False},
        {"doc_id": "d2", "country": "BRA", "doc_type": "news", "date": "2024-03-04", "language": "pt", "title_original": "Nióbio", "summary": "Resumo",
         "source_record_url": "https://example.org/x", "mentions_us": False, "mentions_cn": True},
    ])
    path = sample.write_template(rows, {"d1": "Lithium"}, tmp_path / "sample.csv")
    with path.open(encoding="utf-8", newline="") as f:
        got = list(csv.DictReader(f))
    assert [r["summary"] for r in got] == ["", "Resumo"]  # never the word "nan"
    assert got[0]["title_en_mt"] == "Lithium" and got[0]["url"] == "" and got[1]["url"] == "https://example.org/x"
    assert got[0]["mentions_us"] == "1" and got[0]["stance_us"] == "" and got[1]["topic"] == ""
    assert sample._text(None) == "" and sample._text(float("nan")) == "" and sample._text("nan") == "" and sample._text("<NA>") == "" and sample._text(" x ") == " x "


def test_coder_file_accepts_the_codebooks_minus_and_checks_topics(tmp_path):
    path = tmp_path / "coder1.csv"
    with path.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=sample.TEMPLATE_COLUMNS, quoting=csv.QUOTE_ALL)
        w.writeheader()
        w.writerow({c: "" for c in sample.TEMPLATE_COLUMNS} | {"doc_id": "d1", "stance_us": "−1", "stance_cn": "+2", "tone": "–1", "topic": "trade_prices", "confidence": "3"})
        w.writerow({c: "" for c in sample.TEMPLATE_COLUMNS} | {"doc_id": "d2", "applicable_us": "0", "applicable_cn": "1", "stance_cn": "0", "tone": "0", "topic": ""})
    df = sample.read_coder_csv(path)
    assert df.loc[0, "stance_us"] == -1 and df.loc[0, "stance_cn"] == 2 and df.loc[0, "tone"] == -1 and df.loc[0, "confidence"] == 3
    assert bool(df.loc[0, "applicable_us"]) is True and bool(df.loc[1, "applicable_us"]) is False and bool(df.loc[1, "applicable_cn"]) is True
    assert pd.isna(df.loc[1, "topic"]) and pd.isna(df.loc[1, "stance_us"])
    assert sample._int_or_none("−2") == -2 and sample._int_or_none("") is None and sample._int_or_none("—") is None

    bad = tmp_path / "coder_bad.csv"
    with bad.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=sample.TEMPLATE_COLUMNS, quoting=csv.QUOTE_ALL)
        w.writeheader()
        w.writerow({c: "" for c in sample.TEMPLATE_COLUMNS} | {"doc_id": "d1", "topic": "trade"})
    with pytest.raises(ValueError, match="topic values outside the codebook"):
        sample.read_coder_csv(bad)
