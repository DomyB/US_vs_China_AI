"""Validation sample: stratified draw, coder templates, adjudication merge and loading into the warehouse."""
from __future__ import annotations

import csv
from pathlib import Path

import numpy as np
import pandas as pd

from ..paths import REPO_ROOT, WAREHOUSE_DIR
from ..warehouse import load_slot, upsert
from .store import corpus, now_iso

VALIDATION_DIR = REPO_ROOT / "data" / "manual" / "validation"
SEED = 20261004
TEMPLATE_COLUMNS = ["doc_id", "country", "doc_type", "date", "language", "title_original", "summary", "title_en_mt", "url", "mentions_us", "mentions_cn",
                    "applicable_us", "stance_us", "applicable_cn", "stance_cn", "tone", "topic", "confidence", "notes"]
CODED_COLUMNS = ["applicable_us", "stance_us", "applicable_cn", "stance_cn", "tone", "topic", "confidence", "notes"]
TOPICS = ["investment_jobs", "sovereignty_resource_nationalism", "environment_water_communities", "geopolitics_security",
          "regulation_procedure", "trade_prices", "corruption_transparency", "other"]


def bucket(mentions_us: bool, mentions_cn: bool) -> str:
    return "both" if mentions_us and mentions_cn else "us_only" if mentions_us else "cn_only" if mentions_cn else "neither"


def draw(docs: pd.DataFrame, n: int = 300, seed: int = SEED, held_out_share: float = 1 / 3) -> pd.DataFrame:
    """Stratified sample: every document naming both actors; all headlines (up to 40); the actor-mention
    legislative records proportional to country with a floor of 10 per country that has them; about a
    quarter of the sample from records naming neither actor (to measure applicability); the remainder
    tops up the largest stratum. Deterministic for a given seed and doc_id set. Adds `split`."""
    rng = np.random.default_rng(seed)
    d = docs.copy().sort_values("doc_id").reset_index(drop=True)
    us_col, cn_col = ("actor_us", "actor_cn") if "actor_us" in d.columns else ("mentions_us", "mentions_cn")
    d["bucket"] = [bucket(bool(u), bool(c)) for u, c in zip(d[us_col], d[cn_col], strict=True)]
    chosen: list[int] = []

    def take(frame: pd.DataFrame, k: int) -> None:
        pool = [i for i in frame.index if i not in chosen]
        if k <= 0 or not pool:
            return
        pick = rng.choice(pool, size=min(k, len(pool)), replace=False)
        chosen.extend(int(i) for i in pick)

    take(d[d["bucket"] == "both"], len(d))
    take(d[d["doc_type"] == "news"], 40)
    neither_target = int(round(n * 0.23))
    actor_target = max(0, n - len(chosen) - neither_target)
    legis = d[(d["doc_type"] != "news") & d["bucket"].isin(["us_only", "cn_only"])]
    if not legis.empty and actor_target > 0:
        by_country = legis.groupby("country").size()
        floor = {c: min(10, int(k)) for c, k in by_country.items()}
        remaining = max(0, actor_target - sum(floor.values()))
        for c in by_country.index:
            take(legis[legis["country"] == c], floor[c])
        weights = by_country / by_country.sum()
        for c in by_country.index:
            take(legis[legis["country"] == c], int(round(remaining * weights[c])))
    take(d[(d["doc_type"] != "news") & (d["bucket"] == "neither")], n - len(chosen) if len(chosen) < n else 0)
    take(legis, n - len(chosen))
    take(d, n - len(chosen))
    out = d.loc[sorted(set(chosen))].copy()
    # held-out split stratified by whether any actor applies
    out["split"] = "train"
    for _, grp in out.groupby(out["bucket"] != "neither"):
        k = int(round(len(grp) * held_out_share))
        if k:
            held = rng.choice(list(grp.index), size=k, replace=False)
            out.loc[held, "split"] = "held_out"
    return out.drop(columns=["bucket"]).reset_index(drop=True)


