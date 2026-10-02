# Limitations

Known gaps and biases. This file is the honest counterpart to the data: anything
listed here is also surfaced on the methodology page.

## Status

Phase 2a (international and US pipelines). The facts layer (actions, trade, governance)
is replaced by real data country by country as the ingestion workflow runs; the banner
and each panel state whether a block is real or sample. Model outputs, parliament and
media layers are still sample.

## Phase 2a data caveats

- **Comtrade keyless mode** uses the public preview endpoint (500 records per call). Annual
  HS6 flows fit; monthly and tariff-line data wait for a free key. Reporters that have not
  submitted a year show as missing, not zero. Venezuela is mirror-only after ~2013.
- **Mirror data** (partner-reported) includes freight and insurance and transshipment;
  `trade_discrepancy` flags ratios outside 0.5–2 as `large_discrepancy` rather than
  reconciling them.
- **AidData GCDF 3.0** ends with 2021 commitments; **AEI CGIT** has a US$100m threshold and
  is think-tank compiled; **DFC** combines DFC (FY2020 onward) and OPIC legacy records;
  **EXIM** records authorizations, not disbursements.
- **USGS MCS** world tables mark the latest year as estimated (`value_type = estimated`);
  reserves are a point estimate for the edition's data year. The 2026 data release is one
  consolidated long-format file; the first live run parsed it as a wide table and produced
  no rows (fixed; a re-run is needed).
- **World Bank WGI** comes from the World Bank Data360 API (dataset `WB_WGI`), because the
  classic API (database 3) answers "Data not found" and govindicators.org serves an HTML page
  instead of its dataset file to a non-browser client. Only the estimate (−2.5 to 2.5) is kept;
  Data360's other breakdown codes (`WGI_SC`, `WGI_SR`, bounds, standard error) are undocumented
  and are not shown until their meaning is confirmed.
- **EXIM** and **IDB DPI**: in October 2026 the data.gov catalog API answered 404 on every
  CKAN path, its search page is script-rendered, and data.iadb.org answered 202 "preparing"
  to every download request for five minutes. Both adapters try the open paths first and
  then a hand-supplied file (`EXIM_FILE_URL`, `DPI_FILE_URL`, or a file under `data/manual/`
  where the license allows); until one is provided, EXIM authorizations and executive
  ideology are missing.
- **DFC** data goes back to OPIC records from the 1960s (schema widened to 1900); the
  project only analyses 2008 onward.
- **Finance deduplication** is conservative (amount within 10 percent, same year and
  origin); the same loan reported with different amounts or years by two databases appears
  twice, with both sources visible.
- **BU CODF** (policy-bank loans 2008–2024) requires a signed data-use agreement; until the
  owner obtains it, Chinese policy-bank lending comes from AidData (to 2021) only.
- **AEI China Global Investment Tracker** cannot be fetched by a runner: aei.org serves a Cloudflare browser challenge (HTTP 403) to automated clients. The adapter runs when the owner supplies a hand-downloaded copy (`CGIT_FILE_URL`).
- **Mineral tagging** of finance and deal records is keyword-based on titles, sectors and
  descriptions; events without a recognisable mineral keyword are kept with `mineral = none`.

## Phase 2b data caveats

- **Keyword selection.** Legislative records and headlines enter the warehouse only when a
  mining or mineral term (es/pt/en/nl) or a China/US actor term matches the title or summary.
  Recall is limited by the term lists (`pipeline/scm/ingest/keywords.py`, versioned); the terms
  that matched are stored with every row so the filter can be audited and tightened.
- **Press depth.** RSS feeds expose roughly the last 20–100 items, so the headline record is
  continuous only from the week the press workflow started; earlier years come from the GDELT
  index (2017 onward, larger outlets over-represented, 250 results per query window). GDELT
  dates are indexing dates (`date_precision = seen`), not publication dates.
