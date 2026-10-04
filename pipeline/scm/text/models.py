"""Lazy loaders for the open-weight models (CPU inference; weights cached under HF_HOME in the workflow).

Every loader returns a plain callable so the rest of the package never touches transformers objects.
With SCM_TEXT_FAKE=1 the loaders return small deterministic fakes (keyword scoring, hashed bag-of-words
embeddings) that exercise the same code paths in tests without downloading anything."""
from __future__ import annotations

import gc
import hashlib
import math
import os
import re
import unicodedata
from functools import lru_cache

MODEL_IDS = {
    "translate_romance": "Helsinki-NLP/opus-mt-ROMANCE-en",  # es and pt -> en (one Marian model)
    "translate_nl": "Helsinki-NLP/opus-mt-nl-en",
    "nli": "MoritzLaurer/mDeBERTa-v3-base-xnli-multilingual-nli-2mil7",
    "sentiment": "cardiffnlp/twitter-xlm-roberta-base-sentiment-multilingual",
    "embed": "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2",
}
FAKE_SUFFIX = "-fake"


def fake_mode() -> bool:
    return os.environ.get("SCM_TEXT_FAKE") == "1"


def model_id(key: str) -> str:
    """The model name recorded in the tables (the fake carries a suffix so fake rows are never mistaken for real)."""
    return MODEL_IDS[key] + (FAKE_SUFFIX if fake_mode() else "")


def require_ml() -> None:
    try:
        import torch  # noqa: F401
        import transformers  # noqa: F401
    except ImportError as e:  # pragma: no cover - only without the extra
        raise RuntimeError(
            "text analysis needs the ML extra: pip install torch --index-url https://download.pytorch.org/whl/cpu "
            "&& pip install -e '.[dev,ml]' (or set SCM_TEXT_FAKE=1 for the deterministic fakes)"
        ) from e


