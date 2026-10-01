"""Parser tests on synthetic fixtures written in each source's documented format.

These exercise parse() -> schema validation without any network access. The first
live run in GitHub Actions records trimmed real responses (python -m scm fixtures)
which then replace these synthetic payloads.
"""
from __future__ import annotations

import pandas as pd
import pytest

from scm import schema
from scm.ingest import ADAPTERS
from scm.ingest.aei_cgit import CGIT
from scm.ingest.aiddata import AidData
from scm.ingest.bgs import BGS
from scm.ingest.comtrade import Comtrade
from scm.ingest.dfc import DFC
from scm.ingest.dpi import DPI
from scm.ingest.exim import EXIM
from scm.ingest.federal_register import FederalRegister
from scm.ingest.pink_sheet import PinkSheet
from scm.ingest.resourcecontracts import ResourceContracts
from scm.ingest.tier2 import BUCODF, CensusTrade, CongressGov
from scm.ingest.unga import UNGA
from scm.ingest.usgs_mcs import USGSMCS
from scm.ingest.worldbank import IDS, WDI, WGI


def _check(adapter, snap, expected_tables):
    out = adapter.parse(snap)
    assert set(out) == set(expected_tables)
    for name, df in out.items():
        validated = schema.validate(name, df.copy())
        assert len(validated) == len(df)
        if len(df):
            assert (df["source_id"] == adapter.source_id).all()
            assert df["retrieved_at"].notna().all()
    return out


def test_every_tier1_adapter_has_a_registry_entry():
    for sid, cls in ADAPTERS.items():
        assert cls().src.id == sid


def test_worldbank_wdi_and_wgi(snap_factory):
    payload = [{"page": 1}, [
        {"indicator": {"id": "NY.GDP.MKTP.CD", "value": "GDP"}, "country": {"id": "AR", "value": "Argentina"}, "countryiso3code": "ARG", "date": "2022", "value": 6.3e11},
        {"indicator": {"id": "NY.GDP.MKTP.CD", "value": "GDP"}, "country": {"id": "ZZ", "value": "Nowhere"}, "countryiso3code": "ZZZ", "date": "2022", "value": 1},
    ]]
    snap = snap_factory("wb_wdi", {"NY.GDP.MKTP.CD.json": payload})
    out = _check(WDI(), snap, ["governance"])
    assert out["governance"].iloc[0]["country"] == "ARG"
    assert len(out["governance"]) == 1
    wgi = {"source": {"data": [{"variable": [{"concept": "Country", "id": "CHL", "value": "Chile"}, {"concept": "Series", "id": "CC.EST"}, {"concept": "Time", "id": "YR2021", "value": "2021"}], "value": 1.02}]}}
    snap = snap_factory("wb_wgi", {"CC.EST.json": wgi})
    out = _check(WGI(), snap, ["governance"])
    assert out["governance"].iloc[0]["indicator"] == "CC.EST" and out["governance"].iloc[0]["year"] == 2021


def test_worldbank_ids_advanced_api(snap_factory):
    payload = {"source": {"data": [
        {"variable": [{"concept": "Country", "id": "ECU", "value": "Ecuador"}, {"concept": "Series", "id": "DT.DOD.DPPG.CD"}, {"concept": "Counterpart-Area", "id": "730", "value": "China"}, {"concept": "Time", "id": "YR2020", "value": "2020"}], "value": 5.1e9},
    ]}}
    snap = snap_factory("wb_ids", {"DT.DOD.DPPG.CD_730.json": payload})
    out = _check(IDS(), snap, ["governance"])
    row = out["governance"].iloc[0]
    assert row["country"] == "ECU" and row["year"] == 2020 and "China" in row["indicator_name"]


