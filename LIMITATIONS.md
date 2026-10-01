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
  is think-tank compiled; **DFC** data starts in FY2019 (OPIC legacy only partially);
  **EXIM** records authorizations, not disbursements.
- **USGS MCS** world tables mark the latest year as estimated (`value_type = estimated`);
  reserves are a point estimate for the edition's data year.
- **Finance deduplication** is conservative (amount within 10 percent, same year and
  origin); the same loan reported with different amounts or years by two databases appears
  twice, with both sources visible.
- **BU CODF** (policy-bank loans 2008–2024) requires a signed data-use agreement; until the
  owner obtains it, Chinese policy-bank lending comes from AidData (to 2021) only.
- **Mineral tagging** of finance and deal records is keyword-based on titles, sectors and
  descriptions; events without a recognisable mineral keyword are kept with `mineral = none`.

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
