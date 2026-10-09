# Pipeline

Python package `pipeline/scm/`. Every adapter follows the same three steps so that
parsers never touch the network and every number keeps its provenance.

```
fetch(snapshot)  -> data/raw/<source_id>/<YYYY-MM-DD>/...   (+ manifest.json: URL, params, status, sha256, retrieved_at)
parse(snapshot)  -> {table_name: DataFrame}                 (pure; validated against scm/schema.py)
load(tables)     -> data/warehouse/<table>/<source_id>.parquet
build            -> data/warehouse/scm.duckdb (views over Parquet + trade_discrepancy + finance_event_dedup)
export           -> web/public/data/real/ (meta, coverage, country/<ISO3>.json, parliament/, media/, validation.json, region, prices, policy)
classify         -> data/warehouse/{doc_translation,doc_classification,doc_embedding,topic*}/<slot>.parquet (Phase 3 model outputs)
analyse          -> data/warehouse/{concentration,index_value,index_component,say_do_gap,anomaly_flag,network_metric,network_edge,event_effect,regression_result,quant_run}/quant.parquet (Phase 4)
```

## Running

```bash
cd pipeline
uv venv .venv && uv pip install --python .venv/bin/python -e ".[dev]"
.venv/bin/python -m scm run tier1            # every keyless adapter
.venv/bin/python -m scm run un_comtrade wb_wgi --fetch-only
.venv/bin/python -m scm analyse && .venv/bin/python -m scm build && .venv/bin/python -m scm export
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
| congress_gov | `ingest/tier2.py` | policy_document | `CONGRESS_GOV_KEY`; lists every bill of each Congress from the 110th (about 700 requests, 250 per page) and keeps titles about minerals or mining, or naming China with a Western Hemisphere term; the API has no keyword search |
| us_census_trade | `ingest/tier2.py` | trade_flow (monthly HS10 mirror) | `CENSUS_KEY` |
| bu_codf | `ingest/tier2.py` | finance_event | `CODF_DOWNLOAD_URL` (signed data-use agreement; file never committed) |

Recorded request parameters are masked (`scm.http.scrub_params`): any parameter named like a credential
is stored as `***` in manifests and fixtures, and `tests/test_http.py` fails if a recorded fixture
carries an unmasked one.

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
| gdelt | `ingest/gdelt.py` | document (news), media_volume (window ledger) | GDELT DOC API per country and window since 2017 (`sourcelang:` for es/pt/nl); outlets matched on registry domains; `GDELT_BACKFILL_WINDOWS` windows and `GDELT_TIME_BUDGET_MIN` minutes per run; stops after repeated HTTP 429 |
| arg_hcdn | `ingest/legis_arg.py` | document (bills, votes), vote, vote_member | datos.hcdn.gob.ar CKAN; proyectos, votaciones and votos resources found by search (candidates recorded) |
| ury_parlamento | `ingest/legis_ury.py` | document (bills) | catalogodatos.gub.uy CKAN; no roll-call dataset |
| col_camara | `ingest/legis_col.py` | document (bills) | Socrata kcxp-nxum paged; votes are PDF only; Senado never fetched (403, terms) |
| col_anm_anna | `ingest/national_col.py` | concession | Socrata catalogue discovery; the national titles layer is an unexportable map view, so the adapter records the catalogue choice and stores 0 rows (si2v-pbq5 is the annotations table, never stored) |
| chl_senado | `ingest/legis_chl.py` | vote, vote_member | tramitacion.senado.cl `votaciones.php` and the tramitación document for the boletines the Cámara adapter kept; both carried no roll calls in October 2026 |
| pry_silpy, ecu_asamblea, per_congreso_spley | `ingest/legis_misc.py` | document (bills / votes) | undocumented services: index pages and first bytes recorded; parsers completed from fixtures |
| ecu_cadastre | `ingest/national_ecu.py` | concession | ArcGIS REST layer query, paged |
| per_bcrp_api | `ingest/national_per.py` | production | series chosen from BCRPData metadata (annual mine production), JSON API |
| chl_cochilco | `ingest/national_chl.py` | production | anuario XLSX from the page; sheets with producción and a Chile/total row |
| guy_ggmc | `ingest/national_guy.py` | production (1979–2024; gold grand total, bauxite, manganese) | direct CSV with a three-row header |

Target groups: `legislature`, `press`, `national` (plus `tier1`, `tier2`, `annual`, `monthly`,
`all`). `monthly` = tier1 + legislature + national; `press` runs weekly from
`ingest-press.yml`. Text tables: `document` (bills and news; news rows carry no summary),
`vote`, `vote_member`, `media_volume`; cadastres go to `concession`.

Every ingestion job restores the warehouse from the newest usable data release
(`.github/scripts/restore_release.sh`: tag `data-v*`, asset ≥ 100 KB; an API error fails the job;
releases with an empty asset are deleted), and before committing site data or publishing a release it
runs `python -m scm stats --not-below /tmp/restored.json`, which fails when a table vanished, lost more
than 25% of its rows or the Parquet file count fell; the dispatch input `allow_regression` turns
that into a warning when the drop is intentional (a source cleared or re-scoped). Releases are tagged per run
(`data-vYYYY.MM.DD.<run number>`) and never overwritten.

Each adapter runs under a wall-clock budget (`SCM_ADAPTER_BUDGET_MIN`, default 120 minutes, 0
disables it) and a memory cap (`SCM_MEM_LIMIT_GB`, default 8); an adapter that overruns either
is recorded as `failed` with the reason and the run continues with the next source.

Incremental tables (see `schema.KEY_COLUMNS`) merge with the Parquet restored from the previous
data release; the first-seen row wins. Adapters that fetch HTML, feeds or web services set
`respect_robots = True`: robots.txt is read once per host and crawl-delays raise the request
interval. The keyword filter (`ingest/keywords.py`) is versioned; `relevance()` returns the
matched terms, which are stored with each row.

**Adding a press outlet:** add the registry entry with `access: rss` and the feed URL in
`api_url` (orientation and paywall are required for press); the adapter class is created
automatically. XML feeds are recorded as fixtures (first 60 items per element).

## Phase 3: text analysis (`scm/text/`)

| Step | Module | Writes | Notes |
|---|---|---|---|
| translate | `text/translate.py` | `doc_translation` (slot `opus_mt`) | opus-mt ROMANCE→en (es, pt) and nl→en; titles by default, `--fields title,summary` for summaries; English records are not translated |
| classify | `text/zero_shot.py` | `doc_classification` (slot `zero_shot`) | mDeBERTa-xnli with three full-sentence hypotheses per actor, scored only when the current keyword rule finds the actor in the text (`actor_us`/`actor_cn`), batched per language and actor; tone from the cardiffnlp multilingual sentiment model; one row per document, method `zero_shot`, codebook version recorded |
| embed | `text/embed.py` | `doc_embedding` (slot `minilm`) | paraphrase-multilingual-MiniLM, L2-normalised |
| topics | `text/topics.py` | `topic_model_run`, `topic`, `doc_topic` (slots `parliament`, `media`) | k-means (numpy) + class-based TF-IDF labels; stop-words in `config/stopwords/`; optional labels in `config/topic_labels.yaml`; refitted wholesale each run |

`python -m scm classify [--steps …] [--limit N] [--force] [--codebook-version v1] [--fields …]`
runs the steps in order and prints one JSON line per step. Steps are incremental: a document is
processed once per (model, codebook version); `--force` recomputes. `text/models.py` loads the
models lazily and `SCM_TEXT_FAKE=1` substitutes deterministic fakes (keyword scoring, hashed
embeddings) so tests and CI never download weights. `text/series.py` builds the per-year stance,
attention/tone and narrative series the exporter writes into the parliament and media files;
`text.store.pick_classifications` (shared by the exporter and the quant step) chooses the trained head
over the baseline only when the validation metrics show it beating the baseline on the held-out split.

Validation and training (Phase 3b): `python -m scm validation draw` writes the stratified 300-document
template `data/manual/validation/sample_<round>.csv` (and the `template` rows with the held-out split
into `validation_sample`); the coders fill `coder1_<round>.csv` and `coder2_<round>.csv`;
`validation adjudicate` writes the side-by-side `adjudicated_<round>.csv`; after the adjudication
session `validation load` stores every coding, `validation metrics` writes agreement (`validation_metric`,
method `agreement`) and the accuracy of each classifier against the adjudicated labels, and `train` fits
the logistic-regression head (`text/train.py`, numpy) on the training split, saves
`data/models/stance_head_<codebook>.json` and labels every document with method `trained`. The
workflow inputs `draw_sample` and `train` run these steps; the codebook is `pipeline/config/codebook.md`.

Install for real runs: `pip install torch --index-url https://download.pytorch.org/whl/cpu && pip install -e ".[dev,ml]"`.

