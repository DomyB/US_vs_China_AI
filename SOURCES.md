# Sources

Generated from `pipeline/config/sources/*.yaml` by `pipeline/scripts/build_sources.py`.
Do not edit by hand. Every dataset and document on the site links back to one of these entries.

Total: 187 sources. Status: 168 live, 7 moved, 2 dead, 10 uncertain.

**Verification caveat.** Statuses dated 2026-10-01 with method `search` were established from search-engine results, GitHub mirrors and package indexes, because the development sandbox cannot reach other hosts. Method `direct` means an HTTP check from a GitHub Actions runner.

**Direct check.** The liveness workflow last tested every URL on 2026-10-05. 'Blocks automated clients' means the site answered 403 to a generic HTTP client (bot protection), not that it is down; 'TLS error' means the site's certificate chain did not validate on the runner.

**Reliability ratings:** Official (government, central bank, multilateral, exchange); Independent / academic (universities, NGOs, independent press); Partisan (documented political alignment or advocacy); State-controlled media (state-owned outlets and government communication); Analysis (think-tank commentary, used as context, not data).

## International

| Source | Status | Direct check | Reliability | Coverage | Access | Refresh | License | Notes |
|---|---|---|---|---|---|---|---|---|
| [Think-tank analysis (CSIS, Atlantic Council, Inter-American Dialogue, CFR)](https://www.csis.org/programs/americas-program) | live | reachable | Analysis (think tank) | 2008–2026 | html | none | Copyright; cited, not ingested as data | Qualitative context only; labeled analysis. |
| [Environmental Justice Atlas (EJAtlas)](https://ejatlas.org) | live | reachable | Independent / academic | 2012–2026 | html | quarterly | CC BY-NC-SA 3.0 | Access: Bulk CSV only by approved request. No API; scraping discouraged. Bulk request to be submitted in Phase 2. |
| [OCMAL, Observatorio de Conflictos Mineros de América Latina](https://mapa.conflictosmineros.net/ocmal_db-v2/) | live | reachable | Partisan | 2010–2026 | html | quarterly | Not stated | Activist network; labeled partisan. Complement to EJAtlas. |
| [ResourceContracts.org](https://www.resourcecontracts.org) ([data](https://api.resourcecontracts.org)) | live | reachable | Independent / academic | 2000–2025 | api | quarterly | Open (NRGI/CCSI/World Bank); contract texts public | 3,343 published contracts across 107 countries, including Peru, Colombia, Ecuador, Guyana and Argentine provinces. |
| [ACLED (Armed Conflict Location and Event Data)](https://acleddata.com) | live | reachable | Independent / academic | 2018–2026 | api | monthly | ACLED Terms of Use: free research access, attribution, no redistribution | Access: Free registered account; OAuth since Sept 2025; download caps. Python: `acled`. Latin America coverage starts 2018. |
| [GDELT 2.0 (Events, Global Knowledge Graph, DOC API)](https://www.gdeltproject.org/data.html) ([data](https://api.gdeltproject.org/api/v2/doc/doc)) | live | reachable | Independent / academic | 2015–2026 | bulk | daily | Open with attribution | Python: `gdeltdoc`. Machine-coded and noisy; used for volume and tone context, never as a primary count. Raw files used instead of BigQuery to stay at $0. Events 1.0 from 1979 is cruder. |
| [World Bank International Debt Statistics (creditor-level)](https://datatopics.worldbank.org/debt/ids/) ([data](https://api.worldbank.org/v2/sources/6)) | live | reachable | Official | 1970–2024 | api | annual | CC BY 4.0 | Python: `wbgapi`. Public and publicly guaranteed debt by creditor country (China = counterpart 730). Covers 10 of 12 countries; Chile and Uruguay are not IDS reporters. |
| [Natural Earth 1:10m admin-0 map units (v5)](https://www.naturalearthdata.com/downloads/10m-cultural-vectors/) ([data](https://github.com/nvkelso/natural-earth-vector)) | live | reachable | Independent / academic | 2009–2026 | bulk | none | public domain | map_units keeps French Guiana as its own polygon (GUF). |
| [IDB Database of Political Institutions 2023](https://data.iadb.org/dataset/the-database-of-political-institutions-dpi-2023) | live | reachable | Official | 1975–2023 | bulk | annual | IDB open data | 2023 edition published March 2026 (the brief assumed 2020). Government ideology; extended 2024-2026 by hand from sourced election outcomes. |
| [International IDEA data tools](https://www.idea.int/data-tools) | live | reachable | Independent / academic | 1975–2025 | bulk | annual | CC BY-NC-SA (to confirm) |  |
| [United Nations General Assembly Voting Data (Bailey, Strezhnev, Voeten)](https://dataverse.harvard.edu/dataset.xhtml?persistentId=doi:10.7910/DVN/LEJUQZ) | live | reachable | Independent / academic | 1946–2024 | bulk | annual | CC0 (Harvard Dataverse) | Ideal points and dyadic agreement with the US and China. Raw votes for recent sessions via UNGA-DM (unvotes.unige.ch). |
| [V-Dem Dataset v16](https://www.v-dem.net/data/the-v-dem-dataset/) | live | reachable | Independent / academic | 1789–2025 | bulk | annual | CC BY-SA 4.0 | Access: Free registration. No Python package; CSV loaded directly. v16 released March 2026. |
| [World Bank Worldwide Governance Indicators](https://www.govindicators.org) ([data](https://api.worldbank.org/v2/sources/3)) | live | reachable | Official | 1996–2024 | bulk | annual | CC BY 4.0 |  |
| [IMF Direct Investment Positions by Counterpart Economy (DIP, formerly CDIS)](https://data.imf.org/en/datasets/IMF.STA:DIP) ([data](https://api.imf.org/external/sdmx/3.0)) | moved | reachable | Official | 2009–2024 | api | annual | IMF data terms | Python: `sdmx1`. Chinese FDI is often routed through Hong Kong and offshore centres; paired with MOFCOM and AEI CGIT. |
| [UNCTAD World Investment Report and UNCTADstat](https://unctadstat.unctad.org/datacentre/) | live | reachable | Official | 1970–2024 | bulk | annual | UNCTAD open terms with attribution | FDI totals only; bilateral FDI series discontinued after 2012. |
| [World Bank World Development Indicators](https://data.worldbank.org) ([data](https://api.worldbank.org/v2)) | live | reachable | Official | 1960–2025 | api | quarterly | CC BY 4.0 | Python: `wbgapi`. |
| [Media Cloud](https://search.mediacloud.org) ([data](https://search.mediacloud.org/api)) | live | reachable | Independent / academic | 2008–2026 | api | daily | Terms of use; counts and URLs only, no article text | Access: Free key; 4,000 requests/week. Python: `mediacloud`. National collections for Spanish and Portuguese outlets; density varies by country and year. |
| [ICIJ Offshore Leaks Database](https://offshoreleaks.icij.org) ([data](https://offshoreleaks-data.icij.org/offshoreleaks/csv/full-oldb.LATEST.zip)) | live | reachable | Independent / academic | 2013–2026 | bulk | annual | ODbL 1.0 (database) and CC BY-SA 3.0 (contents) | Leads only, always corroborated. Snapshot July 2026. |
| [OpenCorporates](https://opencorporates.com) ([data](https://api.opencorporates.com)) | live | reachable | Independent / academic | 2010–2026 | api | quarterly | ODbL-style share-alike for free use | Access: Free tier 50 calls/day; public-benefit access by application. Public-benefit application to be filed in Phase 2. |
| [Dialogue Earth (formerly Diálogo Chino)](https://dialogue.earth/es/) | live | reachable | Independent / academic | 2014–2026 | rss | daily | CC BY-NC-ND (to confirm); headlines and links only | Rebranded 2024; RSS likely at /es/feed/. |
| [IMF Primary Commodity Price System](https://data.imf.org/en/datasets/IMF.RES:PCPS) | uncertain | reachable | Official | 1990–2026 | api | monthly | IMF terms | Python: `sdmx1`. Includes cobalt and uranium; lithium inclusion to confirm. The IMF.STA:PCPS path returned 404 on the first direct check (2026-10-01); IMF.RES:PCPS is the current dataset id to confirm. |
| [Lithium price proxy (USGS annual average + customs unit values)](https://www.usgs.gov/centers/national-minerals-information-center/lithium-statistics-and-information) | live | reachable | Official | 2008–2025 | derived | annual | Public domain (USGS); UN Comtrade terms | No free licensed lithium benchmark exists. Unit values (value / quantity for HS 2836.91 and 2825.20) are labeled 'implicit realized price'. |
| [London Metal Exchange public data](https://www.lme.com/market-data/accessing-market-data/historical-data) | live | blocks automated clients (403) | Official | 2021–2026 | html | none | LME data terms: delayed prices after free registration; no redistribution | Access: Free registration. Spot-check only (lithium hydroxide CIF CJK); not stored or redistributed. |
| [World Bank Commodity Price Data (Pink Sheet)](https://www.worldbank.org/en/research/commodity-markets) | live | reachable | Official | 1960–2026 | bulk | monthly | CC BY 4.0 | Copper, nickel, tin, silver, aluminium, iron ore, lead, zinc. No lithium, cobalt, rare earths or graphite. |
| [British Geological Survey World Mineral Statistics](https://www.bgs.ac.uk/mineralsuk/statistics/world-mineral-statistics/) ([data](https://ogcapi.bgs.ac.uk/collections/world-mineral-statistics)) | live | reachable | Official | 1970–2023 | bulk | annual | UK Open Government Licence | Independent cross-check for USGS production figures; OGC API in beta. |
| [USGS Mineral Commodity Summaries](https://www.usgs.gov/centers/national-minerals-information-center/mineral-commodity-summaries) | live | reachable | Official | 1996–2025 | bulk | annual | public domain | 2026 edition (data year 2025) released Feb 2026 with CSV/XLSX data release. World mine production and reserves by country; annual average prices (used for lithium). |
| [USGS Minerals Yearbook, Volume III, Latin America and Canada](https://www.usgs.gov/centers/national-minerals-information-center/latin-america-and-canada-north-america-central-america) | live | reachable | Official | 1994–2022 | pdf | annual | public domain | Country chapters with ownership structure; two to three year lag (2022 tables released, 2023 partial). |
| [IMF International Merchandise Trade Statistics (IMTS, formerly Direction of Trade Statistics)](https://data.imf.org/en/datasets/IMF.STA:IMTS) ([data](https://api.imf.org/external/sdmx/3.0)) | moved | reachable | Official | 1948–2026 | api | monthly | IMF data terms: free use with attribution | Python: `sdmx1`. Legacy DOTS portal retired Nov 2025; dataservices.imf.org no longer resolves. Bilateral totals used for cross-checks against Comtrade. |
| [UN Comtrade Plus](https://comtradeplus.un.org) ([data](https://comtradeapi.un.org)) | live | reachable | Official | 1988–2026 | api | monthly | UN data terms: free use with attribution; bulk redistribution restricted | Access: Free registered subscription key: 100,000 rows/call, 500 calls/day. Python: `comtradeapicall`. Primary trade source for all 12 countries (HS6, annual and monthly). China-reported data here is the proxy for GACC. Venezuela's own reports end around 2013; partner mirror data used after that. |
| [WTO Stats / Timeseries API](https://stats.wto.org) ([data](https://api.wto.org/timeseries/v1)) | live | reachable | Official | 1948–2025 | api | annual | WTO terms: free use with attribution | Access: Free subscription key. Tariffs and trade by product group; secondary. |

## United States

| Source | Status | Direct check | Reliability | Coverage | Access | Refresh | License | Notes |
|---|---|---|---|---|---|---|---|---|
| [US State Department, Minerals Security Partnership (2022-2025) and FORGE (2026-)](https://2021-2025.state.gov/minerals-security-partnership/) | moved | reachable | Official | 2022–2026 | html | weekly | public domain | MSP superseded in Feb 2026 by the Forum on Resource Geostrategic Engagement (FORGE); MSP pages live only in the 2021-2025 archive. |
| [US embassy press releases (ar, bo, br, cl, co, ec, gy, py, pe, sr, uy, ve .usembassy.gov)](https://ar.usembassy.gov/news/) | uncertain | blocks automated clients (403) | Official | 2010–2026 | rss | weekly | public domain | WordPress platform, so /feed/ RSS is likely but unverified; tested in the first Actions run. |
| [SEC EDGAR (full-text search, submissions and XBRL APIs)](https://www.sec.gov/edgar) ([data](https://data.sec.gov)) | live | blocks automated clients (403) | Official | 2001–2026 | api | weekly | public domain | Access: None; User-Agent with contact required; 10 requests/second. Python: `edgartools`. Albemarle, Freeport-McMoRan, SQM (20-F), Lithium Argentina (40-F) and other cross-listed issuers. |
| [Export-Import Bank of the United States, authorizations](https://catalog.data.gov/organization/exim-gov) | moved | 404 at registry URL | Official | 2007–2025 | bulk | quarterly | public domain | data.exim.gov closed Sept 2023. The dataset id changes with each refresh (the old 'thru-12-31-2022' id returned 404 on 2026-10-01), so the adapter discovers the current package through the data.gov search API. |
| [US International Development Finance Corporation, active projects](https://www.dfc.gov/what-we-do/active-projects) | live | reachable | Official | 1960–2025 | bulk | quarterly | public domain | Quarterly XLSX linked from the active-projects page (no API); the file includes OPIC-era commitments back to FY1960 with an 'Originating Agency' column. Snapshots are diffed. |
| [USAspending.gov API](https://www.usaspending.gov) ([data](https://api.usaspending.gov/api/v2/)) | live | reachable | Official | 2008–2026 | api | monthly | public domain | Limited minerals relevance; DoD and DOE awards with foreign place of performance. |
| [Congress.gov API v3](https://api.congress.gov/) ([data](https://api.congress.gov/v3)) | live | reachable | Official | 1973–2026 | api | weekly | public domain | Access: Free key; 5,000 requests/hour. Bills, hearings, CRS reports, House votes (beta). |
| [DOE Critical Materials List (2023, amended 2025)](https://www.federalregister.gov/documents/2023/08/04/2023-16611/notice-of-final-determination-on-2023-doe-critical-materials-list) | live | reachable | Official | 2023–2025 | html | annual | public domain |  |
| [Federal Register API](https://www.federalregister.gov) ([data](https://www.federalregister.gov/api/v1)) | live | reachable | Official | 1994–2026 | api | weekly | public domain | Executive orders, Section 232 proclamations (critical minerals Apr 2025; copper Jul 2025), list notices. |
| [USGS Final 2025 List of Critical Minerals](https://www.federalregister.gov/documents/2025/11/07/2025-19813/final-2025-list-of-critical-minerals) | live | reachable | Official | 2018–2025 | html | annual | public domain | 60 minerals; copper, silver, potash, phosphate, uranium and others added in 2025. |
| [US Census Bureau International Trade API](https://usatrade.census.gov) ([data](https://api.census.gov/data/timeseries/intltrade)) | live | reachable | Official | 2013–2026 | api | monthly | public domain | Access: Optional free key; unkeyed use capped per IP. Monthly HS10 by partner country; the US-side mirror for every South American reporter. |

## China

| Source | Status | Direct check | Reliability | Coverage | Access | Refresh | License | Notes |
|---|---|---|---|---|---|---|---|---|
| [Chinese embassy statements (<cc>.china-embassy.gov.cn/esp/sgxw/)](https://ar.china-embassy.gov.cn/esp/sgxw/) | live | reachable | State-controlled media | 2010–2026 | html | weekly | Not stated | URL pattern confirmed for Argentina; Portuguese (/por/) for Brazil, English (/eng/) for Guyana and Suriname assumed and tested in Phase 2. |
| [HKEXnews (Hong Kong Exchange disclosures)](https://www1.hkexnews.hk) | live | reachable | Official | 2008–2026 | html | none | Terms (Aug 2025) ban scraping and text and data mining | Never scraped. Zijin, Ganfeng, CMOC, COSCO Shipping Ports announcements taken from company investor pages. |
| [cninfo / Shanghai and Shenzhen exchange disclosures](http://www.cninfo.com.cn) | live | reachable | Official | 2008–2026 | html | none | Uncertain | Spot use for A-share announcements (Tianqi, Ganfeng); undocumented endpoints. |
| [AidData Global Chinese Development Finance Dataset v3.0](https://www.aiddata.org/data/aiddatas-global-chinese-development-finance-dataset-version-3-0) | live | reachable | Independent / academic | 2000–2021 | bulk | annual | Free with citation | 20,985 projects; commitments 2000-2021, implementation to 2023; geospatial companion dataset. |
| [BU GDP Center and Inter-American Dialogue, Chinese Loans to Latin America and the Caribbean (archived)](https://www.bu.edu/gdp/china-latin-america-finance-database-data-download/) | dead | reachable | Independent / academic | 2005–2023 | bulk | none | Cite BU/IAD | Archived Feb 2025. Historical file retained for 2005-2023; superseded by bu_codf. |
| [Boston University GDP Center, China's Overseas Development Finance Database](https://www.bu.edu/gdp/chinas-overseas-development-finance/) | live | reachable | Independent / academic | 2008–2024 | bulk | annual | Free after signed data-use agreement; non-commercial; cite | Access: Signed DUA. Replaces the archived BU/Inter-American Dialogue 'Chinese Loans to Latin America' database (last data 2023). CDB and China Exim loans to sovereign and public borrowers only. |
| [AEI / Heritage Foundation China Global Investment Tracker](https://www.aei.org/china-global-investment-tracker/) | live | blocks automated clients (403) | Analysis (think tank) | 2005–2026 | bulk | semi-annual | Free for public use with citation | Think-tank compiled from press and filings; US$100m threshold. Labeled analysis-sourced data. |
| [Inter-American Dialogue, Regional Repository of Chinese Investments in Latin America](https://thedialogue.org/analysis/launch-of-the-regional-repository-of-chinese-investments-in-latin-america) | live | reachable | Analysis (think tank) | 2000–2024 | bulk | annual | Uncertain | Georeferenced; eight countries (AR, BO, BR, CL, EC, PY, PE, UY). Candidate for the project map. |
| [MOFCOM Statistical Bulletin of China's Outward Foreign Direct Investment](http://fec.mofcom.gov.cn) | live | reachable | Official | 2003–2024 | pdf | annual | Chinese government terms | State source. Most outward FDI is attributed to Hong Kong and offshore centres; English edition lags. |
| [Red ALC-China, Monitor de la OFDI china en América Latina y el Caribe](https://www.redalc-china.org/monitor/) | live | reachable | Independent / academic | 2000–2024 | pdf | annual | Copyright UNAM / Red ALC-China; cite | 678 transactions 2000-2024 in the 2025 edition; 2026 edition exists. Transaction table format to confirm. |
| [MOFCOM export-control announcements (gallium/germanium 2023 No. 23; graphite 2023 No. 39; antimony 2024 No. 33; rare earths 2025 No. 18; Oct 2025 Nos. 55-62; suspension No. 70)](http://www.mofcom.gov.cn) | live | reachable | Official | 2023–2026 | html | weekly | Chinese government terms | State source. Each control and each suspension is recorded as a dated event. |
| [People's Daily (Spanish edition)](http://spanish.people.com.cn) | uncertain | reachable | State-controlled media | 2008–2026 | html | daily | Copyright; headlines and links only | State-controlled media. RSS availability unverified. |
| [Xinhua (Spanish service)](http://spanish.xinhuanet.com) ([data](http://spanish.xinhuanet.com/rss/rss.html)) | live | reachable | State-controlled media | 2008–2026 | rss | daily | Copyright Xinhua; headlines and links only | State-controlled media. RSS feeds include China-Iberoamérica. |
| [General Administration of Customs of China, trade statistics](https://stats.customs.gov.cn) | live | TLS error (site certificate) | Official | 2017–2026 | html | quarterly | Not stated | State source; query UI with XLSX export per query, no API or bulk. China-reported data in UN Comtrade is the primary proxy; GACC used for spot cross-checks. |

## Regional (Latin America)

| Source | Status | Direct check | Reliability | Coverage | Access | Refresh | License | Notes |
|---|---|---|---|---|---|---|---|---|
| [Georgetown SIGLA (successor to the Political Database of the Americas)](https://sigla.georgetown.domains) | live | reachable | Independent / academic | 2010–2025 | html | annual | Not stated | PDBA was decommissioned in 2010 (static archive). |
| [ECLAC, Foreign Direct Investment in Latin America and the Caribbean (annual)](https://www.cepal.org/en/publications/type/foreign-direct-investment-latin-america-and-caribbean) | live | reachable | Official | 2008–2025 | pdf | annual | CC BY-IGO | 2025 edition includes a critical-minerals chapter. |
| [CEPAL / ECLAC CEPALSTAT](https://statistics.cepal.org/portal/cepalstat/) ([data](https://estadisticas.cepal.org/cepalstat/WEB_CEPALSTAT/openDataAPI.asp)) | live | reachable | Official | 1990–2025 | api | quarterly | ECLAC open data with attribution |  |
| [IDB INTEGRA (formerly INTrade) and IDB open data](https://integra.iadb.org) | moved | reachable | Official | 2000–2025 | html | annual | IDB open data | INTrade replaced by INTEGRA; CSV export; API uncertain. |

## Other jurisdictions

| Source | Status | Direct check | Reliability | Coverage | Access | Refresh | License | Notes |
|---|---|---|---|---|---|---|---|---|
| [SEDAR+ (Canadian securities filings)](https://www.sedarplus.ca) | live | reachable | Official | 2023–2026 | html | none | Terms of use prohibit scraping and database building | Never scraped. Canadian juniors covered through SEC cross-listings and company investor pages. |

## National: Argentina

| Source | Status | Direct check | Reliability | Coverage | Access | Refresh | License | Notes |
|---|---|---|---|---|---|---|---|---|
| [Provincial mining cadastres (Jujuy JEMSE, Salta IDESA, Catamarca via SIACAM viewer)](https://www.argentina.gob.ar/economia/mineria/siacam/otros-recursos/catastros-mineros) | live | reachable | Official | 2015–2026 | api | quarterly | Not stated | GIS viewers and WMS/WFS; no bulk concession tables; contract terms rarely published. |
| [RIGI approved projects (Ministerio de Economía page + Boletín Oficial resolutions)](https://www.argentina.gob.ar/economia) | live | reachable | Official | 2025–2026 | html | weekly | Public | 21-22 approvals, about US$47bn by Aug 2026, roughly half mining (lithium: Rincón, Sal de Oro, Exar, Tres Quebradas; copper: Los Azules). Authoritative dates and amounts from resolutions. |
| [Boletín Oficial de la República Argentina](https://www.boletinoficial.gob.ar) | live | reachable | Official | 2000–2026 | html | daily | To confirm | No API or RSS; full-text search on site; community scrapers exist. |
| [SEGEMAR / SIGAM geoservices](https://sigam.segemar.gov.ar) | live | reachable | Official | 2000–2026 | api | annual | Open access (statement to confirm) | WMS/WFS layers of deposits and geology; not a production source. |
| [Cámara de Diputados, Datos Abiertos (HCDN)](https://datos.hcdn.gob.ar) ([data](https://datos.hcdn.gob.ar/api/3)) | live | reachable | Official | 2011–2026 | api | weekly | Open format (license statement to confirm) | Roll-call votes per deputy from 2011, bills, sessions, Diarios de Sesiones dataset. |
| [Senado de la Nación, Datos Abiertos](https://www.senado.gob.ar/micrositios/DatosAbiertos/) | live | reachable | Official | 2010–2026 | bulk | weekly | To confirm | Bills, sessions, senators; no structured roll-call dataset confirmed (vote pages scraped). |
| [Clarín](https://www.clarin.com) ([data](https://www.clarin.com/rss/lo-ultimo/)) | live | reachable | Independent / academic | 2008–2026 | rss | daily | Copyright; headlines, dates, URLs only | Orientation: centrist-right; hostile to kirchnerismo since 2008. Paywall: metered. |
| [El Cronista](https://www.cronista.com) ([data](https://www.cronista.com/rss/feed.xml)) | live | reachable | Independent / academic | 2008–2026 | rss | daily | Copyright; headlines, dates, URLs only | Orientation: business / centre-right. Paywall: metered. |
| [Infobae](https://www.infobae.com) ([data](https://www.infobae.com/feeds/rss)) | live | reachable | Independent / academic | 2008–2026 | rss | daily | Copyright; headlines, dates, URLs only | Orientation: centrist / pro-market. |
| [La Nación](https://www.lanacion.com.ar) ([data](https://www.lanacion.com.ar/arc/outboundfeeds/rss/)) | live | reachable | Independent / academic | 2008–2026 | rss | daily | Copyright; headlines, dates, URLs only | Orientation: centre-right / conservative-liberal. Paywall: metered. |
| [Página/12](https://www.pagina12.com.ar) | live | reachable | Partisan | 2008–2026 | rss | daily | Copyright; headlines, dates, URLs only | Orientation: left; aligned with kirchnerismo. |
| [Secretaría de Minería, SIACAM datasets (datos.gob.ar)](https://datos.gob.ar/dataset?tags=Miner%C3%ADa) ([data](https://datos.gob.ar/api/3)) | live | reachable | Official | 2010–2026 | api | monthly | CC BY 4.0 (datos.gob.ar default) | Mineral exports by mineral and destination, lithium exports, project portfolio, employment, royalties. Monthly export reports also as PDF/XLSX. |
| [INDEC, Sistema de consulta de comercio exterior](https://comex.indec.gob.ar/#/database) | live | reachable | Official | 2002–2026 | html | monthly | INDEC terms (to confirm) | NCM8 x country x month. Full database download 2002-2020; later months via monthly report files. No REST API; Comtrade used for programmatic pulls. |

## National: Argentina, Colombia, Ecuador, Guyana, Peru, Suriname

| Source | Status | Direct check | Reliability | Coverage | Access | Refresh | License | Notes |
|---|---|---|---|---|---|---|---|---|
| [Extractive Industries Transparency Initiative (EITI)](https://eiti.org/countries) | live | blocks automated clients (403) | Official | 2012–2024 | bulk | quarterly | EITI Open Data Policy | Six South American implementing countries. Suriname suspended Mar 2025, lifted mid-2025. Brazil, Chile, Bolivia, Venezuela, Paraguay, Uruguay are not members. Beneficial ownership disclosures via Opening Extractives. |

## National: Bolivia

| Source | Status | Direct check | Reliability | Coverage | Access | Refresh | License | Notes |
|---|---|---|---|---|---|---|---|---|
| [Yacimientos de Litio Bolivianos (YLB), contracts and reports](https://www.ylb.gob.bo/index.php/contratos-y-alianzas-que-impulsan-el-litio/) | live | reachable | Official | 2017–2026 | pdf | monthly | Not stated | State company. CBC (CATL consortium) contract published; Uranium One contract referenced; neither ratified; court suspension May 2025; new lithium law announced Jan 2026; Sept 2026 SOE reorganisation decree affects YLB. |
| [Gaceta Oficial de Bolivia (metadata) and lexivox.org (free full text)](https://gacetaoficialdebolivia.gob.bo/normas/busquedaAvanzada) ([data](https://www.lexivox.org)) | live | reachable | Official | 2009–2026 | html | weekly | Gaceta full text by paid subscription; lexivox free | Only free paths are used (decision 1). |
| [Asamblea Legislativa Plurinacional (Diputados, Senado)](https://diputados.gob.bo) | live | reachable | Official | 2010–2026 | html | weekly | Not stated | No open-data API, no roll-call or transcript datasets; HTML news on bills only. |
| [El Deber](https://eldeber.com.bo) | live | reachable | Independent / academic | 2008–2026 | html | daily | Copyright; headlines, dates, URLs only | Orientation: Santa Cruz; centre-right / regionalist. Paywall: unknown. RSS unverified. |
| [La Razón](https://www.la-razon.com) | live | blocks automated clients (403) | Partisan | 2008–2026 | html | daily | Copyright; headlines, dates, URLs only | Orientation: La Paz; viewed as pro-government during the Morales era. Paywall: True. |
| [Los Tiempos](https://www.lostiempos.com) | live | reachable | Independent / academic | 2008–2026 | html | daily | Copyright; headlines, dates, URLs only | Orientation: Cochabamba; centre-right, independent. Paywall: unknown. |
| [Opinión](https://www.opinion.com.bo) ([data](https://www.opinion.com.bo/rss/listado/)) | live | reachable | Independent / academic | 2008–2026 | rss | daily | Copyright; headlines, dates, URLs only | Orientation: Cochabamba; regional, moderate. |
| [COMIBOL](https://www.comibol.gob.bo) | uncertain | reachable | Official | 2010–2025 | pdf | annual | Not stated | State mining corporation; site not verifiable from the sandbox. |
| [Ministerio de Minería y Metalurgia, boletines y anuario](https://www.mineria.gob.bo/index.php/boletines/) | live | HTTP 523 | Official | 2015–2025 | pdf | quarterly | Not stated | PDF only; tables extracted. |
| [INE Bolivia, comercio exterior](https://www.ine.gob.bo/index.php/estadisticas-economicas/comercio-exterior/) | live | reachable | Official | 2010–2026 | bulk | monthly | Not stated | XLSX by destination x product (monthly 2017-, annual 2010-); no API. |

## National: Brazil

| Source | Status | Direct check | Reliability | Coverage | Access | Refresh | License | Notes |
|---|---|---|---|---|---|---|---|---|
| [CMOC Brasil (niobium, phosphate) company reports](https://en.cmoc.com/html/Business/BRA-Nb-P/) | live | reachable | Partisan | 2016–2026 | html | semi-annual | Copyright | Corporate source; cross-checked with ANM and Comex Stat. |
| [BNDES Dados Abertos, operações de financiamento](https://dadosabertos.bndes.gov.br/dataset/operacoes-financiamento) | live | reachable | Official | 2002–2026 | api | monthly | Open data (CKAN; to confirm) |  |
| [Diário Oficial da União (Imprensa Nacional search)](https://www.in.gov.br/consulta) | live | blocks automated clients (403) | Official | 2002–2026 | html | daily | To confirm | Undocumented JSON search used by Ro-DOU; INLABS bulk needs registration. Querido Diário covers municipal gazettes only. |
| [Serviço Geológico do Brasil, GeoSGB](https://geosgb.sgb.gov.br/downloads) | live | reachable | Official | 2000–2026 | bulk | annual | To confirm |  |
| [Câmara dos Deputados, Dados Abertos API v2](https://dadosabertos.camara.leg.br) ([data](https://dadosabertos.camara.leg.br/api/v2)) | live | reachable | Official | 2001–2026 | api | weekly | Open (LAI) | Python: `DadosAbertosBrasil`. Bills, nominal votes, speeches, bulk files per year. |
| [Senado Federal, Dados Abertos](https://www12.senado.leg.br/dados-abertos) ([data](https://legis.senado.leg.br/dadosabertos)) | live | reachable | Official | 2001–2026 | api | weekly | Open | Nominal votes, speeches, matters. Lei 15.506/2026 (critical minerals policy) tracked here. |
| [Estadão](https://www.estadao.com.br) | live | reachable | Independent / academic | 2008–2026 | rss | daily | Copyright; headlines, dates, URLs only | Orientation: liberal-conservative / centre-right. Paywall: metered. |
| [Folha de S.Paulo](https://www.folha.uol.com.br) ([data](https://www1.folha.uol.com.br/feed/)) | live | reachable | Independent / academic | 2008–2026 | rss | daily | Copyright; headlines, dates, URLs only | Orientation: centrist-liberal, pluralist. Paywall: metered. |
| [O Globo](https://oglobo.globo.com) | live | reachable | Independent / academic | 2008–2026 | rss | daily | Copyright; headlines, dates, URLs only | Orientation: centrist-liberal (Grupo Globo). Paywall: metered. |
| [Valor Econômico](https://valor.globo.com) ([data](https://valor.com.br/rss)) | live | reachable | Independent / academic | 2008–2026 | rss | daily | Copyright; headlines, dates, URLs only | Orientation: business daily. Paywall: True. |
| [ANM dados abertos (AMB production, SIGMINE, CFEM)](https://dadosabertos.anm.gov.br) | moved | reachable | Official | 2010–2026 | bulk | monthly | Open data (dados.gov.br; ODbL or CC BY per dataset) | Address changed from anm.gov.br/acesso-a-informacao/dados-abertos. Mining rights shapefiles, production by substance and municipality, royalties. |
| [Comex Stat (MDIC)](https://comexstat.mdic.gov.br) ([data](https://api-comexstat.mdic.gov.br)) | live | blocks automated clients (403) | Official | 1997–2026 | api | monthly | Open data (gov.br) | Python: `comexpy`. NCM x country x state x month; bulk CSV also available. |

## National: Chile

| Source | Status | Direct check | Reliability | Coverage | Access | Refresh | License | Notes |
|---|---|---|---|---|---|---|---|---|
| [Codelco and ENAMI annual reports](https://www.codelco.com/memorias) | live | reachable | Official | 2008–2025 | pdf | annual | Copyright | State-owned enterprises. NovaAndino Litio (Codelco-SQM JV) formalised Dec 2025. |
| [Sernageomin, Anuario de la Minería and Catastro Minero Online](https://repositorio.sernageomin.cl) | live | TLS error (site certificate) | Official | 2008–2024 | pdf | annual | To confirm |  |
| [Corfo lithium contracts and Estrategia Nacional del Litio (BCN, Cámara, SEC exhibits)](https://www.minmineria.cl) | live | TLS error (site certificate) | Official | 2016–2026 | pdf | monthly | Public documents | No single official repository; SQM and Albemarle contracts via BCN reports, Cámara documents and Albemarle 8-K exhibit; CEOL process from Dec 2024. |
| [Biblioteca del Congreso Nacional (Ley Chile, datos.bcn.cl SPARQL)](https://www.bcn.cl/leychile) ([data](https://datos.bcn.cl/sparql)) | live | reachable | Official | 1877–2026 | api | weekly | Open (BCN linked data) | Access: Ley Chile web service now requires an API key; SPARQL open. |
| [Diario Oficial de la República de Chile](https://www.diariooficial.interior.gob.cl) | live | reachable | Official | 2016–2026 | html | daily | Free | Electronic-only and free since Aug 2016; earlier via BCN. |
| [Cámara de Diputadas y Diputados, opendata.camara.cl](https://opendata.camara.cl) | live | reachable | Official | 2002–2026 | api | weekly | Free reuse (stated) | SOAP/XML web services; per-deputy votes, sessions, transcripts. |
| [Senado de Chile, datos abiertos legislativos](https://tramitacion.senado.cl/datos-abiertos-legislativos) | live | reachable | Official | 2002–2026 | api | weekly | No copyright restrictions (stated) | XML web services: bills, votes by boletín, diario de sesiones. |
| [BioBioChile](https://www.biobiochile.cl) | live | reachable | Independent / academic | 2009–2026 | rss | daily | Copyright; headlines, dates, URLs only | Orientation: independent, populist-centre. |
| [CIPER](https://www.ciperchile.cl) | live | reachable | Independent / academic | 2008–2026 | html | daily | Copyright; headlines, dates, URLs only | Orientation: non-profit investigative; centre-left leaning. |
| [El Mercurio (via Emol)](https://www.emol.com) | live | reachable | Independent / academic | 2008–2026 | rss | daily | Copyright; headlines, dates, URLs only | Orientation: conservative / right (Edwards family). Paywall: El Mercurio paywalled; Emol free. |
| [El Mostrador](https://www.elmostrador.cl) | live | reachable | Independent / academic | 2008–2026 | rss | daily | Copyright; headlines, dates, URLs only | Orientation: pluralist / centre-left digital native. |
| [La Tercera](https://www.latercera.com) | live | reachable | Independent / academic | 2008–2026 | rss | daily | Copyright; headlines, dates, URLs only | Orientation: moderate conservative / classical-liberal (Copesa). Paywall: True. |
| [Cochilco, Anuario de Estadísticas del Cobre y Otros Minerales + boletín mensual](https://www.cochilco.cl/web/anuario-de-estadisticas-del-cobre-y-otros-minerales/) | live | reachable | Official | 2005–2024 | bulk | monthly | To confirm | XLSX incl. exports by destination; lithium and investment catastro. |
| [Banco Central de Chile, API Base de Datos Estadísticos](https://si3.bcentral.cl/estadisticas/Principal1/Web_Services/index.htm) | live | reachable | Official | 1990–2026 | api | monthly | BCCh terms: free reuse with attribution (to confirm) | Access: Free registration. Python: `bcchapi`. |
| [Servicio Nacional de Aduanas, exportaciones por país y producto](https://www.aduana.cl) | live | blocks automated clients (403) | Official | 2012–2026 | bulk | monthly | datos.gob.cl CC BY (to confirm) |  |

## National: Colombia

| Source | Status | Direct check | Reliability | Coverage | Access | Refresh | License | Notes |
|---|---|---|---|---|---|---|---|---|
| [Agencia Nacional de Minería, AnnA Minería cadastre (WFS, datos.gov.co)](https://www.anm.gov.co/anna-mineria) ([data](https://www.datos.gov.co/resource/si2v-pbq5.json)) | live | reachable | Official | 2008–2026 | api | monthly | CC BY (datos.gov.co default; per dataset to confirm) | Access: Socrata app token optional. |
| [Gaceta del Congreso (Imprenta Nacional)](https://www.imprenta.gov.co) | uncertain | reachable | Official | 2008–2026 | pdf | weekly | To confirm | PDF gazettes with actas and votes; search by number and date; exact search URL to confirm. |
| [Servicio Geológico Colombiano, datos abiertos](https://datos.sgc.gov.co) | live | reachable | Official | 2010–2026 | api | annual | To confirm |  |
| [Congreso Visible (Universidad de los Andes)](https://congresovisible.uniandes.edu.co) | live | reachable | Independent / academic | 1998–2026 | html | weekly | To confirm (scraping terms unknown) | Structured secondary source for votes and bills. |
| [Cámara de Representantes, proyectos de ley (XLSX, datos.gov.co)](https://www.camara.gov.co/proyectos-de-ley) ([data](https://www.datos.gov.co/resource/kcxp-nxum.json)) | live | reachable | Official | 2008–2026 | api | weekly | CC BY (datos.gov.co, to confirm) | Bills metadata and status; roll-call votes only inside PDF actas. |
| [Senado de la República](https://www.senado.gov.co) | live | reachable | Official | 2008–2026 | html | none | To confirm | Website returns HTTP 403 to automated access; not scraped. Gaceta and Congreso Visible used instead. |
| [El Espectador](https://www.elespectador.com) | live | reachable | Independent / academic | 2008–2026 | rss | daily | Copyright; headlines, dates, URLs only | Orientation: liberal / centre-left. Paywall: True. |
| [El Tiempo](https://www.eltiempo.com) | live | reachable | Independent / academic | 2008–2026 | rss | daily | Copyright; headlines, dates, URLs only | Orientation: centrist / establishment (Sarmiento Angulo group). Paywall: metered. |
| [La Silla Vacía](https://www.lasillavacia.com) | live | reachable | Independent / academic | 2009–2026 | html | daily | Copyright; headlines, dates, URLs only | Orientation: independent, centre-left, politics focus. |
| [Semana](https://www.semana.com) | live | reachable | Partisan | 2008–2026 | html | daily | Copyright; headlines, dates, URLs only | Orientation: progressive before 2020; right-wing / uribista after the 2020 Gilinski takeover. Paywall: True. Treated as two outlets (pre/post 2020) in stance analysis. |
| [UPME, SIMCO / SIMEC, Minería en Cifras](https://www.upme.gov.co/simco) | live | reachable | Official | 2010–2026 | pdf | monthly | To confirm | Monthly PDFs and Power BI; no API. |
| [DANE, exportaciones (anexos and microdata)](https://www.dane.gov.co) ([data](https://microdatos.dane.gov.co/index.php/catalog/859)) | live | reachable | Official | 2008–2026 | bulk | monthly | DANE open-data terms (to confirm) | Access: Registration for microdata. Subheading x destination x department x FOB US$ x kg. |

## National: Ecuador

| Source | Status | Direct check | Reliability | Coverage | Access | Refresh | License | Notes |
|---|---|---|---|---|---|---|---|---|
| [ENAMI EP reports](https://www.enamiep.gob.ec) | live | reachable | Official | 2010–2026 | pdf | annual | Copyright | State mining company. |
| [Catastro Minero Nacional (ARCERNNR / ARCOM ArcGIS REST)](https://geovisorm.controlrecursosyenergia.gob.ec/arcgis/rest/services/Concesiones/CatastroMineroNacional1/MapServer/0) | live | reachable | Official | 2010–2026 | api | monthly | To confirm | Regulator re-split in 2025 (ARCOM); domain to re-verify. |
| [Registro Oficial](https://www.registroficial.gob.ec) | live | reachable | Official | 2020–2026 | html | daily | Free since Jan 2020 | Pre-2020 editions only via paid aggregators (excluded). |
| [Asamblea Nacional (bills database and plenary votes)](https://leyes.asambleanacional.gob.ec) ([data](https://datos.asambleanacional.gob.ec/votaciones)) | live | reachable | Official | 2009–2026 | html | weekly | To confirm | HTML only; actas archive to 1979; per-member vote detail to confirm. |
| [El Comercio (Ecuador)](https://www.elcomercio.com) | live | blocks automated clients (403) | Independent / academic | 2008–2026 | rss | daily | Copyright; headlines, dates, URLs only | Orientation: Quito; centre-right. Paywall: unknown. |
| [El Universo](https://www.eluniverso.com) ([data](https://www.eluniverso.com/rss/)) | live | reachable | Independent / academic | 2008–2026 | rss | daily | Copyright; headlines, dates, URLs only | Orientation: Guayaquil; historically independent / centre-right; sold in 2025 to a new owner group. Paywall: metered. Ownership change in 2025 flagged for stance analysis. |
| [GK](https://gk.city) | live | blocks automated clients (403) | Independent / academic | 2011–2026 | html | daily | Copyright; headlines, dates, URLs only | Orientation: independent; human rights and environment focus. |
| [Primicias](https://www.primicias.ec) | live | reachable | Independent / academic | 2019–2026 | html | daily | Copyright; headlines, dates, URLs only | Orientation: digital native; pluralist watchdog. |
| [Banco Central del Ecuador, Reporte Minero (quarterly) and export statistics](https://contenido.bce.fin.ec) ([data](https://datosabiertos.gob.ec/dataset/?organization=banco-central-del-ecuador)) | live | reachable | Official | 2010–2026 | bulk | monthly | CC BY (datosabiertos.gob.ec) |  |

## National: Guyana

| Source | Status | Direct check | Reliability | Coverage | Access | Refresh | License | Notes |
|---|---|---|---|---|---|---|---|---|
| [Parliament of Guyana (Hansard, bill status)](https://www.parliament.gov.gy/chamber-business/hansard) | live | reachable | Official | 2008–2026 | pdf | weekly | Not stated | PDF only; no structured votes; digitised start year to confirm. |
| [Demerara Waves (added replacement for Stabroek News)](https://demerarawaves.com) | live | reachable | Independent / academic | 2010–2026 | html | daily | Copyright; headlines, dates, URLs only | Orientation: independent. |
| [Guyana Chronicle](https://guyanachronicle.com) | live | reachable | State-controlled media | 2008–2026 | html | daily | Copyright; headlines, dates, URLs only | Orientation: state-owned; pro-government. |
| [Kaieteur News](https://www.kaieteurnewsonline.com) | live | reachable | Independent / academic | 2008–2026 | html | daily | Copyright; headlines, dates, URLs only | Orientation: populist, anti-establishment. |
| [Stabroek News (ceased March 2026)](https://www.stabroeknews.com) | dead | reachable | Independent / academic | 2008–2026 | html | none | Copyright; headlines, dates, URLs only | Orientation: independent, liberal-leaning. Paywall: metered. Ceased publication 15 March 2026; archive at risk, snapshot early in Phase 2. |
| [Guyana Geology and Mines Commission, commodities table 1979-2024](https://www.ggmc.gov.gy/ggmc_web/wp-content/uploads/2025/07/Commodities-Table-1979-2024-Updated.csv) | live | reachable | Official | 1979–2024 | bulk | annual | Not stated |  |
| [Bureau of Statistics Guyana, external trade](https://statisticsguyana.gov.gy/subjects/external-trade/) | live | blocks automated clients (403) | Official | 2010–2025 | html | quarterly | Not stated |  |
| [Guyana EITI reports](https://eiti.gy) | live | reachable | Official | 2017–2023 | pdf | annual | EITI open data | Suspended Feb 2023, lifted Jun 2024; 2026 validation outcome to confirm. |

## National: Paraguay

| Source | Status | Direct check | Reliability | Coverage | Access | Refresh | License | Notes |
|---|---|---|---|---|---|---|---|---|
| [Gaceta Oficial del Paraguay](https://www.gacetaoficial.gov.py) | uncertain | timeout | Official | 2010–2026 | pdf | weekly | Not stated |  |
| [Congreso Nacional, SILpy and Datos Abiertos Legislativos API](https://silpy.congreso.gov.py/web/) ([data](https://datos.congreso.gov.py/opendata/api)) | live | reachable | Official | 2007–2026 | api | weekly | Open data (reuse terms to check; civil-society complaint noted) | Bills, votes, sessions, commissions. |
| [INE Paraguay (datos.gov.py)](https://www.datos.gov.py/group/instituto-nacional-de-estadistica-ine) | live | reachable | Official | 2010–2025 | api | annual | Open data (datos.gov.py) |  |
| [ABC Color](https://www.abc.com.py) | live | reachable | Independent / academic | 2008–2026 | rss | daily | Copyright; headlines, dates, URLs only | Orientation: conservative-liberal (Zuccolillo); critical of the Cartes faction. Paywall: metered. |
| [La Nación (Paraguay)](https://www.lanacion.com.py) | live | reachable | Partisan | 2008–2026 | html | daily | Copyright; headlines, dates, URLs only | Orientation: Cartes-family owned; pro-Cartes / Colorado. |
| [Última Hora](https://www.ultimahora.com) | live | reachable | Independent / academic | 2008–2026 | html | daily | Copyright; headlines, dates, URLs only | Orientation: centrist (Grupo Vierci). |
| [Viceministerio de Minas y Energía (MOPC)](https://www.ssme.gov.py) | uncertain | connection refused | Official | 2015–2026 | html | quarterly | Not stated | Exploration-stage critical minerals only (titanium, uranium, rare earths). |
| [Banco Central del Paraguay, comercio exterior (SICEX)](https://www.bcp.gov.py/en/comercio-externo-comex-mensual) | live | blocks automated clients (403) | Official | 1994–2026 | bulk | monthly | Not stated | Query tool with XLS export; no documented API. |

## National: Peru

| Source | Status | Direct check | Reliability | Coverage | Access | Refresh | License | Notes |
|---|---|---|---|---|---|---|---|---|
| [INGEMMET, GEOCATMIN mining concessions](https://geocatmin.ingemmet.gob.pe/geocatmin/) | live | TLS error (site certificate) | Official | 2008–2026 | api | monthly | Free reuse (terms to confirm) | Shapefile download and ArcGIS REST. |
| [Defensoría del Pueblo, Reporte de Conflictos Sociales (monthly)](https://www.defensoria.gob.pe) | live | reachable | Official | 2004–2026 | pdf | monthly | Not stated | Autonomous constitutional body; mining conflicts by region and company; PDF tables extracted. |
| [El Peruano (normas legales search, SPIJ open dataset)](https://busquedas.elperuano.pe) ([data](https://www.datosabiertos.gob.pe/dataset/sistematizaci%C3%B3n-de-normas-legales-en-el-sistema-peruano-de-informaci%C3%B3n-jur%C3%ADdica-spij-desde)) | live | reachable | Official | 2011–2026 | html | daily | Open |  |
| [APN and Ositrán port statistics (Chancay)](https://www.gob.pe/apn) | live | reachable | Official | 2024–2026 | pdf | monthly | Not stated | Chancay port (COSCO) throughput; statistics page to confirm. |
| [ProInversión portfolio and INEI](https://www.proinversion.gob.pe) | uncertain | timeout | Official | 2008–2026 | html | quarterly | Not stated |  |
| [Congreso de la República, SPLEY bills portal and API (bicameral since July 2026)](https://wb2server.congreso.gob.pe/spley-portal/) ([data](https://api.congreso.gob.pe/spley-portal-service)) | live | reachable | Official | 2011–2026 | api | weekly | Not stated | Undocumented REST JSON; bills keyed by chamber (D/S) after the bicameral switch of 24 July 2026. Votes and attendance PDF only; Diario de los Debates PDF. |
| [El Comercio (Peru)](https://elcomercio.pe) ([data](https://elcomercio.pe/arc/outboundfeeds/rss/?outputType=xml)) | live | reachable | Independent / academic | 2008–2026 | rss | daily | Copyright; headlines, dates, URLs only | Orientation: conservative (Grupo El Comercio). Paywall: metered. |
| [Gestión](https://gestion.pe) ([data](https://gestion.pe/arcio/rss/)) | live | reachable | Independent / academic | 2008–2026 | rss | daily | Copyright; headlines, dates, URLs only | Orientation: business, pro-market (Grupo El Comercio). Paywall: True. |
| [IDL-Reporteros](https://www.idl-reporteros.pe) | live | reachable | Independent / academic | 2009–2026 | rss | daily | Copyright; headlines, dates, URLs only | Orientation: non-profit investigative. |
| [La República](https://larepublica.pe) | live | reachable | Independent / academic | 2008–2026 | rss | daily | Copyright; headlines, dates, URLs only | Orientation: centre-left. |
| [OjoPúblico](https://ojo-publico.com) | live | reachable | Independent / academic | 2014–2026 | rss | daily | Copyright; headlines, dates, URLs only | Orientation: non-profit investigative. |
| [MINEM, Boletín Estadístico Minero (monthly) and Cartera de Proyectos](https://www.gob.pe/institucion/minem/colecciones/6-boletin-estadistico-minero) | live | reachable | Official | 2010–2026 | bulk | monthly | Peruvian state open data (gob.pe) | PDF + XLSX annexes; cartera gives owner and country of capital per project. |
| [BCRPData API](https://estadisticas.bcrp.gob.pe/estadisticas/series/) ([data](https://estadisticas.bcrp.gob.pe/estadisticas/series/api)) | live | reachable | Official | 1990–2026 | api | monthly | Open | Exports by product (copper, gold, zinc...), JSON/CSV, no auth. |
| [SUNAT, Aduanet export statistics](https://www.sunat.gob.pe/estad-comExt/modelo_web/boletines.html) | live | reachable | Official | 2008–2026 | html | monthly | Not stated | HTML forms, firm-level; bulletins XLS. |

## National: Suriname

| Source | Status | Direct check | Reliability | Coverage | Access | Refresh | License | Notes |
|---|---|---|---|---|---|---|---|---|
| [De Nationale Assemblée](https://www.dna.sr) | live | reachable | Official | 2015–2026 | pdf | weekly | Not stated | Bills and committee reports in Dutch; verbatim debates and roll-calls not found online. |
| [De Ware Tijd](https://dwtonline.com) | live | reachable | Independent / academic | 2008–2026 | rss | daily | Copyright; headlines, dates, URLs only | Orientation: independent. robots.txt disallows automated clients (checked 2026-10-02); feed not fetched, headlines via GDELT only. |
| [Starnieuws](https://www.starnieuws.com) | live | reachable | Independent / academic | 2009–2026 | html | daily | Copyright; headlines, dates, URLs only | Orientation: independent online daily. |
| [Ministry of Natural Resources](https://gov.sr) | uncertain | reachable | Official | 2015–2026 | html | quarterly | Not stated |  |
| [General Bureau of Statistics (ABS), trade statistics](https://statistics-suriname.org/meta-data/economic-division/trade-statistics/) | live | reachable | Official | 2010–2025 | pdf | quarterly | Not stated | PDF only; Comtrade partner mirror used for series. |
| [Suriname EITI reports](https://eitisuriname.gov.sr) | moved | reachable | Official | 2016–2024 | pdf | annual | EITI open data | Site moved from eiti.sr. Suspended Mar 2025, lifted mid-2025. |

## National: Uruguay

| Source | Status | Direct check | Reliability | Coverage | Access | Refresh | License | Notes |
|---|---|---|---|---|---|---|---|---|
| [Dinamige, visualizador geominero (cadastre WMS/WFS)](https://visualizadorgeominero.dinamige.gub.uy/) | live | reachable | Official | 2015–2026 | api | quarterly | Not stated |  |
| [Parlamento del Uruguay, datos abiertos](https://parlamento.gub.uy) ([data](https://catalogodatos.gub.uy/organization/parlamento-uruguayo)) | live | reachable | Official | 1985–2026 | api | weekly | Open data (catalogodatos.gub.uy) | Bills since 1985, Diarios de Sesiones, full-text search; structured roll-call dataset to confirm. |
| [Búsqueda](https://www.busqueda.com.uy) | live | reachable | Independent / academic | 2008–2026 | html | weekly | Copyright; headlines, dates, URLs only | Orientation: centre-right / business weekly. Paywall: True. |
| [El Observador](https://www.elobservador.com.uy) ([data](https://www.elobservador.com.uy/rss)) | live | reachable | Independent / academic | 2008–2026 | rss | daily | Copyright; headlines, dates, URLs only | Orientation: centre-right / business. Paywall: metered. |
| [El País (Uruguay)](https://www.elpais.com.uy) | live | blocks automated clients (403) | Independent / academic | 2008–2026 | html | daily | Copyright; headlines, dates, URLs only | Orientation: conservative-liberal; historically Partido Nacional. Paywall: True. |
| [la diaria](https://ladiaria.com.uy) ([data](https://ladiaria.com.uy/feeds/articulos)) | live | reachable | Independent / academic | 2008–2026 | rss | daily | Copyright; headlines, dates, URLs only | Orientation: independent left; member-supported. |
| [Banco Central del Uruguay, comercio exterior](https://www.bcu.gub.uy/Estadisticas-e-Indicadores/Paginas/Comercio-Exterior.aspx) | live | TLS error (site certificate) | Official | 2000–2026 | bulk | monthly | Open data |  |
| [Uruguay XXI, export series (company-level, NCM10)](https://www.uruguayxxi.gub.uy/es/centro-informacion/exportaciones/) | live | reachable | Official | 2001–2026 | bulk | monthly | Open |  |

## National: Venezuela

| Source | Status | Direct check | Reliability | Coverage | Access | Refresh | License | Notes |
|---|---|---|---|---|---|---|---|---|
| [SOS Orinoco (Arco Minero monitoring)](https://sosorinoco.org/en/reports/) | live | reachable | Independent / academic | 2018–2026 | pdf | quarterly | Copyright; cite | Satellite monitoring of illegal mining; geolocated. |
| [Transparencia Venezuela (economías ilícitas, gold reports)](https://transparenciave.org/economias-ilicitas/) | live | reachable | Independent / academic | 2016–2025 | pdf | annual | Copyright; cite | NGO in exile. |
| [Asamblea Nacional (VI Legislature, installed Jan 2026)](https://www.asambleanacional.gob.ve) | live | reachable | Official | 2021–2026 | html | weekly | Not stated | Contested legitimacy flag recorded (brief section 7h). Transcripts to confirm. |
| [Asamblea Nacional elected 2015 (opposition-led; Comisión Delegada)](https://www.asambleanacionalvenezuela.org) | uncertain | reachable | Official | 2016–2025 | html | monthly | Not stated | Contested legitimacy flag; holds 2016-2020 gacetas and acuerdos (incl. on the Arco Minero); post-2025 activity to confirm. |
| [Banco Central de Venezuela](https://www.bcv.org.ve) | live | TLS error (site certificate) | Official | 2008–2026 | html | quarterly | Not stated | Publication resumed Mar-Apr 2026 after a ten-year gap (2015-2025). |
| [Efecto Cocuyo](https://efectococuyo.com) | live | reachable | Independent / academic | 2015–2026 | html | daily | Copyright; headlines, dates, URLs only | Orientation: independent; foundation-funded; staff partly in exile. Blocked inside Venezuela until Sept 2026. |
| [El Pitazo](https://elpitazo.net) | live | reachable | Independent / academic | 2014–2026 | html | daily | Copyright; headlines, dates, URLs only | Orientation: independent / citizen journalism. |
| [Runrunes](https://runrun.es) | live | reachable | Independent / academic | 2010–2026 | html | daily | Copyright; headlines, dates, URLs only | Orientation: independent. |
| [Tal Cual](https://talcualdigital.com) | live | blocks automated clients (403) | Independent / academic | 2008–2026 | html | daily | Copyright; headlines, dates, URLs only | Orientation: independent, opposition-leaning. Still blocked inside Venezuela as of Sept 2026. |
| [Ministerio del Poder Popular de Desarrollo Minero Ecológico / CVM](https://desarrollominero.gob.ve) | live | reachable | State-controlled media | 2016–2026 | html | monthly | Not stated | No production time series; claims only. Arco Minero decree 2016. |
| [Venezuela trade via partner-reported (mirror) data in UN Comtrade](https://comtradeplus.un.org) | live | reachable | Official | 2008–2026 | api | monthly | UN terms | Venezuela's own reports end around 2013; all later rows are mirror data and labeled. |
