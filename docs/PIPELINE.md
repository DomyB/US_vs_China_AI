# Pipeline

Python package `pipeline/scm/`. Every adapter follows the same three steps so that
parsers never touch the network and every number keeps its provenance.

```
fetch(snapshot)  -> data/raw/<source_id>/<YYYY-MM-DD>/...   (+ manifest.json: URL, params, status, sha256, retrieved_at)
parse(snapshot)  -> {table_name: DataFrame}                 (pure; validated against scm/schema.py)
load(tables)     -> data/warehouse/<table>/<source_id>.parquet
build            -> data/warehouse/scm.duckdb (views over Parquet + trade_discrepancy + finance_event_dedup)
export           -> web/public/data/real/ (meta, coverage, country/<ISO3>.json, region, prices, policy)
```

## Running

```bash
cd pipeline
uv venv .venv && uv pip install --python .venv/bin/python -e ".[dev]"
.venv/bin/python -m scm run tier1            # every keyless adapter
.venv/bin/python -m scm run un_comtrade wb_wgi --fetch-only
.venv/bin/python -m scm build && .venv/bin/python -m scm export
.venv/bin/python -m scm liveness            # direct HTTP check of every registry URL
.venv/bin/python -m scm fixtures            # trimmed copies of the latest snapshots for tests
.venv/bin/python -m pytest -q
```

The development sandbox used to write this code has no outbound network access except
GitHub and PyPI, so the adapters were written against the documented response formats and
tested on synthetic fixtures. The GitHub Actions workflows are where the sources are
actually reached; the `fixtures` step records trimmed real responses and commits them, after
which the tests run on real data.

## Adapters

