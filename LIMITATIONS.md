# Limitations

Known gaps and biases. This file is the honest counterpart to the data: anything
listed here is also surfaced on the methodology page.

## Status

Phases 2, 3a, 4 and 5 live (2026-10-09). The facts layer (actions, trade, governance) is real where
the banner says so; parliament and media records are real with text-model outputs tagged by validation
status; the influence index, concentration, say–do gap, flags, event studies, regressions and finance
network are computed from the warehouse and labelled per block; forecasts come from backtested models
and are labelled with their scores; the written analysis is generated from named indicators, with the
owner's own text shown apart where it exists. All six phases are live.

## Phase 2a data caveats

- **Comtrade keyless mode** uses the public preview endpoint (500 records per call). Annual
  HS6 flows fit; monthly and tariff-line data wait for a free key. Reporters that have not
  submitted a year show as missing, not zero. Venezuela is mirror-only after ~2013.
  The preview endpoint also rations calls per address and day: a second Comtrade fetch on
  the same day from the shared runner address is refused (HTTP 429/403). The adapter then
  stops after three refused calls, reports `failed`, and the previous release's trade flows
  stay in place until the next run.
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
  As of 2026-10-03: El Mostrador and OjoPúblico publish no discoverable feed (15 common paths
  answer 404, the home page declares none), Emol resets automated connections, De Ware Tijd's
  robots.txt forbids automated clients. Feeds a publisher declares in its page head on a
  syndication host (BioBíoChile on FeedBurner) are accepted; feed links found elsewhere on a
  page must stay on the publisher's own site.
- **Roll-call votes** are live for Brazil's Câmara (963 roll calls, 22,580 member votes), Brazil's
  Senado (few matters reach the floor) and Chile's Cámara (148 roll calls, 16,432 member votes).
  Argentina's Diputados open-data roll calls stop at period 137 (2019) and name the bill only in
  the vote's title, so few of the 1,233 bills link to a vote. Chile's Senado public services
  answered no votes for any bill kept (both `votaciones.php` and the tramitación document);
  Argentina's Senado, Colombia, Peru and Uruguay publish votes only in PDF minutes or not at all.
- **GDELT**: the English (Guyana) and Dutch (Suriname) queries return articles; every Spanish
  and Portuguese window has answered an empty JSON object (`{}`) in all three forms tried
  (accented terms, ASCII terms, and both with `sourcelang:`), so there is no Spanish- or
  Portuguese-language media history yet. The cause is not identified: the sandbox cannot reach
  GDELT, and the exact request URLs are in the run manifest (`pipeline/tests/fixtures/gdelt/`)
  for anyone to open in a browser. From 2026-10-03 each press run records eight one-term probes
  (`diagnostics` in the manifest: term alone, with `sourcelang:`, with `sourcecountry:`, OR
  group, phrase) to isolate the operator that empties the query. GitHub runners share egress
  addresses, so GDELT throttles them (12 HTTP 429 responses per run even at 10 s spacing); the
  adapter pauses on a throttle and stops after a time budget, so the 2017→ backlog (1,783
  windows) fills over many weekly runs unless a long manual backfill is dispatched when the
  address is not throttled.
- **Colombia titles**: the national AnnA cadastre on datos.gov.co is a map layer that the portal
  refuses to export ("Unexportable view"); the registry's dataset id is the title annotations
  table and is never stored as concessions. Colombia's concessions stay missing until the ANM's
  own map service is wired.
- **Bolivia, Guyana, Suriname, Venezuela**: no machine-readable legislative records; the site
  shows the reason, not an empty list.
- **Uruguay**: parlamento.gub.uy answers HTTP 403 to automated clients and is not reachable
  from abroad in a browser either (checked 2026-10-03). The national catalogue
  (catalogodatos.gub.uy) is no alternative: its API lists organisations but answers every
  dataset search with zero results, and a `*:*` probe returns one public dataset in total, so
  either the catalogue hides its datasets from automated clients or it has been emptied; the
  adapter records the organisations, packages and that total on every run and accepts a
  hand-supplied export (`data/manual/ury_asuntos.csv` or `URY_PARLAMENTO_FILE`) should one
  become available. Until then the site shows the reason on Uruguay's Parliament tab. **Ecuador**: the
  plenary-votes page is a script-rendered application whose data service is not exposed; votes
  stay missing until a documented endpoint is found. **Paraguay**: the open-data API is documented
  on its index page (`/opendata/api/data/proyecto`) and is used; its reuse terms are listed as
  "to confirm" in the registry.
- **Translations, stance, tone and narratives are model outputs** (Phase 3, see below); the original
  text is always shown and every value carries the model and codebook version that produced it.
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

## Phase 3 text-analysis caveats