def _fold(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFKD", s.lower()) if not unicodedata.combining(c))


def _tokens(s: str) -> list[str]:
    return re.findall(r"[a-z0-9]{2,}", _fold(s))


# ---- fakes --------------------------------------------------------------------------------------------
POSITIVE_WORDS = {"favoravel", "favorable", "apoyo", "apoio", "acuerdo", "acordo", "cooperacion", "cooperacao", "inversion",
                  "investimento", "beneficio", "beneficios", "oportunidad", "parceria", "alianza", "aprueba", "aprova", "celebra",
                  "welcomes", "supports", "partnership", "benefits", "approves"}
NEGATIVE_WORDS = {"critica", "rechaza", "rejeita", "sanciona", "sancion", "amenaza", "ameaca", "denuncia", "prohibe", "proibe",
                  "restringe", "riesgo", "risco", "preocupacion", "preocupacao", "condena", "expulsa", "threat", "rejects",
                  "sanctions", "bans", "concern", "criticises", "criticizes"}


class FakeTranslator:
    model = "fake-translator"

    def __call__(self, texts: list[str]) -> list[str]:
        return [f"[en] {t}" for t in texts]


class FakeNLI:
    """Scores the pos/neg/neu hypotheses from keyword counts; the hypothesis texts carry a role marker."""

    def __call__(self, text: str, candidate_labels: list[str]) -> dict:
        toks = set(_tokens(text))
        pos, neg = len(toks & POSITIVE_WORDS), len(toks & NEGATIVE_WORDS)
        raw = {}
        for lab in candidate_labels:
            role = _role_of(lab)
            raw[lab] = {"pos": 0.2 + pos, "neg": 0.2 + neg, "neu": 0.6}[role]
        z = sum(raw.values())
        scores = {k: v / z for k, v in raw.items()}
        order = sorted(scores, key=scores.get, reverse=True)
        return {"labels": order, "scores": [scores[k] for k in order]}


class FakeSentiment:
    def __call__(self, texts: list[str]) -> list[dict[str, float]]:
        out = []
        for t in texts:
            toks = set(_tokens(t))
            pos, neg = len(toks & POSITIVE_WORDS), len(toks & NEGATIVE_WORDS)
            raw = {"positive": 0.2 + pos, "negative": 0.2 + neg, "neutral": 0.6}
            z = sum(raw.values())
            out.append({k: v / z for k, v in raw.items()})
        return out


class FakeEmbedder:
    """Hashed bag-of-words in 32 dimensions, L2-normalised: texts sharing words land close together."""

    dim = 32

    def __call__(self, texts: list[str]):
        import numpy as np

        vecs = np.zeros((len(texts), self.dim), dtype="float32")
        for i, t in enumerate(texts):
            for tok in _tokens(t):
                h = int(hashlib.md5(tok.encode()).hexdigest(), 16)  # noqa: S324 - not security
                vecs[i, h % self.dim] += 1.0 if (h >> 8) % 2 else -1.0
            n = math.sqrt(float((vecs[i] ** 2).sum())) or 1.0
            vecs[i] /= n
        return vecs


ROLE_MARKERS = {"pos": ("favor", "positiv", "apoi", "apoy", "welcom", "support"), "neg": ("crític", "critic", "negativ", "contra", "against")}


def _role_of(hypothesis: str) -> str:
    low = hypothesis.lower()
    for role, marks in ROLE_MARKERS.items():
        if any(m in low for m in marks):
            return role
    return "neu"


# ---- real loaders ---------------------------------------------------------------------------------------
def _device_setup() -> None:
    import torch

    torch.set_num_threads(max(1, os.cpu_count() or 1))
    os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")


@lru_cache(maxsize=4)
def translator(lang: str):
    """Callable(texts) -> English texts for `lang` in es/pt/nl (identity for en)."""
    if lang == "en":
        return lambda texts: list(texts)
    if fake_mode():
        return FakeTranslator()
    require_ml()
    _device_setup()
    import torch
    from transformers import MarianMTModel, MarianTokenizer

    name = MODEL_IDS["translate_nl" if lang == "nl" else "translate_romance"]
    tok = MarianTokenizer.from_pretrained(name)
    model = MarianMTModel.from_pretrained(name).eval()

    def translate(texts: list[str], batch_size: int = 16, max_length: int = 256) -> list[str]:
        out: list[str] = []
        for i in range(0, len(texts), batch_size):
            batch = [t[:600] for t in texts[i:i + batch_size]]
            enc = tok(batch, return_tensors="pt", padding=True, truncation=True, max_length=max_length)
            with torch.inference_mode():
                gen = model.generate(**enc, max_length=max_length, num_beams=2)
            out.extend(tok.batch_decode(gen, skip_special_tokens=True))
        return out

    return translate


@lru_cache(maxsize=1)
def nli():
    """Callable(text, candidate_labels) -> {"labels": [...], "scores": [...]} (hypotheses are full sentences)."""
    if fake_mode():
        return FakeNLI()
    require_ml()
    _device_setup()
    from transformers import pipeline

    pipe = pipeline("zero-shot-classification", model=MODEL_IDS["nli"], device=-1)

    def score(text: str, candidate_labels: list[str]) -> dict:
        res = pipe(text[:1200], candidate_labels=candidate_labels, hypothesis_template="{}", multi_label=False)
        return {"labels": res["labels"], "scores": res["scores"]}

    return score


@lru_cache(maxsize=1)
def sentiment():
    """Callable(texts) -> list of {label: prob} with labels positive/neutral/negative."""
    if fake_mode():
        return FakeSentiment()
    require_ml()
    _device_setup()
    from transformers import pipeline

    pipe = pipeline("text-classification", model=MODEL_IDS["sentiment"], device=-1, top_k=None, truncation=True, max_length=256)

    def score(texts: list[str], batch_size: int = 32) -> list[dict[str, float]]:
        out = []
        for i in range(0, len(texts), batch_size):
            for res in pipe([t[:1000] for t in texts[i:i + batch_size]], batch_size=batch_size):
                out.append({r["label"].lower(): float(r["score"]) for r in res})
        return out

    return score


@lru_cache(maxsize=1)
def embedder():
    """Callable(texts) -> float32 array (n, dim), L2-normalised."""
    if fake_mode():
        return FakeEmbedder()
    require_ml()
    _device_setup()
    from sentence_transformers import SentenceTransformer

    model = SentenceTransformer(MODEL_IDS["embed"], device="cpu")

    def encode(texts: list[str], batch_size: int = 64):
        return model.encode([t[:1000] for t in texts], batch_size=batch_size, normalize_embeddings=True, show_progress_bar=False)

    return encode


def release_all() -> None:
    """Drop cached models between steps so only one is resident (about 1.1 GB peak on the runner)."""
    for fn in (translator, nli, sentiment, embedder):
        fn.cache_clear()
    gc.collect()