def test_comtrade_reported_and_mirror(snap_factory):
    rep = {"count": 2, "data": [
        {"reporterCode": 32, "partnerCode": 156, "cmdCode": "283691", "flowCode": "X", "refYear": 2022, "primaryValue": 1000000.0, "netWgt": 100.0},
        {"reporterCode": 32, "partnerCode": 0, "cmdCode": "283691", "flowCode": "X", "refYear": 2022, "primaryValue": 3000000.0, "netWgt": 300.0},
    ]}
    mirror = {"count": 1, "data": [{"reporterCode": 156, "partnerCode": 32, "cmdCode": "283691", "flowCode": "M", "refYear": 2022, "primaryValue": 1200000.0, "netWgt": 110.0}]}
    snap = snap_factory("un_comtrade", {"rep_ARG_2022.json": rep, "mirror_CHN_2022_0.json": mirror})
    out = _check(Comtrade(years=[2022]), snap, ["trade_flow"])
    df = out["trade_flow"]
    assert set(df["value_type"]) == {"reported", "mirror"}
    m = df[df["value_type"] == "mirror"].iloc[0]
    assert m["reporter"] == "ARG" and m["partner"] == "CHN" and m["flow"] == "X" and m["reported_by"] == "CHN"
    assert (df["mineral"] == "lithium").all()


def test_pink_sheet(snap_factory):
    def write(p):
        rows = [["", "Crude oil, average", "Copper", "Nickel", "Tin"], ["", "($/bbl)", "($/mt)", "($/mt)", "($/mt)"], ["2022M01", 80, 9000, 20000, 40000], ["2022M02", 85, 9500, 21000, 41000]]
        with pd.ExcelWriter(p) as w:
            pd.DataFrame(rows).to_excel(w, sheet_name="Monthly Prices", header=False, index=False)

    snap = snap_factory("wb_pink_sheet", {"CMO-Historical-Data-Monthly.xlsx": write})
    out = _check(PinkSheet(), snap, ["price"])
    df = out["price"]
    assert set(df["mineral"]) == {"copper", "nickel", "tin"}
    assert df[(df["mineral"] == "copper") & (df["month"] == 2)].iloc[0]["price"] == 9500


def test_aiddata(snap_factory):
    def write(p):
        df = pd.DataFrame({
            "AidData Record ID": [1, 2], "Recommended For Aggregates": ["Yes", "No"], "Recipient": ["Ecuador", "France"],
            "Commitment Year": [2016, 2016], "Title": ["Mirador copper mine loan", "x"], "Description": ["Loan for the Mirador mine", "y"],
            "Sector Name": ["INDUSTRY, MINING, CONSTRUCTION", "OTHER"], "Flow Type": ["Loan", "Grant"], "Funding Agencies": ["China Development Bank", "z"],
            "Amount (Nominal USD)": [1.5e9, 1.0], "Commitment Date (MM/DD/YYYY)": ["03/01/2016", None], "Source URLs": ["https://a.test;https://b.test", None],
        })
        with pd.ExcelWriter(p) as w:
            df.to_excel(w, sheet_name="GCDF_3.0", index=False)

    snap = snap_factory("aiddata_gcdf", {"gcdf.xlsx": write})
    out = _check(AidData(), snap, ["finance_event"])
    df = out["finance_event"]
    assert len(df) == 1 and df.iloc[0]["country"] == "ECU" and df.iloc[0]["mineral"] == "copper" and df.iloc[0]["actor_from_origin"] == "CN"
    assert df.iloc[0]["source_record_url"] == "https://a.test"


def test_cgit(snap_factory):
    def write(p):
        inv = pd.DataFrame({"Year": [2018, 2018], "Month": [12, 5], "Investor": ["Tianqi", "Someone"], "Quantity in Millions": [4070, 10], "Share Size": ["24%", None], "Transaction Party": ["SQM", "x"], "Sector": ["Metals", "Energy"], "Subsector": ["Lithium", None], "Country": ["Chile", "Germany"]})
        with pd.ExcelWriter(p) as w:
            inv.to_excel(w, sheet_name="Dataset 1+2", index=False)

    snap = snap_factory("aei_cgit", {"cgit.xlsx": write})
    out = _check(CGIT(), snap, ["deal_event"])
    df = out["deal_event"]
    assert len(df) == 1 and df.iloc[0]["country"] == "CHL" and df.iloc[0]["amount_usd"] == 4070e6 and df.iloc[0]["mineral"] == "lithium"


