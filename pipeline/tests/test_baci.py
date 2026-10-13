from __future__ import annotations

import io

import pandas as pd

from scm.ingest.baci import BACI, _country_map, _stream_slice, intermediaries, slice_year


def test_slice_keeps_tracked_products_and_countries_only():
    text = "t,i,j,k,v,q\n2020,152,156,260300,1000.5,20\n2020,152,842,260300,10,1\n2020,152,156,999999,5,1\n2020,4,8,260300,7,1\n"
    rows = slice_year(text, {152, 842, 156}, {"260300"})
    assert [(r["i"], r["j"], r["k"]) for r in rows] == [(152, 156, "260300"), (152, 842, "260300")]
    assert [(r["i"], r["j"]) for r in slice_year(text, None, {"260300"})] == [(152, 156), (152, 842), (4, 8)]
    assert _country_map("country_code,country_name,country_iso2,country_iso3\n152,Chile,CL,CHL\n156,China,CN,CHN\n") == {152: "CHL", 156: "CHN"}
    out = io.StringIO()
    assert _stream_slice(io.BytesIO(text.encode()), {"260300"}, out) == 3
    assert out.getvalue().splitlines() == ["t,i,j,k,v,q", "2020,152,156,260300,1000.5,20", "2020,152,842,260300,10,1", "2020,4,8,260300,7,1"]


CODES = {"152": "CHL", "156": "CHN", "842": "USA", "276": "DEU", "124": "CAN", "392": "JPN"}
ROWS = [
    {"t": 2020, "i": 152, "j": 156, "k": "260300", "v": "1000", "q": "20"},   # Chile -> China, US$1.0 m
    {"t": 2020, "i": 152, "j": 842, "k": "260300", "v": "500", "q": "10"},    # Chile -> United States
    {"t": 2020, "i": 152, "j": 276, "k": "260300", "v": "300", "q": "6"},     # Chile -> Germany
    {"t": 2020, "i": 152, "j": 124, "k": "260300", "v": "800", "q": "16"},    # Chile -> Canada (the largest third-country destination)
    {"t": 2020, "i": 156, "j": 152, "k": "283691", "v": "40", "q": "NA"},     # China -> Chile: Chile's import
    {"t": 2020, "i": 124, "j": 842, "k": "260300", "v": "900", "q": "18"},    # Canada -> United States: the indirect leg
    {"t": 2020, "i": 124, "j": 392, "k": "260300", "v": "100", "q": "2"},     # Canada -> Japan: only in Canada's world total
    {"t": 2020, "i": 276, "j": 124, "k": "260300", "v": "50", "q": "1"},      # Germany -> Canada: only in Canada's import total
    {"t": 2020, "i": 392, "j": 842, "k": "260300", "v": "70", "q": "1"},      # Japan -> United States: a US origin outside the region
]


def test_intermediaries_rank_the_third_country_destinations_of_the_twenty():
    codes = {int(k): v for k, v in CODES.items()}
    df = pd.DataFrame(ROWS)
    df["v"] = pd.to_numeric(df["v"])
    assert intermediaries([df], codes, top=5) == ["CAN", "DEU"]
    assert intermediaries([df], codes, top=1) == ["CAN"]


def test_parse_builds_the_three_views_and_world_totals(snap_factory):
    csv_text = "t,i,j,k,v,q\n" + "\n".join(f"{r['t']},{r['i']},{r['j']},{r['k']},{r['v']},{r['q']}" for r in ROWS) + "\n"
    snap = snap_factory("cepii_baci", {"country_codes.json": CODES, "baci_2020.csv": csv_text})
    out = BACI().parse(snap)["trade_flow"]
    assert (out["value_type"] == "reconciled").all() and (out["reported_by"] == "BCI").all()
    # the twenty as exporters: every destination, and the world total over all of them
    chl_x = out[(out["reporter"] == "CHL") & (out["flow"] == "X")].set_index("partner")
    assert chl_x.loc["CHN", "value_usd"] == 1_000_000.0 and chl_x.loc["USA", "value_usd"] == 500_000.0
    assert chl_x.loc["DEU", "value_usd"] == 300_000.0 and chl_x.loc["CAN", "value_usd"] == 800_000.0
    assert chl_x.loc["WLD", "value_usd"] == 2_600_000.0
    # the twenty as importers: China, the United States and the world only
    chl_m = out[(out["reporter"] == "CHL") & (out["flow"] == "M")].set_index("partner")
    assert list(chl_m.index) == ["CHN", "WLD"] and chl_m.loc["CHN", "value_usd"] == 40_000.0 and chl_m.loc["CHN", "mineral"] == "lithium"
    assert chl_m.loc["CHN", "qty"] != chl_m.loc["CHN", "qty"] and chl_m.loc["CHN", "qty_unit"] is None  # NaN quantity stays absent
    # the United States as an importer: every origin, direct and indirect, and the world total
    usa_m = out[(out["reporter"] == "USA") & (out["flow"] == "M")].set_index("partner")
    assert usa_m.loc["CHL", "value_usd"] == 500_000.0 and usa_m.loc["CAN", "value_usd"] == 900_000.0 and usa_m.loc["JPN", "value_usd"] == 70_000.0
    assert usa_m.loc["WLD", "value_usd"] == 1_470_000.0
    assert not ((out["reporter"] == "USA") & (out["flow"] == "X")).any()
    # the intermediary: imports from the region against its world imports, exports to the two buyers against its world exports
    can_m = out[(out["reporter"] == "CAN") & (out["flow"] == "M")].set_index("partner")
    assert list(can_m.index) == ["CHL", "WLD"] and can_m.loc["CHL", "value_usd"] == 800_000.0 and can_m.loc["WLD", "value_usd"] == 850_000.0
    can_x = out[(out["reporter"] == "CAN") & (out["flow"] == "X")].set_index("partner")
    assert list(can_x.index) == ["USA", "WLD"] and can_x.loc["USA", "value_usd"] == 900_000.0 and can_x.loc["WLD", "value_usd"] == 1_000_000.0
    # Japan takes none of the region's exports, so it is no intermediary: only its sale to the United States appears, on the US side
    assert not (out["reporter"] == "JPN").any()
    # China's own exports are not a reporter row
    assert not ((out["reporter"] == "CHN") & (out["flow"] == "X")).any()


def test_parse_reads_the_json_slices_of_the_first_release(snap_factory):
    snap = snap_factory("cepii_baci", {"country_codes.json": CODES, "baci_2020.json": ROWS[:2]})
    out = BACI().parse(snap)["trade_flow"]
    chl_x = out[(out["reporter"] == "CHL") & (out["flow"] == "X")].set_index("partner")
    assert chl_x.loc["WLD", "value_usd"] == 1_500_000.0 and chl_x.loc["WLD", "qty"] == 30.0
