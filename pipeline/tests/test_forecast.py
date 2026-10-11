"""Forecasts to 2030 and absent partner cells: a share that is 0 only because the partner row is absent is never an observation,
the fitted series is the latest unbroken run of reported years, and every country left out is listed with the reason."""
from __future__ import annotations

import numpy as np
import pandas as pd

from scm.quant import forecast as fc


def _shares(iso, years, cn, absent_cn=(), us=0.1):
    return [{"country": iso, "year": y, "share_us": us, "share_cn": 0.0 if y in absent_cn else cn(i), "absent_us": False, "absent_cn": y in absent_cn} for i, y in enumerate(years)]


def test_skip_reason_names_the_run_and_the_absent_years():
    assert fc.skip_reason(np.array([], dtype=int), 17) == "no reported observation; 17 years with no partner row left out (absent, not zero)"
    assert fc.skip_reason(np.array([2012]), 17) == "1 reported year in the latest unbroken run (2012), fewer than 8; 17 years with no partner row left out (absent, not zero)"
    assert fc.skip_reason(np.arange(2016, 2021), 1) == "5 reported years in the latest unbroken run (2016–2020), fewer than 8; 1 year with no partner row left out (absent, not zero)"
    assert fc.skip_reason(np.arange(2010, 2020)) == "last reported year 2019, before 2023"
    assert fc.skip_reason(np.arange(2016, 2026), 4) is None


def test_absent_partner_cells_are_never_fitted_and_are_said():
    years = list(range(2008, 2026))
    rows = _shares("CHL", years, lambda i: 0.3 + 0.015 * i) + _shares("PER", years, lambda i: 0.4 + 0.01 * i)
    # Suriname-like: no China row in any year but 2012 (a reported 0); Guyana-like: no China row in 2008, 2009, 2011 and 2013
    rows += _shares("SUR", years, lambda i: 0.0, absent_cn=[y for y in years if y != 2012])
    rows += _shares("GUY", years, lambda i: 0.2 + 0.01 * i, absent_cn=(2008, 2009, 2011, 2013))
    shares = pd.DataFrame(rows)
    idx = pd.DataFrame(columns=["country", "year", "actor", "mineral", "index_name", "value"])
    out, _, status = fc.forecasts(idx, shares, seed=1, n_sims=200, n_backtest=50)
    cn = status["targets"]["export_share:CN"]
    assert cn["countries"] == ["CHL", "GUY", "PER"] and "SUR" not in set(out[out["actor"] == "CN"]["country"])
    assert cn["skipped"] == {"SUR": "1 reported year in the latest unbroken run (2012), fewer than 8; 17 years with no partner row left out (absent, not zero)"}
    assert cn["windows"]["GUY"] == {"years": [2014, 2025], "n_obs": 12, "n_absent": 4} and cn["windows"]["CHL"] == {"years": [2008, 2025], "n_obs": 18, "n_absent": 0}
    guy = out[(out["country"] == "GUY") & (out["actor"] == "CN") & (out["scenario_id"] == "baseline")]
    assert (guy["last_observed_year"] == 2025).all() and guy["point"].between(0.3, 0.6).all()  # fitted on the reported 2014–2025 run (26%–37%), never on the zeros
    # the US share is reported everywhere: Suriname is fitted for it
    assert "SUR" in status["targets"]["export_share:US"]["countries"] and status["targets"]["export_share:US"]["skipped"] == {}
    assert status["targets"]["influence_index:CN"] == {"countries": [], "model": None, "note": "no series long enough", "windows": {}, "skipped": {}}
    # a frame without the flags (an older caller) still runs, reading every cell as reported
    _, _, status2 = fc.forecasts(idx, shares.drop(columns=["absent_us", "absent_cn"]), seed=1, n_sims=200, n_backtest=50)
    assert status2["targets"]["export_share:CN"]["countries"] == ["CHL", "GUY", "PER", "SUR"]


def test_the_fitted_series_is_the_latest_unbroken_run():
    years = [y for y in range(2004, 2026) if y != 2013]  # a year with no reported row at all: the run before it is left out
    rows = [{"country": iso, "year": y, "share_us": 0.1, "share_cn": 0.2 + 0.01 * i} for iso in ("CHL", "PER", "ARG") for i, y in enumerate(years)]
    rows += [{"country": "BOL", "year": y, "share_us": 0.1, "share_cn": 0.3} for y in range(2004, 2020)]  # long, unbroken, not current
    out, _, status = fc.forecasts(pd.DataFrame(columns=["country", "year", "actor", "mineral", "index_name", "value"]), pd.DataFrame(rows), seed=1, n_sims=200, n_backtest=50)
    cn = status["targets"]["export_share:CN"]
    assert cn["countries"] == ["ARG", "CHL", "PER"] and cn["windows"]["CHL"] == {"years": [2014, 2025], "n_obs": 12, "n_absent": 0}
    assert cn["skipped"] == {"BOL": "last reported year 2019, before 2023"}
    assert (out["last_observed_year"] == 2025).all() and (out["country"] != "BOL").all()
