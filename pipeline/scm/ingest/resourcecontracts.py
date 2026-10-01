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


def _names(value: object) -> str:
    """Join a list of strings or {name: ...} dicts; tolerate None and nested lists."""
    items = value if isinstance(value, list) else [value]
    out: list[str] = []
    for x in items:
        if x is None:
            continue
        if isinstance(x, dict):
            out.append(str(x.get("name") or x.get("label") or x.get("code") or ""))
        elif isinstance(x, list):
            out.append(_names(x))
        else:
            out.append(str(x))
    return ", ".join(t for t in out if t)


class ResourceContracts(Adapter):
    source_id = "resourcecontracts"
    tables = ("contract",)

    def fetch(self, snap: Snapshot) -> None:
        for iso3, iso2 in ISO2.items():
            page = 1
            while page <= 20:
                payload = snap.get_json(API, f"{iso3}_p{page}.json", params={"country_code": iso2, "per_page": 100, "page": page})
                results = (payload.get("results") or []) if isinstance(payload, dict) else []
                total = (payload.get("total") or 0) if isinstance(payload, dict) else 0
                if not results or page * 100 >= int(total or 0):
                    break
                page += 1

    def parse(self, snap: Snapshot) -> dict[str, pd.DataFrame]:
        rows: dict[str, dict] = {}
        for name in snap.files:
            if not name.endswith(".json") or not snap.has(name):
                continue
            payload = json.loads(snap.path(name).read_text())
            if not isinstance(payload, dict):
                continue
            for c in payload.get("results") or []:
                if not isinstance(c, dict):
                    continue
                cid = str(c.get("id") or c.get("open_contracting_id") or "")
                if not cid:
                    continue
                countries = c.get("countries") or c.get("country") or []
                first = countries[0] if isinstance(countries, list) and countries else countries
                code = (first.get("code") if isinstance(first, dict) else first) or name.split("_")[0]
                iso3 = ISO2_TO_3.get(str(code).lower(), str(code).upper())
                if iso3 not in IN_SCOPE:
                    continue
                resources = c.get("resource") or c.get("resources") or []
                companies = c.get("company") or c.get("companies") or []
                ctype = c.get("contract_type") or c.get("type") or []
                res_text = _names(resources)
                comp_text = _names(companies)
                ctype_text = _names(ctype)
                rows[cid] = {
                    "contract_id": event_id("rc", cid), "country": iso3, "title": c.get("name") or c.get("title") or cid,
                    "resource": res_text or None, "mineral": tag_mineral(f"{res_text} {c.get('name', '')}"), "companies": comp_text or None,
                    "signature_year": int(c["year_signed"]) if str(c.get("year_signed", "")).isdigit() else int(c["signature_year"]) if str(c.get("signature_year", "")).isdigit() else pd.NA,
                    "contract_type": ctype_text or None, "language": c.get("language"), "value_type": "reported",
                    "source_record_url": f"https://www.resourcecontracts.org/contract/{c.get('open_contracting_id') or cid}/view",
                }
        return {"contract": self.stamp(snap, pd.DataFrame(list(rows.values())))}
