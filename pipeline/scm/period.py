"""The period the project covers: one constant that every adapter, the index and the exports read (DECISIONS 73).

The site and the pipeline used to start in 2008 in eight separate places. Set SCM_PERIOD_FROM to move the start for a
local run; the committed default is the project's period. Sources that do not reach back that far keep their own first
year, and the gap is shown as missing on the site, never as zero.
"""

from __future__ import annotations

import os
from datetime import date

PERIOD_FROM = int(os.environ.get("SCM_PERIOD_FROM", "2000"))


def congress_of(year: int) -> int:
    """The US Congress sitting in the given year (the 106th sat in 1999–2000, the 110th in 2007–2008)."""
    return (year - 1789) // 2 + 1


def period(today: str | date | None = None, data_from: int | None = None) -> dict:
    """The exported period block: the project's period and the first year the trade record actually holds.

    "from" is the period the project covers; "data_from" is the first year with a reported trade row at or after it
    (the site's axes and sliders start there, so a backfill that has not landed yet does not open an empty band)."""
    return {"from": PERIOD_FROM, "data_from": max(PERIOD_FROM, data_from) if data_from else PERIOD_FROM, "to": int(str(today or date.today())[:4])}


def data_from(trade_rows: list[dict]) -> int | None:
    """The earliest trade year at or after PERIOD_FROM in the exported trade rows, or None when there are none."""
    years = [int(r["year"]) for r in trade_rows if r.get("year") is not None and int(r["year"]) >= PERIOD_FROM]
    return min(years) if years else None