- **Unit of analysis is short text.** Legislative records are coded from the title plus the
  summary a legislature publishes (Brazil's ementa, Colombia's objeto); most Argentine, Chilean,
  Peruvian and Paraguayan records are a title of up to 400 characters, often truncated. Headlines
  are coded alone. Nothing is inferred from full text, which is not stored.
- **Zero-shot baseline until validated.** Stance comes from a multilingual NLI model choosing
  between three hypotheses per actor (favourable, critical, neutral mention); ±2 versus ±1 is a
  probability threshold (0.75) and a winning probability below 0.5 is read as 0, not learned
  distinctions. The first full run (2026-10-04) showed the baseline's bias: the neutral hypothesis
  never won, and three quarters of the records naming the United States came out strongly positive,
  largely treaty, loan and cooperation records that the codebook also reads as positive but not
  necessarily strongly so. Tone comes from a sentiment model trained on tweets. Until the hand-coded
  sample exists every value is tagged "not yet validated" and should be read as indicative.
- **Applicability is a keyword rule.** A stance toward an actor is scored only when the keyword
  rule finds the actor in the text. The first rule flagged the United States in 170 of the 300
  sampled records where a coder found it applicable in 60 (mostly loan authorisations in US
  dollars), so currency phrases, Mexico's official name and firm or region names containing
  "America" are now blanked before matching (precision 0.82, recall 0.92 against coder 2;
  China 0.72 and 1.0, the misses being Beijing as a signing place and Chinese nationals). The
  site's `mentions` flags still show the ingestion filter's reading; stance applicability uses the
  refined rule. The adjudicated sample will give the definitive figures.
- **Selection bias into the series.** The corpus is keyword-selected at ingestion (mining and
  mineral terms, actor terms); mean stance per year describes the selected records, not a
  legislature's whole agenda.
- **Validation is one human and one LLM coder** (the owner and Claude in development sessions,
  blind to each other), 300 documents, one third held out; agreement statistics are published with
  n. This is not a multi-human coding team.
- **Trained head on few labels.** The embeddings-plus-logistic-regression classifier learns from
  about 200 adjudicated records; it replaces the baseline on the site only if it beats it on the
  held-out split, and the methodology page shows both.
- **Narratives** are automatic clusters labelled by keywords; labels can be overridden in
  `pipeline/config/topic_labels.yaml`. Press narratives need at least 100 headlines per corpus,
  which no country has until the GDELT Spanish/Portuguese history arrives.
- **Machine translation** of titles (opus-mt) is unmeasured for quality; summaries are not
  translated by default.

## Phase 4 quantitative caveats (added 2026-10-09)

- **The index measures recorded ties, not intent or influence as such.** Six components per actor
  (export and import shares, official finance / GDP, debt / GDP, UN voting agreement, legislative
  stance); what the warehouse does not record is not in the index. Nothing is imputed: a component
  beyond its source's coverage is unavailable and the index rests on the others (never fewer than
  three), and the number and names of the components behind every value are stored and shown.
- **The two sides are not symmetric in the data.** US official finance is DFC/OPIC only (EXIM, CGIT
  and IDB DPI files pending), Chinese finance (AidData 3.0) ends in 2021, debt by creditor exists for
  China only (World Bank IDS, nine countries, to 2024), and the legislative stance is the zero-shot
  baseline until the sample is adjudicated. Both actors share one scale, so US values are low
  because US recorded ties are small relative to China's; from 2022 the Chinese index rests on trade,
  debt and diplomacy only.
- **Trade partners are three.** Comtrade was fetched keyless for the United States, China and the
  world total; no HHI over all destinations, no mirror comparison yet. A partner row absent from a
  reporter's answer for a year it did report is read as no recorded flow (noted on the row).
  Venezuela reports no trade; Uruguay's reported trade stops in 2011; Paraguay's and Suriname's
  mineral exports are tiny, so their shares swing.
- **Sensitivity band.** The 5th–95th percentile across 500 draws of weights (Dirichlet around equal)
  and normalisations (min–max or percentile rank) is wide and skewed upward for countries with small
  raw values that rank high: it mostly reflects the normalisation choice. Rank stability (mean
  Spearman correlation with the baseline ranking) is 0.69 on the first run.
- **Say–do gap** needs at least five scored legislative records in a year, which exist mainly for
  Brazil and Argentina; the rhetoric side inherits every Phase 3 caveat. **Flags** are rules with
  fixed thresholds (DECISIONS 48), not findings; the `strongly_indicated` finance-without-trade rule
  fires where a loan was never about minerals, which is itself informative but not an anomaly.
- **Network** links lenders to the receiving agencies named in the records; 846 of 1,699 events name
  no recipient and are counted, not drawn. No ownership links yet (contracts carry no company names;
  cadastres exist for Ecuador only).
