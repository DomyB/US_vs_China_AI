from __future__ import annotations

from scm.ingest.imf_dip import IMFDIP, parse_sdmx_json

PAYLOAD = {"meta": {}, "data": {
    "dataSets": [{"structure": 0, "action": "Replace", "series": {
        "0:0:0:0:0": {"attributes": [0, None, None], "observations": {"0": ["1500000000", None, 0, None, None], "2": ["1800000000", None, 0, None, None]}},
        "0:1:0:0:0": {"attributes": [0, None, None], "observations": {"1": ["900000000", None, 1, None, None], "2": [None, None, 1, "C", {"en": "C"}]}},
    }}],
    "structures": [{"dataSets": [0], "dimensions": {
        "series": [{"id": "COUNTRY", "keyPosition": 0, "values": [{"id": "CHL", "name": "Chile"}]},
                   {"id": "DV_TYPE", "keyPosition": 1, "values": [{"id": "O"}, {"id": "SCC"}]},
                   {"id": "INDICATOR", "keyPosition": 2, "values": [{"id": "INWD_D_NETLA_FALL_ALL"}]},
                   {"id": "COUNTERPART_COUNTRY", "keyPosition": 3, "values": [{"id": "CHN"}]},
                   {"id": "FREQUENCY", "keyPosition": 4, "values": [{"id": "A"}]}],
        "observation": [{"id": "TIME_PERIOD", "keyPosition": 5, "values": [{"value": "2021"}, {"value": "2022"}, {"value": "2023"}]}]}}],
}}


def test_sdmx_json_rows_carry_their_codes_and_periods():
    rows = parse_sdmx_json(PAYLOAD)
    assert [(r["dims"]["DV_TYPE"], r["period"], r["value"]) for r in rows] == [("O", "2021", "1500000000"), ("O", "2023", "1800000000"), ("SCC", "2022", "900000000")]


def test_parse_keeps_both_bases_and_never_fills_a_missing_year(snap_factory):
    snap = snap_factory("imf_dip", {"CHL_CHN_INWD_D_NETLA_FALL_ALL.json": PAYLOAD, "broken.json": "not json"})
    df = IMFDIP().parse(snap)["investment_position"]
    assert len(df) == 3 and set(df["basis"]) == {"reported", "derived"} and (df["counterpart"] == "CHN").all() and (df["direction"] == "inward").all()
    rep = df[df["basis"] == "reported"].set_index("year")["value_usd"]
    assert rep.to_dict() == {2021: 1.5e9, 2023: 1.8e9} and 2022 not in rep.index
