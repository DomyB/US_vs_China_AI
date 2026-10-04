"""Zero-shot baseline: stance toward the US and toward China from a multilingual NLI model, tone from a
multilingual sentiment model. Stance is scored only when the actor is named (keyword flags from ingestion);
otherwise it is null = not applicable. One doc_classification row per document (method zero_shot)."""
from __future__ import annotations

from pathlib import Path

import pandas as pd

from ..paths import WAREHOUSE_DIR
from ..warehouse import upsert
from . import models
from .store import corpus, new_run_id, now_iso, pending

SLOT = "zero_shot"
CODEBOOK_VERSION = "v1"
STRONG = 0.75  # pos/neg probability at or above which the stance is ±2 rather than ±1 (stated on the methodology page)

ACTOR = {"es": {"US": "Estados Unidos", "CN": "China"}, "pt": {"US": "os Estados Unidos", "CN": "a China"},
         "en": {"US": "the United States", "CN": "China"}, "nl": {"US": "the United States", "CN": "China"}}
# full-sentence hypotheses per language; the fake NLI recognises the role words (favor/apoi/crític/contra)
HYPOTHESES = {
    "es": {"pos": "Este texto es favorable a {actor} o apoya la cooperación con {actor}.",
           "neg": "Este texto es crítico con {actor} o se opone a {actor}.",
           "neu": "Este texto menciona a {actor} sin valorarlo."},
    "pt": {"pos": "Este texto é favorável a {actor} ou apoia a cooperação com {actor}.",
           "neg": "Este texto é crítico de {actor} ou se opõe a {actor}.",
           "neu": "Este texto menciona {actor} sem avaliar."},
    "en": {"pos": "This text is favourable to {actor} or supports cooperation with {actor}.",
           "neg": "This text is critical of {actor} or opposes {actor}.",
           "neu": "This text mentions {actor} without judging it."},
}
HYPOTHESES["nl"] = HYPOTHESES["en"]


def hypotheses(lang: str, actor: str) -> dict[str, str]:
    lang = lang if lang in HYPOTHESES else "en"
    name = ACTOR.get(lang, ACTOR["en"])[actor]
    return {role: h.format(actor=name) for role, h in HYPOTHESES[lang].items()}


def score_actor(nli_fn, text: str, lang: str, actor: str) -> tuple[int, float]:
    """(stance in -2..2, confidence = probability of the winning hypothesis)."""
    hyp = hypotheses(lang, actor)
    res = nli_fn(text, list(hyp.values()))
    by_role = {role: res["scores"][res["labels"].index(h)] for role, h in hyp.items()}
    role = max(by_role, key=by_role.get)
    p = float(by_role[role])
    if role == "neu":
        return 0, p
    sign = 1 if role == "pos" else -1
    return sign * (2 if p >= STRONG else 1), p


def tone_of(sent_fn, texts: list[str]) -> list[tuple[float, float]]:
    """(tone = p_positive - p_negative, confidence = max probability) per text."""
    out = []
    for probs in sent_fn(texts):
        pos, neg = float(probs.get("positive", 0.0)), float(probs.get("negative", 0.0))
        out.append((round(max(-1.0, min(1.0, pos - neg)), 4), round(max(probs.values()) if probs else 0.0, 4)))
    return out


def run(warehouse: Path = WAREHOUSE_DIR, limit: int | None = None, force: bool = False, codebook_version: str = CODEBOOK_VERSION,
        progress=None, batch: int = 200) -> dict:
    docs = corpus(warehouse)
    model = models.model_id("nli")
    todo = pending("doc_classification", SLOT, docs, {"method": "zero_shot", "model": model, "codebook_version": codebook_version}, warehouse, force)
    if limit is not None:
        todo = todo.head(limit)
    stats = {"pending": int(len(todo)), "classified": 0, "stance_scored": 0, "stored": 0}
    if todo.empty:
        return stats
    run_id = new_run_id("zero_shot")
    nli_fn, sent_fn = models.nli(), models.sentiment()
    sent_model = models.model_id("sentiment")
    for start in range(0, len(todo), batch):
        chunk = todo.iloc[start:start + batch]
        tones = tone_of(sent_fn, [str(t) for t in chunk["text"]])
        rows = []
        stamp = now_iso()
        for (_, r), (tone, tconf) in zip(chunk.iterrows(), tones, strict=True):
            rec = {"doc_id": r["doc_id"], "run_id": run_id, "method": "zero_shot", "model": model, "codebook_version": codebook_version,
                   "stance_us": pd.NA, "stance_us_conf": None, "stance_cn": pd.NA, "stance_cn_conf": None,
                   "tone": tone, "tone_conf": tconf, "frame": f"tone:{sent_model}", "created_at": stamp}
            for actor, flag in (("US", "mentions_us"), ("CN", "mentions_cn")):
                if bool(r.get(flag)):
                    st, conf = score_actor(nli_fn, str(r["text"]), r["lang"], actor)
                    rec[f"stance_{actor.lower()}"], rec[f"stance_{actor.lower()}_conf"] = st, round(conf, 4)
                    stats["stance_scored"] += 1
            rows.append(rec)
        stats["stored"] = upsert("doc_classification", SLOT, pd.DataFrame(rows), warehouse)
        stats["classified"] += len(rows)
        if progress:
            progress({"step": "classify", "done": stats["classified"], "pending": stats["pending"]})
    return stats
