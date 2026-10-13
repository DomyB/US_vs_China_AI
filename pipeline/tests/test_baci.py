from __future__ import annotations

from scm.ingest.baci import BACI, _country_map, slice_year


def test_slice_keeps_tracked_products_and_countries_only():
    text = "t,i,j,k,v,q\n2020,152,156,260300,1000.5,20\n2020,152,842,260300,10,1\n2020,152,156,999999,5,1\n2020,4,8,260300,7,1\n"
    rows = slice_year(text, {152, 842, 156}, {"260300"})
    assert [(r["i"], r["j"], r["k"]) for r in rows] == [(152, 156, "260300"), (152, 842, "260300")]
    assert _country_map("country_code,country_name,country_iso2,country_iso3\n152,Chile,CL,CHL\n156,China,CN,CHN\n") == {152: "CHL", 156: "CHN"}


def test_parse_builds_exports_imports_and_a_world_total(snap_factory):
    snap = snap_factory("cepii_baci", {
        "country_codes.json": {"152": "CHL", "156": "CHN", "842": "USA", "276": "DEU"},
        "baci_2020.json": [
            {"t": 2020, "i": 152, "j": 156, "k": "260300", "v": "1000", "q": "20"},   # Chile -> China, US$1.0 m
            {"t": 2020, "i": 152, "j": 842, "k": "260300", "v": "500", "q": "10"},    # Chile -> United States
            {"t": 2020, "i": 152, "j": 276, "k": "260300", "v": "300", "q": "6"},     # Chile -> Germany: only in the world total
            {"t": 2020, "i": 156, "j": 152, "k": "283691", "v": "40", "q": "NA"},     # China -> Chile: Chile's import
        ],
    })
    out = BACI().parse(snap)["trade_flow"]
    chl_x = out[(out["reporter"] == "CHL") & (out["flow"] == "X")].set_index("partner")
    assert chl_x.loc["CHN", "value_usd"] == 1_000_000.0 and chl_x.loc["USA", "value_usd"] == 500_000.0 and chl_x.loc["WLD", "value_usd"] == 1_800_000.0
    assert "DEU" not in chl_x.index and (out["value_type"] == "reconciled").all() and (out["reported_by"] == "BCI").all()
    chl_m = out[(out["reporter"] == "CHL") & (out["flow"] == "M")].set_index("partner")
    assert chl_m.loc["CHN", "value_usd"] == 40_000.0 and chl_m.loc["CHN", "mineral"] == "lithium" and chl_m.loc["CHN", "qty"] != chl_m.loc["CHN", "qty"]  # NaN quantity stays absent
    assert chl_m.loc["WLD", "value_usd"] == 40_000.0
    # China's own exports are not a reporter row (China is a partner, not a country in scope)
    assert not (out["reporter"] == "CHN").any()