- **Event studies** (Phase 4b) rest on a draft event list: `pipeline/config/events.yaml` holds 19 dated
  events of which 10 are flagged for verification and none is marked reviewed yet; every result carries
  the event's status and the site marks draft rows. Annual export shares, two-year windows and placebo
  distributions of about ten values per country make the placebo p coarse (the smallest attainable is
  about 0.08); events of 2025–2026 have no post-event years yet. Policies respond to the same world the
  outcomes do, so nothing here is causal.
- **Panel regressions** (Phase 4b) use 131–133 country-years over eleven countries, 2009–2021 (the
  finance regressor ends with AidData's coverage); within R² is low (0.02–0.19) and most coefficients
  are indistinguishable from zero under the wild cluster bootstrap. The one robust association on the
  first run (imports from the United States rise with electoral democracy, two-way fixed effects) is a
  conditional correlation across a handful of democratic transitions, not a mechanism.

## Phase 5 forecasting caveats (added 2026-10-09)

- **Seventeen annual points, five-year horizon.** Only simple models are fitted; the published one is
  chosen by backtest CRPS against naive persistence, and for two of the four targets (the China index,
  the US export share) nothing beat persistence, so persistence is what is shown. Improvements where a
  model does win are modest (5–7% CRPS).
- **Bands are too narrow for the share forecasts:** in the backtests the 80% bands of the published
  share-to-China model covered 69% of outcomes and the 95% bands 78%; the index bands covered 77–85%
  and 86–91%. Read every band as indicative and widen it mentally.
- **The index forecast compounds model layers:** it forecasts a composite that is itself a model output
  with its own sensitivity band; the export-share forecast rests on facts and is the one to prefer.
- **Scenarios are stated shifts, not causal simulations:** no elasticity or policy response is estimated
  (Phase 4b found no robust causal handle), so a scenario shows what a given yearly shift would do to
  the paths and nothing more.
- **Coverage:** ten countries have index forecasts and nine have share forecasts (Uruguay's trade stops in
  2011, Venezuela reports none, Paraguay's shares are too erratic for the share target).

## Phase 6 written-analysis caveats (added 2026-10-09)

- **Generated briefs restate indicators; they do not interpret.** Every sentence is a template bound to
  the ids it cites, so it inherits every caveat above (three trade partners, finance ending in 2021,
  the zero-shot stance baseline, draft events, narrow forecast bands). A fluent sentence is not a
  stronger finding than the number behind it.
- **No causal language is generated.** Event results are called associations and regressions
  conditional correlations; the templates cannot say why anything happened.
- **Thresholds are conventions.** "Broadly flat" means under 2 index points or 3 share points over five
  years; "sudden" and "large" follow the flag rules of DECISIONS 48.
- **The human layer is opinion, labelled as such,** and exists only where the owner has written a file;
  as of this release none exists.

## Flow map caveats (added 2026-10-09)

- The money arcs draw documented finance commitments only, summed by country, origin and year from the de-duplicated finance events (`flows.json`, DECISIONS 56). Chinese finance comes from AidData's Global Chinese Development Finance dataset and ends in 2021; US finance is DFC only until the EXIM, CGIT and BU CODF files are supplied. A window that lies beyond a source's last year is flagged on the page rather than drawn empty.
- 561 of the 1,699 finance events carry no published amount: they are counted in the arc's popup and table but add no width. Swap-line drawdowns and amounts from lower-confidence records are listed apart and never added to the drawn amount.
- The trade arcs use reported exports only (UN Comtrade, reporter's own data); mirror data is not used. Venezuela reports no trade and therefore has no trade arc.
- Arcs are schematic: they run from a country centroid to Washington or Beijing as anchors, not along shipping or financing routes, and the width scale is shared across countries within one view.
- The world basemap is Natural Earth 1:10m simplified to about 3% of its vertices; it is a backdrop, not a boundary reference. Country labels are hidden when the map is zoomed out to the world view.
- The comparison panel uses the same inputs as the rest of the site (index values are model outputs; shares and finance totals are facts) and shows a dash where a value is missing.

## Political statements dataset caveats (added 2026-10-09)

- The statements block comes from a hand-supplied dataset (DECISIONS 58) collected by AI research agents with web search under a fixed codebook. Every record carries the source URL consulted and a verification level, but 339 of 395 records are `secondary_reported` (a media report of the statement) and 2 are `unverified`; only 54 were seen on a primary page.
- The stance codes toward China and the United States (and the themes) are the dataset's own interpretive coding, not validated by a second coder and not a model output of this project. The site labels them "coded under the dataset's codebook" and keeps them out of the influence index and the say–do gap. The yearly stance means rest on few statements in most country-years (the count is shown next to every mean).
- Coverage is uneven: Chile, Peru, Brazil, Argentina and Bolivia have 49–65 records each, Ecuador 16 and Colombia 12; Guyana, Paraguay, Suriname, Uruguay and Venezuela have none, and the dataset's own notes list Chinese embassy statements and several US ambassadors as under-represented. Records before 2022 are few (23 in 2019–2021). Mexico (43) and Panama (13) records are outside this site's twelve countries and are not shown; 23 region-wide records appear on the region page.
- 100 records carry no quote (only a summary); quotes are at most 30 words and translations may be the dataset's own. Speaker roles are as at the statement date.

## Insights page caveats (added 2026-10-09)

- The contrasts set layers against each other that overlap thinly: coded statements, legislative stance and the index coincide only for Argentina 2022–2025, Brazil 2024–2025, Chile 2024 and Peru 2024; a third of the statements are from 2026, a year with no reported trade or finance yet. Every contrast carries its `n` and the page's evidence meter says when a finding rests on fewer than ten records, one year, press tone, zero-shot stance or draft events.
- Scales differ and are never added: statements −1..+1 (the dataset's codebook, not validated), legislative stance −2..+2 (zero-shot model, not validated; shown halved where it meets the statements), media tone −1..+1, the index 0–100.
- "Who talks, who pays" compares statement counts gathered by web search (which favours prominent US voices) with documented commitments that cover every sector in both sources (AidData and the DFC); the part tagged to a mineral by the adapters is shown apart. AidData ends in 2021 and the DFC record is the only US source, so the money ratio runs on 2015–2021.
- The parity gap, the redirect and price levers and the index what-if are arithmetic at constant totals and volumes: they say what would have to change hands, not whether it could. The what-if index may use components the published year lacks (finance beyond a source's coverage); the count is shown next to the published value.
- The scenario blend interpolates the published paths linearly; the pipeline's shifted paths were clipped at 0 and 1 (or 0 and 100), so an intermediate blend is exact except near those bounds. The shock echoes are averages of post-minus-pre changes around draft events whose windows overlap and whose years coincide with price swings: a direction, not an effect.
- The US "attention" series counts documents selected by title filters (Congress.gov bills, Federal Register notices and rules); a change in the filters changes the counts.
- The interpretation on the page is AI-drafted from the indicators and not yet reviewed by the project owner (DECISIONS 61); the label says so until the owner sets `reviewed: true`.

## Owner items done by an AI session (added 2026-10-09)

Of the eight items on the owner's list, an AI session did the ones that need no account, signature
or hands, and labelled each:

- The interpretation files for the twelve countries and the region are AI-drafted (DECISIONS 62): the
  site says so on each, and every claim cites an indicator id so the owner can check it; the numbers
  quoted are those of the 2026-10-09 export.
- The ten flagged events were verified from web-search results that cite the official documents,
  not from the documents themselves (the session could not open them); `url`, dates and notes are in
  `pipeline/config/events.yaml` and `status` stays `draft` until the owner reads them (DECISIONS 63),
  so the event echoes on the Insights page still carry the draft label.
- Not done, by design or by lack of access: the `COMTRADE_KEY`, Congress.gov and Census secrets (the
  owner's registrations); the BU CODF file (signed agreement) and AEI's tracker (403 challenge, no
  redistribution); coder 1 of the validation sample (an AI coder 1 would make "validated against
  hand-coded documents" false, DECISIONS 62); a real phone (a touch-emulation pass stands in).

## Method limitations

- Stance and topic classification: see "Phase 3 text-analysis caveats" above (one human and one
  LLM coder, 300 documents, zero-shot baseline, linear head on frozen embeddings).
- The influence index is a composite indicator; its ranking is sensitive to weighting and
  normalisation choices, which is why the sensitivity band and the rank stability are shown with it
  (see "Phase 4 quantitative caveats").
- Event studies and difference-in-differences designs cannot establish causality
  where treatment timing is endogenous to politics; results will be labeled as
  associations.
- Forecasts to 2030 come from the model that beat naive persistence in the backtests, or from
  persistence itself where none did; scenarios are stated yearly shifts (see "Phase 5 forecasting
  caveats").

## Known biases in sources

- Press outlets have documented political orientations (recorded per outlet in
  the registry). Semana (Colombia) changed orientation after its 2020 takeover;
  El Universo (Ecuador) changed ownership in 2025.
- Xinhua, People's Daily, Chinese embassy statements and Guyana Chronicle are
  state-controlled and labeled as such.
- AEI's China Global Investment Tracker is compiled by a think tank; its data is
  widely used but is labeled "analysis-sourced".
- OCMAL is an activist network; its conflict database is labeled partisan.

## Congress.gov (added 2026-10-07)

- Bills only, titles and the latest action text (no bill text), from the 110th Congress (2007) on, selected by
  title keywords: a bill about critical minerals whose title does not say so is missed. Votes, amendments and
  committee records are not collected. The date shown is the date of the bill's latest action. Titles about
  medals and honours, "data mining" and tariff-duty suspensions are excluded by rule.