def write_template(sample: pd.DataFrame, translations: dict[str, str], path: Path) -> Path:
    """The coders' CSV: text, metadata and empty coding columns; blind to any model output."""
    rows = []
    for _, r in sample.iterrows():
        rows.append({"doc_id": r["doc_id"], "country": r["country"], "doc_type": r["doc_type"], "date": r["date"], "language": r["language"],
                     "title_original": r["title_original"], "summary": _text(r.get("summary")), "title_en_mt": translations.get(r["doc_id"], ""),
                     "url": _text(r.get("source_record_url")), "mentions_us": int(bool(r["mentions_us"])), "mentions_cn": int(bool(r["mentions_cn"])),
                     **{c: "" for c in CODED_COLUMNS}})
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=TEMPLATE_COLUMNS, quoting=csv.QUOTE_ALL)
        w.writeheader()
        w.writerows(rows)
    return path


def _text(v) -> str:
    """A cell for the template: missing values (None, NaN) become an empty string, never the word "nan"."""
    if v is None or (isinstance(v, float) and np.isnan(v)):
        return ""
    s = str(v)
    return "" if s.strip().lower() in ("nan", "none", "<na>") else s


def _int_or_none(v) -> int | None:
    if v is None or (isinstance(v, float) and np.isnan(v)):
        return None
    s = str(v).strip().replace("\u2212", "-").replace("\u2013", "-")  # the codebook prints the Unicode minus; coders may copy it
    if s in ("", "NA", "na", "n/a", "-", "—"):
        return None
    return int(float(s))


def _bool_or_none(v) -> bool | None:
    s = str(v).strip().lower() if v is not None else ""
    if s in ("", "nan", "na", "n/a"):
        return None
    return s in ("1", "true", "yes", "y", "si", "sí", "sim", "x")


def read_coder_csv(path: Path) -> pd.DataFrame:
    """A coder's file -> normalised frame (doc_id + coded columns). Blank stance = not applicable."""
    df = pd.read_csv(path, dtype=str, keep_default_na=False)
    out = pd.DataFrame({"doc_id": df["doc_id"].astype(str)})
    for col in ("applicable_us", "applicable_cn"):
        out[col] = [_bool_or_none(v) for v in df.get(col, "")]
    for col in ("stance_us", "stance_cn", "tone", "confidence"):
        out[col] = [_int_or_none(v) for v in df.get(col, "")]
    topics = [v.strip() or None for v in df.get("topic", "")]
    bad = sorted({t for t in topics if t is not None and t not in TOPICS})
    if bad:
        raise ValueError(f"{path.name}: topic values outside the codebook: {bad}; allowed: {TOPICS}")
    out["topic"] = topics
    out["notes"] = [v.strip() or None for v in df.get("notes", "")]
    for col in ("applicable_us", "applicable_cn"):
        stance = "stance_us" if col == "applicable_us" else "stance_cn"
        out[col] = [a if a is not None else (s is not None) for a, s in zip(out[col], out[stance], strict=True)]
    return out


def adjudicate(c1: pd.DataFrame, c2: pd.DataFrame) -> pd.DataFrame:
    """Side-by-side frame with agreement flags and `final_*` prefilled where the coders agree."""
    m = c1.merge(c2, on="doc_id", suffixes=("_c1", "_c2"), how="inner")
    for col in ("applicable_us", "stance_us", "applicable_cn", "stance_cn", "tone", "topic"):
        a, b = m[f"{col}_c1"], m[f"{col}_c2"]
        agree = [(x == y) or (x is None and y is None) or (isinstance(x, float) and isinstance(y, float) and np.isnan(x) and np.isnan(y)) for x, y in zip(a, b, strict=True)]
        m[f"agree_{col}"] = agree
        m[f"final_{col}"] = [x if ok else None for x, ok in zip(a, agree, strict=True)]
    m["resolution"] = ["agree" if all(m.loc[i, f"agree_{c}"] for c in ("applicable_us", "stance_us", "applicable_cn", "stance_cn", "tone", "topic")) else "" for i in m.index]
    return m


