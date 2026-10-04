# Status log

One entry per phase: what runs, what is missing, what broke, recommendation.

## Phase 3a — Text analysis infrastructure and zero-shot baseline (2026-10-04; first full run live)

**First full run (text-analysis.yml, 2026-10-04 12:25–14:01 UTC, 96 minutes of text steps on the 4-vCPU runner, 3.7 GB of model weights now cached)**
- 5,466 titles machine-translated (6 English records skipped), 5,472 documents classified (1,194 actor stances scored, the rest "not applicable"), 5,472 embeddings, 12 parliament topics; press narratives not estimated (22 de-duplicated headlines, fewer than the 100 required). Site layers `parliament` and `media` are `real`, tagged "Zero-shot baseline · not yet validated"; release `data-v2026.10.04.2` (16 MB) carries the model-output tables.
- Stance distribution before calibration: US −2: 36, −1: 59, +1: 143, +2: 723; China −2: 24, −1: 31, +1: 59, +2: 119; no zeros, because the "neutral mention" hypothesis never won. A third threshold (winning probability below 0.5 → 0) was added (DECISIONS 42) and the classification re-run (111 minutes for the classify step alone: the NLI model scores records one at a time, an optimisation for the next iteration). It changed little: 21 zeros, 722 US +2 remain. The model is confident, not uncertain; the bias sits in how its hypotheses read procedural and treaty language, which only the hand-coded sample and the trained head can correct.

**What runs**
- `scm/text/`: machine translation of titles (opus-mt), zero-shot stance toward the US and China (mDeBERTa-xnli, scored only when the actor is named) and tone (multilingual sentiment), sentence embeddings, k-means narratives labelled by class-based TF-IDF, per-year series; `python -m scm classify`; eight model-output tables with model, run and codebook version; `warehouse.upsert` (newest row wins). Deterministic fakes (`SCM_TEXT_FAKE=1`) cover the code paths in 6 new tests; 126 pipeline tests pass.
- Exporter: translations, stance, tone, `classifier` and `translation` blocks per record, `stance_series` / `volume` / `narratives` / `text_model` per layer file, `validation.json`, layers `real` once labelled; site: Parliament and Media tabs show the model outputs tagged "Zero-shot baseline · not yet validated" (or "Validated · κ=…"), null stance on a coded record reads "not applicable", English titles are labelled machine translation, the methodology page reads the validation metrics live.
- `text-analysis.yml` (Thursdays and on demand; CPU torch, cached weights, same release restore and guard as ingestion).

**Validation so far (Phase 3b)**
- The 300-document sample is drawn (BRA 196, ARG 57, CHL 18, COL 12, PER 8, GUY 6, PRY 3; 221 bills, 57 hearings, 22 headlines; 19 name both actors, 87 neither) and coder 2 (Claude, in session) has coded all of it (`data/manual/validation/coder2_v1.csv`). Coder 2's reading: the United States applicable in 60 records (stance −1: 7, 0: 27, +1: 25, +2: 1), China in 43 (−1: 14, 0: 18, +1: 11); dominant topics regulation/procedure (109), geopolitics and security (46), trade (36), environment (35), investment (32).
- That reading exposed the ingestion flag's low precision for the United States (60 of 170 flagged records; loan authorisations in dollars) and led to the refined applicability rule (DECISIONS 43), followed by a forced reclassification.

**What is missing**
- The owner's coding (`coder1_v1.csv`), adjudication, the agreement statistics, the trained head and the published metrics; a longer headline record for press narratives and tone; summaries are not translated (titles only); the NLI step should batch its hypothesis pairs (111 minutes for 5,472 records). Press narratives and tone series need a longer headline record (GDELT Spanish/Portuguese still empty). Summaries are not translated (titles only).

**What broke and was fixed**
- See Phase 2b: the overwritten data release (DECISIONS 36) had to be repaired before any model output could reach the site. The first recovery run was then stopped by the new guard itself: the 2 October release still carried Colombia's 6,769 annotation rows as concessions, which the fixed adapter correctly clears, so `concession` fell by more than a quarter. A dispatch input `allow_regression` now turns the guard into a warning for intentional drops.

**Recommendation**
- Run the text workflow with `limit: 200` first, then in full; review the codebook before coding starts.

## Phase 2b — National adapters (2026-10-02 → 2026-10-03, done with known gaps)

