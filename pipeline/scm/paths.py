from __future__ import annotations

import os
from pathlib import Path

PIPELINE_DIR = Path(__file__).resolve().parents[1]
ROOT = PIPELINE_DIR.parent
CONFIG_DIR = PIPELINE_DIR / "config"
DATA_DIR = Path(os.environ.get("SCM_DATA_DIR", ROOT / "data"))
RAW_DIR = DATA_DIR / "raw"
WAREHOUSE_DIR = DATA_DIR / "warehouse"
SITE_DATA_DIR = ROOT / "web" / "public" / "data"
REAL_SITE_DIR = SITE_DATA_DIR / "real"
LIVENESS_FILE = DATA_DIR / "liveness.json"