- **Outlets without a feed** (and outlets GDELT does not index under the registry's domain)
  have no headlines yet; the manifest of each run lists unmatched domains and failed feed URLs.
- **Roll-call votes** exist for Brazil (both chambers, planned), Chile (planned), Argentina's
  Diputados (planned) and, where exposed, Paraguay and Ecuador. Argentina's Senado, Colombia,
  Peru and Uruguay publish votes only in PDF minutes or not at all.
- **Bolivia, Guyana, Suriname, Venezuela**: no machine-readable legislative records; the site
  shows the reason, not an empty list.
- **No translations or stance** until Phase 3; records are shown in the original language.
- **Incremental tables** (documents, votes, concessions) merge with the previous data release; a
  failed run publishes no release, so one press week can be lost.
- **National trade series by mineral** (Argentina SIACAM, Uruguay XXI) and sources that answer
  403 to runners (Comex Stat, Chile Aduanas) or need registration (DANE microdata) are deferred.

## Verification caveat (Phase 0)

Source verification was done from a sandbox whose network policy blocks direct
access to every host except GitHub and PyPI. Statuses in `SOURCES.md` therefore
rest on search-engine results, GitHub mirrors and package indexes dated 2025–2026,
not on direct HTTP checks. Entries marked `uncertain` were not confirmable. The
first scheduled ingestion run in GitHub Actions will re-check every URL and update
the registry.

## Structural gaps by country

- **Bolivia**: no open-data API for the Asamblea Legislativa; no roll-call or
  transcript datasets; Gaceta Oficial full text is paywalled (we use lexivox.org).
  Parliament tab will rely on press reporting of legislative outcomes.
- **Guyana**: Hansard exists only as PDF; no structured votes. Stabroek News ceased
  publication in March 2026, so media coverage after that date rests on fewer
  outlets, one of which (Guyana Chronicle) is state-owned.
- **Suriname**: trade statistics are PDF only; legislature publishes bills and
  committee reports but verbatim debates and roll-calls were not found online.
- **Venezuela**: official statistics were absent from ~2015 to early 2026;
  partner-reported (mirror) trade data is used throughout and labeled. Two bodies
  claim to be the National Assembly; both are recorded with a legitimacy flag.
  Independent media operated from exile and were blocked inside the country until
  September 2026.
- **Paraguay and Uruguay**: little or no critical-mineral extraction; their value
  to the analysis is political (Taiwan recognition; China FTA and Mercosur
  dynamics), so the Actions tab will be thin by nature.
- **Colombia**: Senate website blocks automated access; roll-call votes exist
  only inside PDF records.

## Data gaps that affect every country

- **Lithium prices**: no free licensed benchmark. We show USGS annual averages and
  customs-derived unit values, which mix grades and contract types.
- **Chinese policy-bank lending**: no loan-level disclosure by CDB or China Exim.
  We rely on BU CODF (to 2024) and AidData (commitments to 2021), which only
  cover sovereign and public borrowers.
- **Chinese FDI**: MOFCOM bulletins attribute most outward investment to Hong
  Kong and the Caribbean; ultimate-destination figures come from AEI CGIT and Red
  ALC-China, which are compiled from press and filings and use a US$100m
  threshold (CGIT).
- **Ownership chains**: SEDAR+ and HKEX forbid scraping; chains for Canadian and
  Hong Kong listed intermediaries are built from SEC cross-listings and company
  reports, so smaller juniors may be missed.
- **Mirror data**: partner-reported trade includes freight and insurance (CIF vs
  FOB) and transshipment, so discrepancies are expected and are reported rather
  than reconciled.
- **GDELT**: machine-coded, noisy, and biased toward English-language and larger
  outlets; used for 2015+ volume/tone context, never as a primary count.
- **ACLED** covers Latin America only from 2018.
- **USGS Minerals Yearbook** country chapters lag two to three years.

## Method limitations (to be expanded in later phases)

- Stance and topic classification will be done by an open-weight model fine-tuned
  on a sample coded by one human and one LLM coder (Claude, inside development
  sessions). Agreement statistics will be published; this is not the same as a
  multi-human coding team.
- The influence index is a composite indicator; its ranking is sensitive to
  weighting choices, which is why a sensitivity analysis will be shown alongside.
- Event studies and difference-in-differences designs cannot establish causality
  where treatment timing is endogenous to politics; results will be labeled as
  associations.
- Forecasts beyond 2026 are conditional on stated scenarios and are shown only
  when a model beats naive baselines out of sample.

## Known biases in sources

- Press outlets have documented political orientations (recorded per outlet in
  the registry). Semana (Colombia) changed orientation after its 2020 takeover;
  El Universo (Ecuador) changed ownership in 2025.
- Xinhua, People's Daily, Chinese embassy statements and Guyana Chronicle are
  state-controlled and labeled as such.
- AEI's China Global Investment Tracker is compiled by a think tank; its data is
  widely used but is labeled "analysis-sourced".
- OCMAL is an activist network; its conflict database is labeled partisan.