def test_dfc_and_exim(snap_factory):
    def write(p):
        df = pd.DataFrame({"Project Name": ["Lithium project", "Other"], "Country": ["Argentina", "Kenya"], "Fiscal Year": ["FY2024", "FY2024"], "Committed Amount": ["$50,000,000", "1"], "Project Type": ["Loan", "Loan"], "Sector": ["Mining", "Energy"], "Project Description": ["Lithium brine", "x"]})
        with pd.ExcelWriter(p) as w:
            df.to_excel(w, sheet_name="Active Projects", index=False)

    snap = snap_factory("dfc_projects", {"dfc.xlsx": write})
    out = _check(DFC(), snap, ["finance_event"])
    assert out["finance_event"].iloc[0]["amount_usd"] == 5e7 and out["finance_event"].iloc[0]["actor_from_origin"] == "US"
    csv = "Fiscal Year,Primary Export Market,Approved Amount,Primary Export Product,Primary Borrower,Primary Exporter,Program\n2015,Brazil,1200000,Mining equipment,Vale,Caterpillar,Loan Guarantee\n2015,Mexico,5,Other,x,y,z\n"
    snap = snap_factory("exim_authorizations", {"exim.csv": csv})
    out = _check(EXIM(), snap, ["finance_event"])
    assert len(out["finance_event"]) == 1 and out["finance_event"].iloc[0]["country"] == "BRA"


def test_federal_register_dedup_across_queries(snap_factory):
    doc = {"document_number": "2025-05212", "title": "Immediate Measures to Increase American Mineral Production", "type": "Presidential Document", "abstract": "x", "publication_date": "2025-03-25", "html_url": "https://www.federalregister.gov/d/2025-05212", "agencies": [{"name": "Executive Office of the President"}]}
    snap = snap_factory("federal_register", {"critical_minerals_p1.json": {"results": [doc]}, "lithium_p1.json": {"results": [doc]}})
    out = _check(FederalRegister(), snap, ["policy_document"])
    df = out["policy_document"]
    assert len(df) == 1 and "critical_minerals" in df.iloc[0]["topics"] and "lithium" in df.iloc[0]["topics"]


def test_resourcecontracts(snap_factory):
    payload = {"total": 1, "results": [{"id": 1234, "open_contracting_id": "ocds-591adf-PE1234", "name": "Contrato minero X", "country": {"code": "pe", "name": "Peru"}, "signature_year": "2014", "resource": ["Copper"], "company": [{"name": "Minera ABC"}], "contract_type": ["Concession"], "language": "es"}]}
    snap = snap_factory("resourcecontracts", {"PER_p1.json": payload})
    out = _check(ResourceContracts(), snap, ["contract"])
    r = out["contract"].iloc[0]
    assert r["country"] == "PER" and r["mineral"] == "copper" and r["signature_year"] == 2014


def test_unga(snap_factory):
    ideal = "ccode,session,IdealPointAll\n160,75,-0.5\n2,75,2.1\n"
    agree = "ccode1,ccode2,session,agree,IdealPointDistance\n2,160,75,0.3,2.6\n160,710,75,0.8,0.4\n"
    snap = snap_factory("unga_votes", {"files/IdealpointestimatesAll.csv": ideal, "files/AgreementScoresAll.csv": agree})
    out = _check(UNGA(), snap, ["governance"])
    df = out["governance"]
    assert set(df["indicator"]) == {"unga_ideal_point", "unga_ideal_distance_USA", "unga_agreement_USA", "unga_ideal_distance_CHN", "unga_agreement_CHN"}
    assert (df["country"] == "ARG").all() and (df["year"] == 2020).all()


def test_dpi(snap_factory):
    csv = "countryname,ifs,year,execrlc,checks,system,yrsoffc,polariz\nBolivia,BOL,2021,3,4,0,1,2\nFrance,FRA,2021,2,5,2,3,1\n"
    snap = snap_factory("idb_dpi", {"dpi.csv": csv})
    out = _check(DPI(), snap, ["governance"])
    df = out["governance"]
    assert (df["country"] == "BOL").all() and df[df["indicator"] == "dpi_execrlc"].iloc[0]["value"] == 3


