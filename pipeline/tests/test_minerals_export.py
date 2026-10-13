from __future__ import annotations

from scm import minerals_export as me


def test_mineral_trade_keeps_absent_partner_cells_null_and_shares_over_the_world_row():
    trade = [
        {"reporter": "CHL", "partner": "CHN", "mineral": "copper", "year": 2024, "flow": "X", "value_type": "reported", "value_usd": 2e9, "source_id": "un_comtrade"},
        {"reporter": "CHL", "partner": "WLD", "mineral": "copper", "year": 2024, "flow": "X", "value_type": "reported", "value_usd": 4e9, "source_id": "un_comtrade"},
        {"reporter": "CHL", "partner": "USA", "mineral": "copper", "year": 2024, "flow": "X", "value_type": "mirror", "value_usd": 1e9, "source_id": "un_comtrade"},  # a mirror row never fills the reporter's cell
        {"reporter": "PER", "partner": "WLD", "mineral": "copper", "year": 2023, "flow": "M", "value_type": "reported", "value_usd": 5e6, "source_id": "un_comtrade"},
        {"reporter": "CHL", "partner": "CHN", "mineral": "lithium", "year": 2024, "flow": "X", "value_type": "reported", "value_usd": 1e9, "source_id": "un_comtrade"},
        {"reporter": "ZZZ", "partner": "CHN", "mineral": "copper", "year": 2024, "flow": "X", "value_type": "reported", "value_usd": 1e9, "source_id": "un_comtrade"},
    ]
    rows = me.mineral_trade(trade, "copper")
    assert [(r["iso3"], r["year"], r["flow"]) for r in rows] == [("CHL", 2024, "X"), ("PER", 2023, "M")]
    assert rows[0]["musd"] == {"CN": 2000.0, "US": None, "WLD": 4000.0}
    m = {"id": "copper", "name": "Copper", "core": True, "on_us_list": True, "on_cn_list": True, "in_region": ["CHL", "PER"], "note": "n", "uses": "u", "why_it_matters": "w", "uses_source": "s"}
    prod = [{"country": "CHL", "mineral": "copper", "measure": "production", "year": 2024, "qty": 5.3e6, "unit": "tonnes", "note": None, "source_id": "usgs_mcs", "source_record_url": "https://x"},
            {"country": "PER", "mineral": "copper", "measure": "production", "year": 2024, "qty": 0.0, "unit": "tonnes", "note": None, "source_id": "usgs_mcs", "source_record_url": None}]
    conc = [{"concession_id": "c1", "country": "COL", "title": "t", "holder": "h", "minerals": "gold, copper", "mineral": "gold", "status": "granted", "granted_year": 2015, "area_ha": 10.0, "lat": 4.5, "lon": -74.1, "source_id": "col_anm", "source_record_url": None}]
    idx = [{"country": "CHL", "year": 2024, "actor": "CN", "mineral": "copper", "index_name": "influence", "value": 55.5, "n_components": 4}, {"country": "CHL", "year": 2024, "actor": "CN", "mineral": "all", "index_name": "influence", "value": 50.0, "n_components": 4}]
    f = me.mineral_file(m, trade, prod, [], conc, idx, "2026-10-13")
    assert f["importance"] == [{"iso3": "CHL", "name": "Chile", "year": 2024, "exports_musd": 4000.0, "share_cn": 0.5, "share_us": None}]
    assert f["producers"] == ["CHL"] and f["concessions"][0]["id"] == "c1" and f["index"] == [{"iso3": "CHL", "year": 2024, "actor": "CN", "value": 55.5, "n_components": 4}]
    assert any(h["hs6"] for h in f["hs_codes"]) and f["uses"] == "u"
    idx_file = me.minerals_index([f], "2026-10-13")
    assert idx_file["minerals"][0]["top_exporters"][0]["iso3"] == "CHL" and idx_file["minerals"][0]["n_trade_rows"] == 2
