"""ResourceContracts.org published mining contracts for the South American countries -> contract."""
from __future__ import annotations

import json

import pandas as pd

from ..http import Snapshot
from ..registry import IN_SCOPE
from .base import Adapter, event_id
from .util import tag_mineral

API = "https://api.resourcecontracts.org/contracts"
ISO2 = {"ARG": "ar", "BOL": "bo", "BRA": "br", "CHL": "cl", "COL": "co", "ECU": "ec", "GUY": "gy", "PRY": "py", "PER": "pe", "SUR": "sr", "URY": "uy", "VEN": "ve"}
ISO2_TO_3 = {v: k for k, v in ISO2.items()}


class ResourceContracts(Adapter):
    source_id = "resourcecontracts"
    tables = ("contract",)

    def fetch(self, snap: Snapshot) -> None:
        for iso3, iso2 in ISO2.items():
            page = 1
            while page <= 20:
                payload = snap.get_json(API, f"{iso3}_p{page}.json", params={"country_code": iso2, "per_page": 100, "page": page})
                results = payload.get("results", []) if isinstance(payload, dict) else []
                total = payload.get("total", 0) if isinstance(payload, dict) else 0
                if not results or page * 100 >= int(total or 0):
                    break
                page += 1

    def parse(self, snap: Snapshot) -> dict[str, pd.DataFrame]:
        rows: dict[str, dict] = {}
        for name in snap.files:
            if not name.endswith(".json") or not snap.has(name):
                continue
            payload = json.loads(snap.path(name).read_text())
            for c in payload.get("results", []):
                cid = str(c.get("id") or c.get("open_contracting_id") or "")
                if not cid:
                    continue
                country = c.get("country") or {}
                code = (country.get("code") if isinstance(country, dict) else country) or name.split("_")[0]
                iso3 = ISO2_TO_3.get(str(code).lower(), str(code).upper())
                if iso3 not in IN_SCOPE:
                    continue
                resources = c.get("resource") or c.get("resources") or []
                companies = c.get("company") or c.get("companies") or []
                ctype = c.get("contract_type") or c.get("type") or []
                res_text = ", ".join(r if isinstance(r, str) else str(r.get("name", r)) for r in (resources if isinstance(resources, list) else [resources]))
                comp_text = ", ".join(x if isinstance(x, str) else str(x.get("name", x)) for x in (companies if isinstance(companies, list) else [companies]))
                ctype_text = ", ".join(x if isinstance(x, str) else str(x.get("name", x)) for x in (ctype if isinstance(ctype, list) else [ctype]))
                rows[cid] = {
                    "contract_id": event_id("rc", cid), "country": iso3, "title": c.get("name") or c.get("title") or cid,
                    "resource": res_text or None, "mineral": tag_mineral(f"{res_text} {c.get('name', '')}"), "companies": comp_text or None,
                    "signature_year": int(c["signature_year"]) if str(c.get("signature_year", "")).isdigit() else pd.NA,
                    "contract_type": ctype_text or None, "language": c.get("language"), "value_type": "reported",
                    "source_record_url": f"https://www.resourcecontracts.org/contract/{c.get('open_contracting_id') or cid}/view",
                }
        return {"contract": self.stamp(snap, pd.DataFrame(list(rows.values())))}