def read_adjudicated_csv(path: Path) -> pd.DataFrame:
    """The adjudication file after the session -> final labels (rows whose resolution is filled)."""
    df = pd.read_csv(path, dtype=str, keep_default_na=False)
    df = df[df["resolution"].str.strip() != ""]
    out = pd.DataFrame({"doc_id": df["doc_id"].astype(str)})
    for col in ("applicable_us", "applicable_cn"):
        out[col] = [_bool_or_none(v) for v in df[f"final_{col}"]]
    for col in ("stance_us", "stance_cn", "tone"):
        out[col] = [_int_or_none(v) for v in df[f"final_{col}"]]
    out["topic"] = [v.strip() or None for v in df["final_topic"]]
    out["confidence"] = None
    out["notes"] = [v.strip() or None for v in df["resolution"]]
    return out


def to_rows(coded: pd.DataFrame, coder: str, round_: str, split: dict[str, str] | None = None) -> pd.DataFrame:
    rows = coded.copy()
    rows["coder"], rows["round"], rows["coded_at"] = coder, round_, now_iso()
    rows["split"] = [split.get(d) if split else None for d in rows["doc_id"]]
    rows["notes"] = rows.get("notes")
    return rows[["doc_id", "coder", "round", "applicable_us", "stance_us", "applicable_cn", "stance_cn", "tone", "topic", "confidence", "notes", "split", "coded_at"]]


def command_draw(round_: str = "v1", n: int = 300, warehouse: Path = WAREHOUSE_DIR, out_dir: Path = VALIDATION_DIR) -> dict:
    docs = corpus(warehouse)
    if docs.empty:
        raise RuntimeError("no documents in the warehouse; restore a data release first")
    tr = load_slot("doc_translation", "opus_mt", warehouse)
    translations = dict(zip(tr["doc_id"], tr["text"], strict=True)) if not tr.empty else {}
    sample = draw(docs, n=n)
    path = write_template(sample, translations, out_dir / f"sample_{round_}.csv")
    template = sample[["doc_id"]].copy()
    for c in ("applicable_us", "stance_us", "applicable_cn", "stance_cn", "tone", "topic", "confidence", "notes"):
        template[c] = None
    upsert("validation_sample", "manual", to_rows(template, "template", round_, dict(zip(sample["doc_id"], sample["split"], strict=True))), warehouse)
    return {"n": int(len(sample)), "held_out": int((sample["split"] == "held_out").sum()), "by_country": sample["country"].value_counts().to_dict(),
            "by_type": sample["doc_type"].value_counts().to_dict(), "file": str(path)}


def command_adjudicate(round_: str = "v1", in_dir: Path = VALIDATION_DIR) -> dict:
    c1 = read_coder_csv(in_dir / f"coder1_{round_}.csv")
    c2 = read_coder_csv(in_dir / f"coder2_{round_}.csv")
    adj = adjudicate(c1, c2)
    adj.to_csv(in_dir / f"adjudicated_{round_}.csv", index=False)
    return {"n": int(len(adj)), "agree_all": int((adj["resolution"] == "agree").sum()), "file": str(in_dir / f"adjudicated_{round_}.csv")}


def command_load(round_: str = "v1", in_dir: Path = VALIDATION_DIR, warehouse: Path = WAREHOUSE_DIR) -> dict:
    """Load coder files and the adjudicated file (those that exist) into validation_sample."""
    template = load_slot("validation_sample", "manual", warehouse)
    split = dict(zip(template["doc_id"], template["split"], strict=True)) if not template.empty else {}
    stats = {}
    for coder, name in (("coder1", f"coder1_{round_}.csv"), ("coder2", f"coder2_{round_}.csv")):
        p = in_dir / name
        if p.exists():
            stats[coder] = upsert("validation_sample", "manual", to_rows(read_coder_csv(p), coder, round_, split), warehouse)
    p = in_dir / f"adjudicated_{round_}.csv"
    if p.exists():
        stats["adjudicated"] = upsert("validation_sample", "manual", to_rows(read_adjudicated_csv(p), "adjudicated", round_, split), warehouse)
    return stats