**What runs (live, committed to `main`; counts from the 2026-10-03 runs)**
- Text tables `document` (bills, hearings, votes, news; news rows carry no summary by schema), `vote`, `vote_member`, `concession`, `media_volume`; incremental merge with the previous data release; `document_dedup` merges the same article seen through RSS and GDELT. Shared modules: feed parser and feed-index discovery, versioned multilingual keyword filter (`2026.10`), robots.txt cache (disallow recorded as `skipped`), XML fixtures, `legislature` / `press` / `national` groups, weekly `ingest-press.yml`, per-adapter memory cap and wall-clock budget, progress lines with memory.
- Legislatures (document / roll calls / member votes): Brazil Câmara 2,931 / 963 / 22,580; Brazil Senado 893 / 9 / 729; Chile Cámara 173 / 148 / 16,432; Argentina Diputados 1,233 / 2 / 514; Colombia Cámara 76 bills; Peru SPLEY 140 bills; Paraguay SILpy 4 bills. On the site: ARG, BRA, CHL, COL, PER, PRY show real records; BOL, GUY, SUR, VEN show the no-records note.
- National statistics and cadastres: Ecuador cadastre 15,447 titles; Peru BCRP 817 production rows (annual quantities by mineral); Cochilco 709 rows; Guyana GGMC 95 rows. Warehouse totals: document 5,473; vote 1,122; vote_member 40,255; concession 15,447; media_volume 222 (plus the Phase 2a tables).
- Press: 23 of 27 RSS adapters deliver (feeds found by discovery for Folha, El Tiempo, La Nación and others; BioBíoChile's FeedBurner feed from 2026-10-03); headlines are recent-only until GDELT history arrives. GDELT's English and Dutch queries return articles (Guyana, Suriname); every Spanish and Portuguese window answers an empty JSON object in all three query forms tried (accented, ASCII, with `sourcelang:`), and the runner address is throttled (12 HTTP 429 per run), so each run is bounded (45 min, 12 throttles). From the next press run the adapter records eight one-term diagnostic probes in the manifest to isolate the operator that empties the query.
- Site: Parliament and Media tabs show the real records tagged "Real records · unclassified" with stance "not yet classified"; charts stay SAMPLE; long lists page 50 at a time. 118 pipeline tests and ruff pass; web lint, typecheck, 15 unit tests and build pass.
- Runs are dispatched from `main` (fast-forwarded from the development branch); the monthly schedule fired for the first time on 2026-10-03 11:47 UTC.

**What is missing**
- Colombia titles cadastre: the national dataset is a map layer that Socrata marks "unexportable"; the registry's dataset id was the annotations table and is never stored as concessions (0 rows, no fake data).
- Chile Senate roll calls: `votaciones.php` and the tramitación document both carry none for the bills kept. Argentina: the HCDN roll-call dataset ends with period 137 (2019) and only 2 votes link to a kept bill. Ecuador votes (script-only page), Uruguay (parlamento.gub.uy refuses automated clients and foreign visitors; the national catalogue's API serves one public dataset in total, so no legislative data is reachable by machine; the site shows the reason), Paraguay (4 bills; the service pages 50 at a time and stops early).
- Four outlets without a feed: El Mostrador and OjoPúblico publish none, Emol resets connections, De Ware Tijd forbids automated clients.
- GDELT history (2017→): 1,783 windows in the backlog; Spanish and Portuguese windows return nothing yet (cause under diagnosis, see above) and the address is throttled, so the Spanish- and Portuguese-language media history is absent until the query form is fixed; the English and Dutch history fills weekly.
- Hand-supplied files still pending from Phase 2a: EXIM, IDB DPI, AEI CGIT. Stance, tone, translations and narratives: Phase 3.

**What broke and was fixed**
- 2026-10-03 night: three Uruguay-only runs restored nothing after a GitHub 502 in the release download (the step never failed), exported an empty dataset and overwrote the daily release with a 4 KB warehouse, so the site showed every layer as SAMPLE for a few hours. Releases are now per run and never overwritten, the restore hard-fails and skips empty releases, and a row-count guard blocks the commit and the release when the warehouse regressed (DECISIONS 36); the groups were re-run from the 2 October release.
- Runs 17 and 18 killed the runner (host OOM, no stdout reaching the log): parsers filter each yearly file as it is read, member-vote files stream in chunks, Python runs unbuffered with a per-adapter memory cap (8 GB) so a runaway parse fails as `MemoryError` instead.
- The first scheduled run (2026-10-03) spent five hours inside Comtrade (every preview call refused after a dispatch had fetched Comtrade an hour earlier) and was cancelled at the job limit with nothing committed: every adapter now runs under a 120-minute wall-clock budget (`SCM_ADAPTER_BUDGET_MIN`) and Comtrade stops after three refused calls, keeping the previous release's rows.
- GDELT throttles the shared runner address (HTTP 429) and ignores accented Spanish/Portuguese queries without `sourcelang:`: pacing is 10 s with a 45 s pause after a 429, a throttle cap and a time budget per run.
- Real formats differed from documentation: GGMC three-row header; Câmara `;` separators and the fixture trimmer's separator; Chile's service methods (`retornarMocionesXAnno` / `retornarMensajesXAnno`) and vote element (`VotacionProyectoLey`); HCDN dataset names and the expediente carried only in vote titles; Paraguay's documented route and `offset` paging; Ecuador's abbreviated ArcGIS fields and a MapServer that ignores result offsets (paged by objectid); Peru's Latin-1 metadata and growth-rate series; Cochilco share tables; Portuguese "prata"/"ouro" place names; publishers' HTML feed indexes; a discovered feed on another domain (Wikipedia) tripping robots.txt, and a legitimate one (FeedBurner) rejected by the same-site rule; Colombia's unexportable layer treated as fatal.
- GitHub push protection rejected a run that recorded a presigned storage URL: credential-bearing query parameters are stripped from every recorded URL.

**Recommendation**
- Owner actions: connect Vercel (root `web`, production branch `main`); commit a Uruguay export under `data/manual/` if one is ever obtainable from inside the country; set feed URLs in the registry if El Mostrador or OjoPúblico publish one; add the free keys (Comtrade, Congress.gov, Census) as repository secrets to lift the preview quotas.
- Keep the groups on their schedules (monthly on the 3rd, press weekly); dispatch a one-off GDELT backfill (`targets: gdelt`, `gdelt_backfill_windows: 1900`) when a press run shows no throttling.
- Start Phase 3 on the records now in the warehouse: 5,000+ legislative documents and the headline set are enough to design the stance and tone classifiers with a hand-labelled validation sample.

## Phase 2a — International and US pipelines (2026-10-01, fifteen live runs)

**What runs**
- `pipeline/scm/`: ingestion framework (dated raw snapshots with manifests, pure parsers, pandera-validated Parquet per source and table), DuckDB warehouse build with `trade_discrepancy` (reported vs mirror) and `finance_event_dedup` (conservative cross-database clustering keeping every source id), site exporter writing `web/public/data/real/`, liveness checker, fixture recorder, CLI (`python -m scm run|build|export|liveness|fixtures`).
- Live data on the site (committed under `web/public/data/real/`, all 12 countries covered) from 13 sources: UN Comtrade annual HS6 reported flows 2008–2024 (keyless preview endpoint), AidData GCDF 3.0 finance events, DFC and OPIC-era commitments, Federal Register policy documents, USGS Mineral Commodity Summaries 2026 (production, reserves, US prices), V-Dem, World Bank WDI, IDS and WGI (via the Data360 API), World Bank Pink Sheet prices, BGS world mineral statistics, ResourceContracts contracts, UNGA ideal points and voting agreement. Warehouse after run 15: trade_flow 14,274 rows; finance_event 1,699; governance 10,353; contract 487; production 2,802; price 3,400; policy_document 444.
- 3 Tier 2 adapters gated by secrets (Congress.gov, Census, BU CODF) report `skipped` until the secret exists.
- 43 pipeline tests (synthetic fixtures in each source's real format, recorded real fixtures, warehouse derivations, end-to-end export) and ruff pass; web lint, typecheck, unit tests and build pass.
- Workflows: `ingest-monthly.yml` (3rd of the month and on demand; restores the last Parquet release, runs adapters → records fixtures → build → export → tests → commits site data → Parquet release → issue on failure), `ingest-annual.yml`, `liveness.yml` (Mondays; 187 URLs checked, result shown on the Sources page).
- Site: per-layer data resolution (facts real where covered, else sample), status banner stating what is real, "Real data" tags per block, mirror bars and discrepancy list on the trade chart, contracts and production blocks, governance facts on the Analysis tab, real mineral shares on the regional page.

**What is missing**
- Comtrade US/China mirror flows and some Uruguay/Venezuela years: the keyless endpoint's daily quota ran out after ~190 calls; the monthly run (or a manual `un_comtrade` dispatch on another day) completes them.
- EXIM authorizations (data.gov's catalog API answers 404 on every path and its pages are script-rendered), IDB DPI 2023 (data.iadb.org answers 202 "preparing" indefinitely to a non-browser client) and AEI CGIT (Cloudflare 403): each needs a file the owner downloads in a browser, supplied as a secret URL (`EXIM_FILE_URL`, `DPI_FILE_URL`, `CGIT_FILE_URL`) or, for the two redistributable ones, committed under `data/manual/` (see its README).
- WGI percentile ranks: Data360 labels its statistical breakdowns with undocumented codes (`WGI_EST`, `WGI_SE`, `WGI_SC`, `WGI_SC_LB/UB`, `WGI_SR`); only the estimate is kept until the codes are confirmed.
- Free registrations by the owner: Comtrade key (monthly data), Congress.gov key, Census key, BU CODF data-use agreement.
- Vercel connection, so the real-data site has a public URL.

**What broke and was fixed**
- The first run failed on packaging (multiple top-level packages) and `workflow_dispatch` answered 404 until the workflow file existed on the branch.
- Workflow pushes raced each other and the development branch: pulls with rebase before every push; concurrency group per branch.
- The keyless Comtrade quota was exhausted by one-year-per-call requests: calls now cover three years (reported) or six years (mirrors) each, with backoff and truncation fallback.
- Mineral keyword tagging matched "Free" as rare earths and "El Oro" as gold: whole-word patterns; Spanish gold and silver require a mining phrase.
- Finance clustering was order-dependent; rewritten to anchor on each cluster's first amount. Regional shares compared the wrong partner keys. USGS file names use five-letter abbreviations.
- Real column names differed from documentation for DFC (`Committed`, `Project Profile URL`, `Originating Agency`), USGS (`Statistics`, `Statistics_detail`, `Value` with thousands separators, and a column named "Is critical mineral 2025" that fooled the year-column detection), and UNGA (Stata originals behind `.tab` names).
- Harvard Dataverse redirects to presigned S3 URLs; their access-key id tripped GitHub push protection and blocked run 8's data commit. Every recorded URL is now stripped of credential-bearing parameters, and the stable request URL is kept as the citation.
- A failed test blocked the commit of the recorded fixtures that were needed to fix it; tests now run with `continue-on-error` and the job fails at the end instead.
- Run 5's outputs (BGS, contracts, UNGA) were lost because a failed run publishes no release and the next run restored the older one; re-run.

**Recommendation**
- Dispatch `Ingest (monthly)` with `targets: un_comtrade` on a fresh day so the keyless quota covers the US and China mirrors and the missing Uruguay and Venezuela years.
- Download the EXIM CSV and the DPI 2023 file in a browser and commit them under `data/manual/`; put the CGIT file at a private URL in `CGIT_FILE_URL`; register the free Comtrade, Congress.gov and Census keys.
- Merge to `main` once a full run is green so the scheduled workflows run on the default branch.

## Phase 1 — Interface with sample data (2026-10-01)

**What runs**
- `web/`: Next.js 15 site, 20 statically generated pages, lint, typecheck, 12 unit tests and production build all pass.
- Map page: MapLibre choropleth of the 12 countries (Natural Earth map units; French Guiana and the Falklands/Malvinas drawn and labelled as outside the analysis), hover popup, click to select, year slider 2008–2026 with play, US / China / Both toggle (Both uses a blue–grey–vermilion diverging scale of China minus US), mineral filter, keyboard-accessible country list, legend, ranking list. State lives in the URL so views are shareable.
- Country panel with five tabs (Actions, Parliament, Media, Analysis, Forecast), each with charts, "show as table" alternatives, source links with reliability badges, facts / model / interpretation layer labels, original-language titles with English renderings, and a freshness line (last updated, sources, refresh cadence). Also available as a full page at `/country/<ISO3>` for phones and deep links.
- Regional overview: ranking by net lean, small multiples per country, mineral-by-mineral export shares, map of major projects (mines, plants, ports).
- Methodology page (planned methods, validation-score placeholders, refresh schedule, limitations) and Sources page generated from the registry with filters by scope, category, reliability and status.
- SAMPLE DATA banner on every page; every sample file carries `dataset: "SAMPLE DATA"` and a unit test enforces it.
- `pipeline/`: source registry (187 entries) validated by `build_sources.py`; `make_sample_data.py` (seeded); 6 pytest tests; ruff clean.
- `.github/workflows/ci.yml` runs both on every push.

**What is missing**
- Real data (Phase 2). All numbers are synthetic.
- Deployment: no Vercel token in the sandbox, so the site is not yet on a public URL. Connect the repo in Vercel with Root Directory `web` (docs/DEPLOYMENT.md); the first push after that produces the preview URL.
- Spanish/Portuguese/Dutch originals are shown for sample titles only; real translations arrive with Phase 3.
- Dark mode and printed/texture encodings are not implemented.
- Browser end-to-end tests: the screenshot pass was run manually with Playwright; it is not yet in CI.

**What broke and was fixed**
- MapLibre 6 ships its web worker as a separate ES module that the Next.js bundle could not serve ("Worker failed to load"). Fixed by copying the worker and shared chunk to `web/public/vendor/` before dev and build and calling `setWorkerUrl`.
- A URL-parameter bug returned `null` for the tab when none was given and crashed the freshness line.
- Label collisions in the Guianas and crowded axes on the trade bars and small multiples.

**Recommendation**
- Connect Vercel now so Phase 2 work is visible on a public URL.
- Start Phase 2a with the international adapters (Comtrade, USGS, World Bank, V-Dem, UNGA votes, BU CODF, AidData, AEI CGIT, DFC, EXIM, Congress.gov, Federal Register) in GitHub Actions, which also performs the first direct liveness check of every registry URL.
- Register the free accounts needed in your name before Phase 2a: UN Comtrade key, ACLED research access, BU CODF data-use agreement, Media Cloud key, Congress.gov key.
