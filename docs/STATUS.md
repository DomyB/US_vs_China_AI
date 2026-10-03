# Status log

One entry per phase: what runs, what is missing, what broke, recommendation.

## Phase 2b — National adapters (2026-10-02 → 2026-10-03, done with known gaps)

**What runs (live, committed to `main`; counts from the 2026-10-03 runs)**
- Text tables `document` (bills, hearings, votes, news; news rows carry no summary by schema), `vote`, `vote_member`, `concession`, `media_volume`; incremental merge with the previous data release; `document_dedup` merges the same article seen through RSS and GDELT. Shared modules: feed parser and feed-index discovery, versioned multilingual keyword filter (`2026.10`), robots.txt cache (disallow recorded as `skipped`), XML fixtures, `legislature` / `press` / `national` groups, weekly `ingest-press.yml`, per-adapter memory cap and wall-clock budget, progress lines with memory.
- Legislatures (document / roll calls / member votes): Brazil Câmara 2,931 / 963 / 22,580; Brazil Senado 893 / 2 / 162; Chile Cámara 173 / 148 / 16,432; Argentina Diputados 1,233 / 2 / 514; Colombia Cámara 76 bills; Peru SPLEY 140 bills; Paraguay SILpy 4 bills. On the site: ARG, BRA, CHL, COL, PER, PRY show real records; BOL, GUY, SUR, VEN show the no-records note.
- National statistics and cadastres: Ecuador cadastre 15,446 titles; Peru BCRP 817 production rows (annual quantities by mineral); Cochilco 762 rows; Guyana GGMC 95 rows. Warehouse totals: document 5,472; vote 1,115; vote_member 39,688; concession 15,446; media_volume 198 (plus the Phase 2a tables).
- Press: 22 of 27 RSS adapters deliver (feeds found by discovery for Folha, El Tiempo, La Nación and others; BioBíoChile's FeedBurner feed accepted from 2026-10-03); headlines are recent-only until GDELT history arrives. GDELT's English and Dutch queries returned articles (Guyana, Suriname); Spanish and Portuguese windows came back empty without `sourcelang:`, which is now set; the runner address is throttled (HTTP 429), so each run is bounded (45 min, 12 throttles) and history fills incrementally.
- Site: Parliament and Media tabs show the real records tagged "Real records · unclassified" with stance "not yet classified"; charts stay SAMPLE; long lists page 50 at a time. 117 pipeline tests and ruff pass; web lint, typecheck, 15 unit tests and build pass.
- Runs are dispatched from `main` (fast-forwarded from the development branch); the monthly schedule fired for the first time on 2026-10-03 11:47 UTC.

**What is missing**
- Colombia titles cadastre: the national dataset is a map layer that Socrata marks "unexportable"; the registry's dataset id was the annotations table and is never stored as concessions (0 rows, no fake data).
- Chile Senate roll calls: `votaciones.php` and the tramitación document both carry none for the bills kept. Argentina: the HCDN roll-call dataset ends with period 137 (2019) and only 2 votes link to a kept bill. Ecuador votes (script-only page), Uruguay (site answers 403 to automated clients; a hand-downloaded export under `data/manual/` is accepted), Paraguay (4 bills; the service pages 50 at a time and stops early).
- Four outlets without a feed: El Mostrador and OjoPúblico publish none, Emol resets connections, De Ware Tijd forbids automated clients.
- GDELT history (2017→): about 1,840 windows at one request per 10 s under throttling; the backfill needs several weekly runs or a one-off dispatch when the address is not throttled.
- Hand-supplied files still pending from Phase 2a: EXIM, IDB DPI, AEI CGIT. Stance, tone, translations and narratives: Phase 3.

**What broke and was fixed**
- Runs 17 and 18 killed the runner (host OOM, no stdout reaching the log): parsers filter each yearly file as it is read, member-vote files stream in chunks, Python runs unbuffered with a per-adapter memory cap (8 GB) so a runaway parse fails as `MemoryError` instead.
- The first scheduled run (2026-10-03) spent five hours inside Comtrade (every preview call refused after a dispatch had fetched Comtrade an hour earlier) and was cancelled at the job limit with nothing committed: every adapter now runs under a 120-minute wall-clock budget (`SCM_ADAPTER_BUDGET_MIN`) and Comtrade stops after three refused calls, keeping the previous release's rows.
- GDELT throttles the shared runner address (HTTP 429) and ignores accented Spanish/Portuguese queries without `sourcelang:`: pacing is 10 s with a 45 s pause after a 429, a throttle cap and a time budget per run.
- Real formats differed from documentation: GGMC three-row header; Câmara `;` separators and the fixture trimmer's separator; Chile's service methods (`retornarMocionesXAnno` / `retornarMensajesXAnno`) and vote element (`VotacionProyectoLey`); HCDN dataset names and the expediente carried only in vote titles; Paraguay's documented route and `offset` paging; Ecuador's abbreviated ArcGIS fields and a MapServer that ignores result offsets (paged by objectid); Peru's Latin-1 metadata and growth-rate series; Cochilco share tables; Portuguese "prata"/"ouro" place names; publishers' HTML feed indexes; a discovered feed on another domain (Wikipedia) tripping robots.txt, and a legitimate one (FeedBurner) rejected by the same-site rule; Colombia's unexportable layer treated as fatal.
- GitHub push protection rejected a run that recorded a presigned storage URL: credential-bearing query parameters are stripped from every recorded URL.

**Recommendation**
- Owner actions: connect Vercel (root `web`, production branch `main`); download the Uruguay export into `data/manual/`; set feed URLs in the registry if El Mostrador or OjoPúblico publish one; add the free keys (Comtrade, Congress.gov, Census) as repository secrets to lift the preview quotas.
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