## Phase 4: quantitative analysis (`scm/quant/`)

`python -m scm analyse [--draws 500] [--seed 20261009] [--release TAG]` reads the fact tables with
`warehouse.table_frames` (no DuckDB build needed), computes every Phase 4 table in a few seconds and
replaces the `quant` slot of each (`warehouse.replace_slot`); it runs in both workflows before `build`.
Every row carries `method_version`, `run_id` and `inputs_release` (the restored data release, from
`RESTORED_TAG`). Nothing is imputed: a missing input leaves a component unavailable with its reason.

| Module | Writes | What |
|---|---|---|
| `quant/inputs.py` | – | tidy frames: annual reported trade by reporter × year × mineral (plus `all`) × partner × flow; documented finance commitments with a `swap` flag; GDP, UNGA agreement, debt to China (IDS creditor 730); legislative stance per document with the classifier choice shared with the exporter; the last year each source covers |
| `quant/concentration.py` | `concentration` | export and import shares to the US and China, `share_other`, `big2_share`, `rca_pool` (Balassa index against the pooled twelve-country basket), `exports_wld_usd`; `hhi_export_dest` null with the reason (three partners only) |
| `quant/index.py` | `index_component`, `index_value` | six components per actor (`COMPONENTS`), winsorised pooled min–max to 0–100, equal weights over the available components (≥3), sub-indices `economic_ties` and `political_alignment`; 500-draw sensitivity band (Dirichlet weights, rank normalisation in half of the draws) and rank stability; also per core mineral where the country traded it |
| `quant/say_do.py` | `say_do_gap` | standardised legislative stance (≥5 records) minus the standardised change of the economic-ties sub-index, with the doc ids and the text model's status |
| `quant/anomalies.py` | `anomaly_flag` | rule-based flags with evidence levels (DECISIONS 48) and source ids |
| `quant/network.py` | `network_metric`, `network_edge` | lender–recipient graph (networkx): degree, weighted degree, betweenness, eigenvector (largest component), greedy-modularity communities |
| `quant/events.py` | `event_effect` | event windows (t+1..t+2 vs t−2..t−1 on export shares, placebo from the series' other years) and difference-in-differences with a permutation placebo for scoped events, from `config/events.yaml` (every row carries the event's review status, title, type and source) |
| `quant/panel.py` | `regression_result` | two-way fixed-effects OLS (numpy) on export and import shares with standardised regressors; CR1 cluster SE, wild cluster bootstrap p (`--boot`, default 999), drop-one-country range; country-FE variant |
| `quant/run.py` | `quant_run` | orchestration; one row with the draws, the rank stability and the notes (source coverage, unattributed events) |

