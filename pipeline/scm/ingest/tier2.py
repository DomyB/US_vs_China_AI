"""Tier 2 adapters: run only when their secret is present. Parsers are written against the
documented response formats and validated on fixtures; the first live run confirms them."""
from __future__ import annotations

import json
import os
import re
from datetime import date

import pandas as pd

from ..http import Snapshot
from ..registry import IN_SCOPE, iso3_from_name
from .base import Adapter, event_id, to_float
from .keywords import relevance
from .util import col, read_any, tag_mineral

CONGRESS_API = "https://api.congress.gov/v3"
CENSUS_API = "https://api.census.gov/data/timeseries/intltrade"
CENSUS_CTY = {"ARG": "3570", "BOL": "3350", "BRA": "3510", "CHL": "3370", "COL": "3010", "ECU": "3310", "GUY": "3120", "PRY": "3530", "PER": "3330", "SUR": "3150", "URY": "3550", "VEN": "3070"}


# Western Hemisphere framing: a bill naming China only counts when it is also about this region (the 12 countries
# or the region itself), otherwise every bill mentioning Taiwan or trade with China would qualify.
HEMISPHERE_RE = re.compile(
    r"(?i)\b(latin america|south america|western hemisphere|caribbean|andean|argentin|bolivia|brazil|chile|colombia|ecuador|guyana|"
    r"paraguay|peru|suriname|uruguay|venezuela|lithium triangle|panama)")


# Titles that match a mineral or mining word without being about minerals policy: medals and honours ("Congressional Gold
# Medal" made up 607 of the first 1,576 matches), "data mining", and the many miscellaneous tariff bills that suspend the
# duty on a named chemical ("... aluminum hydroxide carbonate", "... calcium chloride phosphate").
NOISE_RE = re.compile(r"(?i)gold medal|gold star|golden|data mining|text mining")
DUTY_SUSPENSION_RE = re.compile(r"(?i)\bsuspen\w*\b.*\b(duty|duties)\b|\b(duty|duties)\b.*\bsuspen\w*\b")


def first_congress() -> int:
    return 110  # 2007-2008, the first Congress after the period starts


def current_congress(today: date | None = None) -> int:
    return ((today or date.today()).year - 1789) // 2 + 1


class CongressGov(Adapter):
    """US bills, by listing every bill of each Congress and filtering the titles here: the API's bill endpoint has
    no keyword search (a `q` parameter is ignored and every query returned the same 250 recent bills)."""

    source_id = "congress_gov"
    tables = ("policy_document",)
    requires_env = ("CONGRESS_GOV_KEY",)
    min_interval = 0.8
    PAGE = 250

    def fetch(self, snap: Snapshot) -> None:
        key = os.environ["CONGRESS_GOV_KEY"]
        pages = {}
        for congress in range(first_congress(), current_congress() + 1):
            offset, n = 0, 0
            while True:
                name = f"bills_{congress}_{offset}.json"
                payload = snap.get_json(f"{CONGRESS_API}/bill/{congress}", name,
                                        params={"api_key": key, "format": "json", "limit": self.PAGE, "offset": offset, "sort": "updateDate+desc"})
                got = len((payload or {}).get("bills") or []) if isinstance(payload, dict) else 0
                n += got
                if got < self.PAGE:
                    break
                offset += self.PAGE
            pages[congress] = n
        snap.manifest["bills_listed_per_congress"] = pages
        snap.save()

    @staticmethod
    def on_topic(title: str) -> list[str] | None:
        """Matched terms when the title is about minerals or mining, or names China together with the hemisphere."""
        if DUTY_SUSPENSION_RE.search(title):
            return None
        title = NOISE_RE.sub(" ", title)
        rel = relevance(title)
        if rel.mining or rel.minerals:
            return rel.matched
        if rel.mentions_cn and HEMISPHERE_RE.search(title):
            return rel.matched + [m.group(0).lower() for m in HEMISPHERE_RE.finditer(title)][:2]
        return None

    def parse(self, snap: Snapshot) -> dict[str, pd.DataFrame]:
        rows: dict[str, dict] = {}
        listed = 0
        for name in sorted(snap.files):
            if not name.startswith("bills_") or not snap.has(name):
                continue
            payload = json.loads(snap.path(name).read_text())
            for b in payload.get("bills", []):
                listed += 1
                title = b.get("title") or ""
                matched = self.on_topic(title)
                if not matched:
                    continue
                key = f"{b.get('congress')}-{b.get('type')}-{b.get('number')}"
                # date of the latest action: when the bill was last alive. updateDate is when the record was last touched
                # (bills from 2008 carry 2025 update dates), so it is only the fallback.
                date_ = ((b.get("latestAction") or {}).get("actionDate") or b.get("updateDate") or "")[:10]
                rows[key] = {"doc_id": event_id("congress", key), "jurisdiction": "US", "date": date_, "year": int(date_[:4]) if date_ else 0,
                             "doc_type": f"bill:{b.get('type')}", "title": title or key, "agency": "US Congress",
                             "abstract": (b.get("latestAction") or {}).get("text"), "topics": ",".join(dict.fromkeys(matched)),
                             "value_type": "reported", "source_record_url": b.get("url")}
        snap.manifest["bills_scanned"] = listed
        columns = ["doc_id", "jurisdiction", "date", "year", "doc_type", "title", "agency", "abstract", "topics", "value_type", "source_record_url"]
        df = pd.DataFrame(list(rows.values()), columns=columns)
        return {"policy_document": self.stamp(snap, df)}


