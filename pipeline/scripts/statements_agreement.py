"""Agreement between the statements dataset's stance codes and a second coding of a sample.

Usage: python scripts/statements_agreement.py [sample_csv]

The sample file (default data/manual/statements/second_coder_sample_v1.csv) holds one row per sampled record with the
second coder's codes (`stance_china_2`, `stance_us_2`); the dataset's own codes are read from the dataset and written
back into the file (`stance_china_1`, `stance_us_1`, `agree_*`), then percentage agreement and Cohen's kappa are printed
per actor, on the five codes and collapsed to three (positive / negative / other). The sample measures the coding's
stability between two readings of the same quote and summary, not its validity against a human judgement.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "pipeline"))
from scm.text.metrics import cohen_kappa  # noqa: E402

DATASET = ROOT / "data" / "manual" / "statements" / "political_statements_minerals.csv"
DEFAULT_SAMPLE = ROOT / "data" / "manual" / "statements" / "second_coder_sample_v1.csv"
COLLAPSE = {"positive": "positive", "negative": "negative", "neutral": "other", "mixed": "other", "not_mentioned": "other"}


def agreement(a: list[str], b: list[str]) -> dict:
    n = len(a)
    same = sum(1 for x, y in zip(a, b, strict=True) if x == y)
    return {"n": n, "percent_agreement": round(100 * same / n, 1) if n else None, "kappa": None if n == 0 else (round(k, 3) if (k := cohen_kappa(a, b)) is not None else None)}


def main(sample_path: Path = DEFAULT_SAMPLE) -> dict:
    data = pd.read_csv(DATASET, dtype=str, keep_default_na=False).set_index("id")
    s = pd.read_csv(sample_path, dtype=str, keep_default_na=False)
    missing = [i for i in s["id"] if i not in data.index]
    if missing:
        raise SystemExit(f"ids not in the dataset: {missing}")
    for actor in ("china", "us"):
        s[f"stance_{actor}_1"] = [data.loc[i, f"stance_{actor}"] for i in s["id"]]
        s[f"agree_{actor}"] = [int(x == y) for x, y in zip(s[f"stance_{actor}_1"], s[f"stance_{actor}_2"], strict=True)]
    cols = ["id", "country", "speaker_bloc", "stance_china_1", "stance_china_2", "agree_china", "stance_us_1", "stance_us_2", "agree_us", "note"]
    s = s[[c for c in cols if c in s.columns]]
    s.to_csv(sample_path, index=False)
    out = {"sample": sample_path.name, "n": int(len(s))}
    for actor in ("china", "us"):
        a, b = list(s[f"stance_{actor}_1"]), list(s[f"stance_{actor}_2"])
        out[actor] = {"five_codes": agreement(a, b), "three_codes": agreement([COLLAPSE.get(x, "other") for x in a], [COLLAPSE.get(x, "other") for x in b]),
                      "disagreements": [{"id": i, "dataset": x, "second": y} for i, x, y in zip(s["id"], a, b, strict=True) if x != y]}
    return out


if __name__ == "__main__":
    print(json.dumps(main(Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_SAMPLE), indent=1, ensure_ascii=False))