The exporter writes the per-country `analysis` block (index with sub-indices, drivers with availability
notes, concentration, say–do, flags with source references, the top network nodes, `quant_model` status),
`index.json` (the composite for the map and the panels, per mineral) and `quant.json` (component definitions,
availability, rules and counts for the methodology page); `meta.json` sets `layers.analysis` to `real`.
`pipeline/config/events.yaml` is the dated event list (draft until the owner marks events `reviewed`;
the results carry the status). The country file's `analysis.event_effects` holds the country's event rows,
`quant.json` the regression table and the event list summary.

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
| `ingest-monthly.yml` | 3rd of each month, and on demand | Tier 1 adapters, fixtures, `analyse` (Phase 4), build, export, tests, commits `web/public/data/real/`, publishes a Parquet release `data-vYYYY.MM.DD.<run>`, opens an issue on failure; `targets: none` recomputes, rebuilds and re-exports without ingesting |
| `ingest-annual.yml` | 15 March | USGS, V-Dem, UNGA, DPI, BGS via the same job |
| `text-analysis.yml` | Thursdays, and on demand | Phase 3: restores the release, installs the `[ml]` extra (CPU torch), caches model weights, runs `scm classify` (translate, classify, embed, topics), `analyse`, build, export, tests, guard, commits site data, publishes a release; inputs `steps`, `limit`, `force`, `codebook_version`, `fields`, `draw_sample`, `train` |
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
- Quant outputs never impute: an unavailable component is stored as such with its reason, an index
  needs at least three components, and every value carries the method version, the run and the data
  release it was computed from.