class CensusTrade(Adapter):
    """US HS10 monthly imports from each South American country, aggregated to HS6 at parse time."""

    source_id = "us_census_trade"
    tables = ("trade_flow",)
    requires_env = ("CENSUS_KEY",)

    def fetch(self, snap: Snapshot) -> None:
        from ..registry import hs6_to_mineral

        key = os.environ["CENSUS_KEY"]
        for code in sorted(hs6_to_mineral()):
            snap.get_json(f"{CENSUS_API}/imports/hs", f"imports_{code}.json", params={"get": "CTY_CODE,CTY_NAME,I_COMMODITY,GEN_VAL_MO,GEN_QY1_MO,UNIT_QY1", "I_COMMODITY": code, "time": "from 2013-01", "key": key})

    def parse(self, snap: Snapshot) -> dict[str, pd.DataFrame]:
        from ..registry import hs6_to_mineral

        mapping = hs6_to_mineral()
        cty_to_iso = {v: k for k, v in CENSUS_CTY.items()}
        rows: list[dict] = []
        for name, meta in snap.files.items():
            if not name.startswith("imports_") or not snap.has(name):
                continue
            payload = json.loads(snap.path(name).read_text())
            if not payload or len(payload) < 2:
                continue
            header, data = payload[0], payload[1:]
            idx = {h: i for i, h in enumerate(header)}
            for r in data:
                iso = cty_to_iso.get(str(r[idx["CTY_CODE"]]))
                if iso is None:
                    continue
                code = str(r[idx["I_COMMODITY"]])[:6]
                if code not in mapping:
                    continue
                t = str(r[idx["time"]])
                mineral, stage = mapping[code]
                rows.append({"reporter": iso, "partner": "USA", "reported_by": "USA", "hs6": code, "mineral": mineral, "stage": stage, "year": int(t[:4]), "month": int(t[5:7]), "flow": "X",
                             "value_usd": to_float(r[idx["GEN_VAL_MO"]]) or 0.0, "qty": to_float(r[idx.get("GEN_QY1_MO", 0)]), "qty_unit": r[idx["UNIT_QY1"]] if "UNIT_QY1" in idx else None, "value_type": "mirror", "source_record_url": meta.get("url")})
        return {"trade_flow": self.stamp(snap, pd.DataFrame(rows))}


class BUCODF(Adapter):
    """BU GDP Center China's Overseas Development Finance database. The file is obtained under a
    signed data-use agreement; CODF_DOWNLOAD_URL points to it. Only aggregates reach the site."""

    source_id = "bu_codf"
    tables = ("finance_event",)
    requires_env = ("CODF_DOWNLOAD_URL",)

    def fetch(self, snap: Snapshot) -> None:
        url = os.environ["CODF_DOWNLOAD_URL"]
        snap.get(url, "codf." + (url.rsplit(".", 1)[-1].lower().split("?")[0] or "xlsx"))

    def parse(self, snap: Snapshot) -> dict[str, pd.DataFrame]:
        path = next(snap.path(n) for n in snap.files if n.startswith("codf."))
        df = read_any(path)
        c_country = col(df, "Country", "Borrower Country")
        c_year = col(df, "Year", "Signing Year", "Commitment Year")
        c_amt = col(df, "Amount", "USD", "Loan Amount")
        c_lender = col(df, "Lender", required=False)
        c_borrower = col(df, "Borrower", required=False)
        c_sector = col(df, "Sector", required=False)
        c_desc = col(df, "Project", "Description", "Purpose", required=False)
        rows: list[dict] = []
        for i, r in df.iterrows():
            iso = iso3_from_name(r[c_country])
            if iso not in IN_SCOPE:
                continue
            y = to_float(r[c_year])
            if y is None:
                continue
            amt = to_float(r[c_amt])
            desc = str(r[c_desc]) if c_desc and pd.notna(r[c_desc]) else "Chinese policy-bank loan"
            rows.append({"event_id": event_id("codf", i, r[c_country], y, amt), "country": iso, "date": None, "year": int(y), "actor_from": str(r[c_lender]) if c_lender else "CDB / China Exim", "actor_from_origin": "CN",
                         "actor_to": str(r[c_borrower]) if c_borrower and pd.notna(r[c_borrower]) else None, "type": "loan", "amount_usd": amt * (1e6 if amt is not None and amt < 1e5 else 1) if amt is not None else None, "currency": "USD",
                         "sector": str(r[c_sector]) if c_sector else None, "mineral": tag_mineral(f"{desc} {r[c_sector] if c_sector else ''}"), "description": desc[:400], "value_type": "reported", "source_record_url": None})
        return {"finance_event": self.stamp(snap, pd.DataFrame(rows))}
