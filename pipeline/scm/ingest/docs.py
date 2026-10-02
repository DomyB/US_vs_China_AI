"""Shared row builders for the text tables (document, vote, vote_member)."""
from __future__ import annotations

from .base import event_id
from .feeds import normalize_url
from .keywords import KEYWORDS_VERSION, Relevance

DOCUMENT_COLUMNS = ["doc_id", "country", "doc_type", "date", "date_precision", "year", "title_original", "language", "venue",
                    "outlet_source_id", "author", "summary", "status", "native_id", "url_norm", "keywords_matched", "minerals",
                    "mentions_us", "mentions_cn", "mining_related", "filter_version", "full_text_stored", "value_type", "source_record_url"]
VOTE_COLUMNS = ["vote_id", "doc_id", "country", "chamber", "date", "year", "title_original", "result", "yes", "no", "abstain", "absent",
                "total", "native_id", "value_type", "source_record_url"]
VOTE_MEMBER_COLUMNS = ["vote_id", "country", "member_id", "member_name", "party", "region", "choice", "choice_original", "source_record_url"]
MEDIA_VOLUME_COLUMNS = ["country", "period", "items_total", "items_mining", "items_cn", "items_us", "source_record_url"]


def make_document(*, source_id: str, country: str, doc_type: str, date: str, date_precision: str, title: str, language: str,
                  venue: str, url: str, rel: Relevance, native_id: str | None = None, outlet_source_id: str | None = None,
                  author: str | None = None, summary: str | None = None, status: str | None = None) -> dict:
    """One `document` row. `url` is the record page (bill) or the article URL (news); the id is
    stable across runs (native id when the source has one, else the normalised URL)."""
    url_norm = normalize_url(url) if url else ""
    key = native_id or url_norm
    return {
        "doc_id": event_id(country, source_id, key), "country": country, "doc_type": doc_type, "date": date,
        "date_precision": date_precision, "year": int(date[:4]), "title_original": title[:400], "language": language, "venue": venue,
        "outlet_source_id": outlet_source_id, "author": author, "summary": None if doc_type == "news" else (summary or None),
        "status": status, "native_id": native_id, "url_norm": url_norm, "keywords_matched": ",".join(dict.fromkeys(rel.matched)),
        "minerals": ",".join(rel.minerals) or None, "mentions_us": rel.mentions_us, "mentions_cn": rel.mentions_cn,
        "mining_related": rel.mining, "filter_version": KEYWORDS_VERSION, "full_text_stored": False, "value_type": "reported",
        "source_record_url": url or None,
    }
