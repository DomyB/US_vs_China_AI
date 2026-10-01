# Status log

One entry per phase: what runs, what is missing, what broke, recommendation.

## Phase 2a — International and US pipelines (2026-10-01, first live run pending)

**What runs**
- `pipeline/scm/`: ingestion framework (dated raw snapshots with manifests, pure parsers, pandera-validated Parquet per source and table), DuckDB warehouse build with `trade_discrepancy` (reported vs mirror) and `finance_event_dedup` (conservative cross-database clustering keeping every source id), site exporter writing `web/public/data/real/`, liveness checker, fixture recorder, CLI (`python -m scm run|build|export|liveness|fixtures`).
- 16 Tier 1 adapters (keyless): World Bank WDI, WGI, IDS; USGS Mineral Commodity Summaries; World Bank Pink Sheet; UN Comtrade annual HS6 with US and China mirrors; AidData GCDF 3.0; AEI China Global Investment Tracker; DFC; EXIM; Federal Register; ResourceContracts; V-Dem; UNGA voting; IDB DPI 2023; BGS.
- 3 Tier 2 adapters gated by secrets: Congress.gov (`CONGRESS_GOV_KEY`), US Census monthly HS10 (`CENSUS_KEY`), BU CODF (`CODF_DOWNLOAD_URL`). They report `skipped` until the secret exists.
- 27 pipeline tests (parsers on synthetic fixtures in each source's documented format, warehouse derivations, end-to-end export) and ruff pass; web lint, typecheck, 12 unit tests and build pass.
- Workflows: `ingest-monthly.yml` (3rd of the month and on demand; adapters → fixtures → build → export → tests → commit site data → Parquet release → issue on failure), `ingest-annual.yml`, `liveness.yml` (Mondays).
- Site: per-layer data resolution (facts real where covered, else sample), status banner stating what is real, "Real data" tags per block, mirror bars and discrepancy list on the trade chart, contracts and production blocks, governance facts on the Analysis tab, real mineral shares on the regional page. Verified in the browser against a synthetic export (not committed).

**What is missing**
- The first live run: the sandbox cannot reach the sources, so every adapter was written against documented formats. The first `ingest-monthly` run is the direct contact; expect some parsers to need column adjustments, which the logs and recorded fixtures will show.
- Free registrations by the owner: Comtrade key (monthly data), Congress.gov key, Census key, BU CODF data-use agreement.
- Vercel connection, so the real-data site has a public URL.

**What broke and was fixed**
- Finance clustering was order-dependent (chained on the previous row); rewritten to anchor on each cluster's first amount.
- Regional mineral shares compared Comtrade partner codes against the wrong keys; fixed and covered by a test.
- USGS data-release file names use five-letter commodity abbreviations; added a mapping.

**Recommendation**
- Trigger `Ingest (monthly)` with `targets: tier1` on this branch, read the log and the issue it opens if adapters fail, then fix parsers against the recorded fixtures. Repeat until green.
- Merge to `main` once the first run is green so the scheduled workflows run on the default branch.

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
