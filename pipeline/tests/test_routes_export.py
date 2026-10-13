from __future__ import annotations

from scm.routes_export import routes_file


def row(rep, par, mineral, year, flow, v, vt="reconciled"):
    return {"reporter": rep, "partner": par, "mineral": mineral, "year": year, "flow": flow, "value_type": vt, "value_usd": v, "source_id": "cepii_baci"}


ROWS = [
    # Chile's copper exports by destination, with the world total
    row("CHL", "CHN", "copper", 2020, "X", 1.0e9), row("CHL", "USA", "copper", 2020, "X", 5.0e8), row("CHL", "CAN", "copper", 2020, "X", 8.0e8), row("CHL", "DEU", "copper", 2020, "X", 3.0e8), row("CHL", "WLD", "copper", 2020, "X", 2.6e9),
    # Peru's copper and lithium exports (no world total for lithium, so lithium has no ranking tail)
    row("PER", "CHN", "copper", 2020, "X", 4.0e8), row("PER", "WLD", "copper", 2020, "X", 4.0e8), row("PER", "USA", "lithium", 2020, "X", 1.0e7),
    # the United States' copper imports by origin
    row("USA", "CHL", "copper", 2020, "M", 5.0e8), row("USA", "CAN", "copper", 2020, "M", 9.0e8), row("USA", "JPN", "copper", 2020, "M", 7.0e7), row("USA", "WLD", "copper", 2020, "M", 1.47e9),
    # Canada, the intermediary: imports from the region against the world, exports to the buyers against the world
    row("CAN", "CHL", "copper", 2020, "M", 8.0e8), row("CAN", "WLD", "copper", 2020, "M", 8.5e8), row("CAN", "USA", "copper", 2020, "X", 9.0e8), row("CAN", "WLD", "copper", 2020, "X", 1.0e9),
    # a reported Comtrade row is not read
    row("CHL", "CHN", "copper", 2020, "X", 9.9e9, vt="reported"),
]


def test_routes_file_builds_the_three_views_from_the_reconciled_rows_only():
    f = routes_file(ROWS, "2026-10-13")
    assert f["value_type"] == "reconciled" and f["source_id"] == "cepii_baci" and f["years"] == [2020] and f["minerals"] == ["all", "copper", "lithium"]
    usa = {o["origin"]: o for o in f["origins"] if o["buyer"] == "USA" and o["mineral"] == "copper"}
    assert usa["CHL"]["musd"] == 500.0 and usa["CHL"]["in_scope"] and usa["CAN"]["musd"] == 900.0 and not usa["CAN"]["in_scope"]
    assert usa["ROW"]["musd"] == 0.0 and usa["WLD"]["musd"] == 1470.0
    assert [o["origin"] for o in f["origins"] if o["buyer"] == "USA" and o["mineral"] == "all"] == ["CAN", "CHL", "JPN", "ROW", "WLD"]
    dest = {d["dest"]: d for d in f["destinations"] if d["mineral"] == "copper"}
    assert dest["CHN"]["musd"] == 1400.0 and dest["CHN"]["buyer"] and dest["CHN"]["n"] == 2 and dest["CAN"]["musd"] == 800.0 and dest["WLD"]["musd"] == 3000.0 and dest["ROW"]["musd"] == 0.0
    lithium = [d["dest"] for d in f["destinations"] if d["mineral"] == "lithium"]
    assert lithium == ["USA"]  # no world total, so no rest-of-world and no world cell
    chl = {d["dest"]: d["musd"] for d in f["country_destinations"] if d["iso3"] == "CHL"}
    assert chl == {"CHN": 1000.0, "CAN": 800.0, "USA": 500.0, "DEU": 300.0, "ROW": 0.0, "WLD": 2600.0}
    can = next(c for c in f["via"] if c["iso3"] == "CAN" and c["mineral"] == "copper")
    assert can["from_region_musd"] == 800.0 and can["imports_wld_musd"] == 850.0 and can["to_US_musd"] == 900.0 and can["to_CN_musd"] is None and can["exports_wld_musd"] == 1000.0 and can["from"] == {"CHL": 800.0}
    assert f["intermediaries"] == ["CAN"]
    assert routes_file([], "2026-10-13")["origins"] == [] and routes_file([], "2026-10-13")["intermediaries"] == []