def test_bgs(snap_factory):
    payload = {"numberMatched": 3, "features": [
        {"properties": {"country_iso3_code": "PER", "country_trans": "Peru", "year": "2021-01-01T00:00:00", "bgs_statistic_type_trans": "Production", "erml_group": "Copper", "erml_commodity": "Copper (mine production, metal content)", "quantity": 2300000.0, "units": "tonnes (metal content)", "data_precision_description": "Normal Value"}},
        {"properties": {"country_iso3_code": "PER", "country_trans": "Peru", "year": "2021-01-01T00:00:00", "bgs_statistic_type_trans": "Production", "erml_group": "Unobtainium", "erml_commodity": "Unobtainium", "quantity": 1.0, "units": "t", "data_precision_description": "Normal Value"}},
        {"properties": {"country_iso3_code": "PER", "country_trans": "Peru", "year": "2021-01-01T00:00:00", "bgs_statistic_type_trans": "Exports", "erml_group": "Copper", "erml_commodity": "Copper ores", "quantity": 5.0, "units": "t", "data_precision_description": "Normal Value"}},
    ]}
    snap = snap_factory("bgs_wms", {"items_PER_0.json": payload})
    out = _check(BGS(), snap, ["production"])
    assert len(out["production"]) == 1 and out["production"].iloc[0]["mineral"] == "copper" and out["production"].iloc[0]["year"] == 2021


def test_usgs_mcs(snap_factory):
    # consolidated long-format file (MCS2026_Commodities_Data.csv shape: one row per statistic)
    # real 2026 header, including the "Is critical mineral 2025" column that must not be read as a year column
    long_csv = (
        "MCS chapter,Section,Commodity,Country,Statistics,Statistics_detail,Unit,Year,Value,Notes,Is critical mineral 2025,Other notes\n"
        'Lithium,World,Lithium,Chile,Production,Mine production,metric tons,2024,"49,000",,Yes,\n'
        'Lithium,World,Lithium,Chile,Production,"Mine production, estimated",metric tons,2025,"52,000",,Yes,\n'
        'Lithium,World,Lithium,Chile,Reserves,Reserves,metric tons,2025,"9,300,000",,Yes,\n'
        'Lithium,World,Lithium,United States,Production,Mine production,metric tons,2024,870,,Yes,\n'
        'Lithium,Salient,Lithium,United States,Price,"Price, lithium carbonate, dollars per metric ton",dollars per metric ton,2024,"12,000",,Yes,\n'
        'Lithium,Salient,Lithium,United States,Import,Imports for consumption,metric tons,2024,"3,000",,Yes,\n'
    )
    # wide-format fallback (per-commodity world tables)
    wide_csv = "Commodity,Country,Prod_t_2024,Prod_t_2025e,Reserves_t,Unit\nCopper,Chile,5300000,5500000,190000000,metric tons\n"
    snap = snap_factory("usgs_mcs", {"files/MCS2026_Commodities_Data.csv": long_csv, "files/mcs2026-coppe-world.csv": wide_csv, "item.json": {"files": []}})
    out = _check(USGSMCS(), snap, ["production", "price"])
    df = out["production"]
    assert set(df["country"]) == {"CHL"}
    li = df[df["mineral"] == "lithium"]
    assert li[(li["year"] == 2024) & (li["measure"] == "production")].iloc[0]["qty"] == 49000
    assert li[li["measure"] == "reserves"].iloc[0]["year"] == 2025
    assert li[(li["year"] == 2025) & (li["measure"] == "production")].iloc[0]["value_type"] == "estimated"
    cu = df[df["mineral"] == "copper"]
    assert set(cu["measure"]) == {"production", "reserves"} and cu[cu["measure"] == "reserves"].iloc[0]["year"] == 2025
    price = out["price"]
    assert len(price) == 1 and price.iloc[0]["price"] == 12000 and price.iloc[0]["year"] == 2024


def test_wgi_bulk_dataset_fallback(snap_factory):
    # govindicators.org long format (2024+ release) when the World Bank API returns no rows
    api_error = [{"message": [{"id": "120", "key": "Invalid value", "value": "The provided parameter value is not valid"}]}]
    bulk = "countryname,code,year,indicator,estimate,stddev\nChile,CHL,2023,cc,1.02,0.1\nChile,CHL,2023,rl,0.9,0.1\nNowhere,ZZZ,2023,cc,0.1,0.1\nPeru,PER,2023,va,..,\n"
    snap = snap_factory("wb_wgi", {"CC.EST.json": api_error, "wgidataset.csv": bulk})
    out = _check(WGI(), snap, ["governance"])
    df = out["governance"]
    assert set(df["country"]) == {"CHL"} and set(df["indicator"]) == {"CC.EST", "RL.EST"}
    assert df[df["indicator"] == "CC.EST"].iloc[0]["value"] == 1.02