| Source id | Module | Tables | Needs |
|---|---|---|---|
| wb_wdi, wb_wgi, wb_ids | `ingest/worldbank.py` | governance | — (WGI: World Bank API, then the govindicators.org bulk dataset) |
| usgs_mcs | `ingest/usgs_mcs.py` | production, price | — |
| wb_pink_sheet | `ingest/pink_sheet.py` | price | — |
| un_comtrade | `ingest/comtrade.py` | trade_flow (reported + US/China mirrors) | optional `COMTRADE_KEY` |
| aiddata_gcdf | `ingest/aiddata.py` | finance_event | — |
| aei_cgit | `ingest/aei_cgit.py` | deal_event | `CGIT_FILE_URL` (aei.org blocks automated clients with a Cloudflare challenge; the owner downloads the free XLSX by hand and provides its URL or path) |
| dfc_projects | `ingest/dfc.py` | finance_event | — |
| exim_authorizations | `ingest/exim.py` | finance_event | optional `EXIM_FILE_URL` (the data.gov catalog API answered 404 on every path in October 2026; the adapter also scrapes the catalog's HTML pages for the CSV link) |
| federal_register | `ingest/federal_register.py` | policy_document | — |
| resourcecontracts | `ingest/resourcecontracts.py` | contract | — |
| vdem | `ingest/vdem.py` | governance | — (RData from the vdemdata GitHub repository) |
| unga_votes | `ingest/unga.py` | governance | — |
| idb_dpi | `ingest/dpi.py` | governance | optional `DPI_FILE_URL` (data.iadb.org file downloads answered 404 in October 2026) |
| bgs_wms | `ingest/bgs.py` | production (cross-check) | — |
| congress_gov | `ingest/tier2.py` | policy_document | `CONGRESS_GOV_KEY` |
| us_census_trade | `ingest/tier2.py` | trade_flow (monthly HS10 mirror) | `CENSUS_KEY` |
| bu_codf | `ingest/tier2.py` | finance_event | `CODF_DOWNLOAD_URL` (signed data-use agreement; file never committed) |

Adapters gated by a secret report `skipped` until the secret exists in the repository
settings (Settings → Secrets and variables → Actions). No secret is ever written to the
repository or to the site. Recorded URLs are cleaned of credential-bearing query parameters
(presigned storage links, API keys) before they reach a manifest, a fixture or the site:
GitHub push protection rejects commits that contain such tokens (seen with Harvard
Dataverse's presigned S3 redirects).

## Phase 2b: national adapters, text tables and groups

| Adapter | Module | Produces | Notes |
|---|---|---|---|
| bra_camara_api | `ingest/legis_bra.py` | document (bills, hearings), vote, vote_member | yearly bulk CSVs filtered by keyword; member votes from `/api/v2/votacoes/{id}/votos` |
| RSS_<outlet> (27) | `ingest/press.py` | document (news), media_volume | one class per registry press source with `access: rss`; feed from `api_url` or discovery |
| bra_senado_api | `ingest/legis_bra.py` | document (bills), vote, vote_member | matters per year (classic and renamed routes tried), votes per matter kept |
| chl_camara | `ingest/legis_chl.py` | document (bills), vote, vote_member | opendata.camara.cl XML services per year, votes and member detail per boletín |
| gdelt | `ingest/gdelt.py` | document (news), media_volume (window ledger) | GDELT DOC API per country and window since 2017; outlets matched on registry domains; `GDELT_BACKFILL_WINDOWS` per run |
| guy_ggmc | `ingest/national_guy.py` | production | direct CSV |

Target groups: `legislature`, `press`, `national` (plus `tier1`, `tier2`, `annual`, `monthly`,
`all`). `monthly` = tier1 + legislature + national; `press` runs weekly from
`ingest-press.yml`. Text tables: `document` (bills and news; news rows carry no summary),
`vote`, `vote_member`, `media_volume`; cadastres go to `concession`.

Incremental tables (see `schema.KEY_COLUMNS`) merge with the Parquet restored from the previous
data release; the first-seen row wins. Adapters that fetch HTML, feeds or web services set
`respect_robots = True`: robots.txt is read once per host and crawl-delays raise the request
interval. The keyword filter (`ingest/keywords.py`) is versioned; `relevance()` returns the
matched terms, which are stored with each row.

**Adding a press outlet:** add the registry entry with `access: rss` and the feed URL in
`api_url` (orientation and paywall are required for press); the adapter class is created
automatically. XML feeds are recorded as fixtures (first 60 items per element).

## Hand-supplied files

Three sources broke in the first live runs and may need a file the owner downloads in a
browser: EXIM authorizations (the data.gov catalog API now answers 404 on every path and the
site is script-rendered), IDB DPI 2023 (data.iadb.org answers 202 "preparing" indefinitely to
a non-browser client) and AEI CGIT (Cloudflare challenge). Each adapter first tries every
open path, then looks for the file:

- a repository secret with a URL or a repository-relative path: `EXIM_FILE_URL`,
  `DPI_FILE_URL`, `CGIT_FILE_URL` (`CODF_DOWNLOAD_URL` for BU CODF);
- or, for redistributable data only, a file committed under `data/manual/` (see the README
  there for names and licenses).

The snapshot records the registry URL and a note that the file was supplied by hand, so the
provenance shown on the site stays honest.

## Adding an adapter

1. Add the source to `pipeline/config/sources/*.yaml` (the registry is the contract: URL,
   license, reliability, refresh schedule).
2. Create `scm/ingest/<source_id>.py` with a class deriving from `Adapter`; set `source_id`
   and `tables`; implement `fetch` (use `snap.get` / `snap.get_json`) and `parse` (return
   DataFrames with the schema columns; call `self.stamp(snap, df)` to add provenance).
3. Register it in `scm/ingest/__init__.py`.
4. Add a parser test in `tests/test_adapters.py` with a minimal payload in the source's format.
5. Run the monthly workflow with `targets: <source_id>`; the fixtures step records a trimmed
   real response under `tests/fixtures/<source_id>/`.

## Workflows

| Workflow | Cadence | What it does |
|---|---|---|
| `ingest-monthly.yml` | 3rd of each month, and on demand | Tier 1 adapters, fixtures, build, export, tests, commits `web/public/data/real/`, publishes a Parquet release `data-vYYYY.MM.DD`, opens an issue on failure |
| `ingest-annual.yml` | 15 March | USGS, V-Dem, UNGA, DPI, BGS via the same job |
| `liveness.yml` | Mondays | HEAD/GET of every registry URL → `data/liveness.json`, regenerates SOURCES.md |
| `ci.yml` | every push | lint, typecheck, unit tests, build (web and pipeline) |

Each ingestion run first restores the Parquet warehouse from the latest `data-v*` release, so
running a subset of adapters (`targets: wb_wgi usgs_mcs`) refreshes only those tables and keeps
the rest. Data commits carry `[skip ci]`. Scheduled workflows are disabled by GitHub after 60 days
without repository activity; the monthly data commit keeps them alive.

## Rules enforced in code

- A parser that cannot find an expected column raises `ColumnError` listing the columns it
  saw, so a layout change at the source is diagnosed from the log, not guessed.
- Partner-reported trade is stored as `value_type = "mirror"` with `reported_by` naming the
  reporting country; reported and mirror values are compared in `trade_discrepancy`.
- Finance events from different databases are clustered (same country, year, origin, amount
  within 10 percent) and every source id is kept; nothing is dropped.
- Country matching uses ISO3 via `registry.iso3_from_name`; unmatched names are skipped and
  counted, never guessed.
