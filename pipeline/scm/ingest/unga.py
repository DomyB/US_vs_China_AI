"""UN General Assembly voting data (Bailey, Strezhnev, Voeten; Harvard Dataverse):
ideal points and ideal-point distance of each South American country to the US and China -> governance."""
from __future__ import annotations

import pandas as pd

from ..http import Snapshot
from ..registry import IN_SCOPE
from .base import Adapter
from .util import col

DATASET = "https://dataverse.harvard.edu/api/datasets/:persistentId/"
DOI = "doi:10.7910/DVN/LEJUQZ"
FILE = "https://dataverse.harvard.edu/api/access/datafile/{id}"
COW = {"ARG": 160, "BOL": 145, "BRA": 140, "CHL": 155, "COL": 100, "ECU": 130, "GUY": 110, "PRY": 150, "PER": 135, "SUR": 115, "URY": 165, "VEN": 101, "USA": 2, "CHN": 710}
COW_TO_ISO = {v: k for k, v in COW.items()}


class UNGA(Adapter):
    source_id = "unga_votes"
    tables = ("governance",)

    def fetch(self, snap: Snapshot) -> None:
        meta = snap.get_json(DATASET, "dataset.json", params={"persistentId": DOI})
        files = meta.get("data", {}).get("latestVersion", {}).get("files", []) if isinstance(meta, dict) else []
        snap.manifest["file_list"] = [f.get("dataFile", {}).get("filename") for f in files]
        snap.save()
        for f in files:
            df_ = f.get("dataFile", {})
            fname = str(df_.get("filename", ""))
            low = fname.lower()
            if (low.startswith("idealpoint") or low.startswith("agreementscores")) and low.endswith((".csv", ".tab")):
                snap.get(FILE.format(id=df_["id"]), f"files/{fname}", params={"format": "original"}, timeout=600)

    def parse(self, snap: Snapshot) -> dict[str, pd.DataFrame]:
        rows: list[dict] = []
        for name, meta in snap.files.items():
            if not name.startswith("files/") or not snap.has(name):
                continue
            low = name.lower()
            path = snap.path(name)
            df = pd.read_csv(path, sep="\t" if low.endswith(".tab") else ",", low_memory=False)
            if "idealpoint" in low:
                c_cc = col(df, "ccode")
                c_sess = col(df, "session")
                c_ip = col(df, "IdealPointAll", "IdealPoint")
                for _, r in df.iterrows():
                    iso = COW_TO_ISO.get(int(r[c_cc])) if pd.notna(r[c_cc]) else None
                    if iso in IN_SCOPE:
                        rows.append({"country": iso, "year": 1945 + int(r[c_sess]), "indicator": "unga_ideal_point", "indicator_name": "UNGA ideal point (Bailey-Strezhnev-Voeten)", "value": r[c_ip], "source_record_url": meta.get("url")})
            elif "agreementscores" in low:
                c1 = col(df, "ccode1")
                c2 = col(df, "ccode2")
                c_sess = col(df, "session")
                c_dist = col(df, "IdealPointDistance", required=False)
                c_agree = col(df, "agree", required=False)
                sub = df[df[c1].isin([2, 710]) | df[c2].isin([2, 710])]
                for _, r in sub.iterrows():
                    a, b = int(r[c1]), int(r[c2])
                    pole = "USA" if 2 in (a, b) else "CHN"
                    other = b if COW_TO_ISO.get(a) == pole else a
                    iso = COW_TO_ISO.get(other)
                    if iso not in IN_SCOPE:
                        continue
                    year = 1945 + int(r[c_sess])
                    if c_dist and pd.notna(r[c_dist]):
                        rows.append({"country": iso, "year": year, "indicator": f"unga_ideal_distance_{pole}", "indicator_name": f"UNGA ideal-point distance to {'United States' if pole == 'USA' else 'China'}", "value": r[c_dist], "source_record_url": meta.get("url")})
                    if c_agree and pd.notna(r[c_agree]):
                        rows.append({"country": iso, "year": year, "indicator": f"unga_agreement_{pole}", "indicator_name": f"UNGA voting agreement with {'United States' if pole == 'USA' else 'China'}", "value": r[c_agree], "source_record_url": meta.get("url")})
        df = pd.DataFrame(rows, columns=["country", "year", "indicator", "indicator_name", "value", "source_record_url"])
        df = df[df["year"] >= 2000] if not df.empty else df
        df["value_type"] = "reported"
        return {"governance": self.stamp(snap, df)}