def test_wgi_data360_fallback(snap_factory):
    payload = {"count": 2, "value": [{"REF_AREA": "PER", "TIME_PERIOD": "2022", "OBS_VALUE": "-0.35", "INDICATOR": "WB_WGI_CC_EST"},
                                     {"REF_AREA": "PER", "TIME_PERIOD": "2023", "OBS_VALUE": "..", "INDICATOR": "WB_WGI_CC_EST"}]}
    snap = snap_factory("wb_wgi", {"d360_CC.EST_PER.json": payload})
    out = _check(WGI(), snap, ["governance"])
    assert len(out["governance"]) == 1 and out["governance"].iloc[0]["value"] == -0.35 and out["governance"].iloc[0]["year"] == 2022


def test_clean_url_strips_signed_query_parameters():
    from scm.http import clean_url

    signed = "https://dvn-cloud.s3.amazonaws.com/10.7910/DVN/X/abc?response-content-type=text%2Fcsv&X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=AKIAEXAMPLEKEY0000000%2F20261001&X-Amz-Signature=deadbeef"
    assert clean_url(signed) == "https://dvn-cloud.s3.amazonaws.com/10.7910/DVN/X/abc"
    assert clean_url("https://comtradeapi.un.org/public/v1/preview/C/A/HS?reporterCode=32&period=2008,2009") == "https://comtradeapi.un.org/public/v1/preview/C/A/HS?reporterCode=32&period=2008,2009"
    assert clean_url(None) is None


def test_finance_event_parsers_return_schema_columns_when_empty(snap_factory):
    # a trimmed DFC fixture may hold no South American rows; the frame must still carry every schema column
    xlsx = "Fiscal Year,Project Number,Project Type,Region,Country,Project Name,Committed,Currency\n1986,1,DI,MENA,Syria,Legacy,100,USD\n"
    snap = snap_factory("dfc_projects", {"dfc.csv": xlsx})
    out = _check(DFC(), snap, ["finance_event"])
    assert len(out["finance_event"]) == 0 and "event_id" in out["finance_event"].columns


def test_tier2_parsers(snap_factory, monkeypatch):
    bills = {"bills": [{"congress": 118, "type": "S", "number": "1871", "title": "Critical Minerals Act", "updateDate": "2024-05-01", "url": "https://api.congress.gov/v3/bill/118/s/1871", "latestAction": {"actionDate": "2024-05-01", "text": "Referred"}}]}
    snap = snap_factory("congress_gov", {"bills_0.json": bills})
    out = _check(CongressGov(), snap, ["policy_document"])
    assert out["policy_document"].iloc[0]["doc_type"] == "bill:S"

    census = [["CTY_CODE", "CTY_NAME", "I_COMMODITY", "GEN_VAL_MO", "GEN_QY1_MO", "UNIT_QY1", "time"], ["3370", "CHILE", "2603000000", "1500000", "900", "KG", "2024-03"]]
    snap = snap_factory("us_census_trade", {"imports_260300.json": census})
    out = _check(CensusTrade(), snap, ["trade_flow"])
    r = out["trade_flow"].iloc[0]
    assert r["reporter"] == "CHL" and r["partner"] == "USA" and r["month"] == 3 and r["value_type"] == "mirror"

    def write(p):
        pd.DataFrame({"Country": ["Venezuela"], "Year": [2010], "Amount": [20000], "Lender": ["CDB"], "Borrower": ["PDVSA"], "Sector": ["Energy"], "Project": ["Oil-backed loan"]}).to_excel(p, index=False)

    snap = snap_factory("bu_codf", {"codf.xlsx": write})
    out = _check(BUCODF(), snap, ["finance_event"])
    assert out["finance_event"].iloc[0]["country"] == "VEN" and out["finance_event"].iloc[0]["amount_usd"] == 2e10


@pytest.mark.parametrize("sid", ["congress_gov", "us_census_trade", "bu_codf", "aei_cgit"])
def test_tier2_skipped_without_secret(sid, tmp_path, monkeypatch):
    for k in ADAPTERS[sid].requires_env:
        monkeypatch.delenv(k, raising=False)
    rec = ADAPTERS[sid]().run(raw_base=tmp_path / "raw", out_dir=tmp_path / "wh")
    assert rec["status"] == "skipped"
