# Status log

One entry per phase: what runs, what is missing, what broke, recommendation.

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
