"""Phase 3 text analysis: machine translation, zero-shot stance and tone, embeddings, topics, validation.

Nothing here imports torch or transformers at package import time; `models.py` loads them lazily and
`SCM_TEXT_FAKE=1` substitutes deterministic fakes so unit tests and CI never need the ML extra."""
