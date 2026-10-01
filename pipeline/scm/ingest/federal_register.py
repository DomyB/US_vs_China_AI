"""Federal Register documents on critical minerals, Section 232 actions and related rules -> policy_document."""
from __future__ import annotations

import json

import pandas as pd

from ..http import Snapshot
from .base import Adapter, event_id

API = "https://www.federalregister.gov/api/v1/documents.json"
QUERIES = {
    "critical_minerals": '"critical minerals"',
    "section_232_copper": '"section 232" copper',
    "lithium": 'lithium "critical mineral"',
    "rare_earth": '"rare earth" critical',
    "foreign_entity_of_concern": '"foreign entity of concern"',
}
FIELDS = ["document_number", "title", "type", "abstract", "publication_date", "html_url", "agencies", "topics"]


class FederalRegister(Adapter):
    source_id = "federal_register"
    tables = ("policy_document",)

    def fetch(self, snap: Snapshot) -> None:
        for key, term in QUERIES.items():
            params = {"conditions[term]": term, "conditions[publication_date][gte]": "2008-01-01", "per_page": 1000, "order": "newest"}
            for f in FIELDS:
                params.setdefault("fields[]", []).append(f)  # type: ignore[union-attr]
            page = 1
            url: str | None = API
            while url and page <= 5:
                payload = snap.get_json(url, f"{key}_p{page}.json", params=params if page == 1 else None)
                url = payload.get("next_page_url") if isinstance(payload, dict) else None
                page += 1

    def parse(self, snap: Snapshot) -> dict[str, pd.DataFrame]:
        rows: dict[str, dict] = {}
        for name in snap.files:
            if not name.endswith(".json") or not snap.has(name):
                continue
            payload = json.loads(snap.path(name).read_text())
            query = name.split("_p")[0]
            for d in payload.get("results", []):
                num = d.get("document_number")
                if not num:
                    continue
                if num in rows:
                    rows[num]["topics"] = ",".join(sorted(set(rows[num]["topics"].split(",")) | {query}))
                    continue
                date = d.get("publication_date") or ""
                rows[num] = {
                    "doc_id": event_id("fr", num), "jurisdiction": "US", "date": date, "year": int(date[:4]) if date else 0,
                    "doc_type": str(d.get("type") or "").lower(), "title": d.get("title") or "",
                    "agency": "; ".join(a.get("name", "") for a in (d.get("agencies") or []) if isinstance(a, dict)) or None,
                    "abstract": (d.get("abstract") or None), "topics": query, "value_type": "reported", "source_record_url": d.get("html_url"),
                }
        df = pd.DataFrame(list(rows.values()))
        df = df[df["year"] > 0] if not df.empty else df
        return {"policy_document": self.stamp(snap, df)}
