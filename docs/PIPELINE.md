# Pipeline

Python package `pipeline/scm/`. Every adapter follows the same three steps so that
parsers never touch the network and every number keeps its provenance.

```
fetch(snapshot)  -> data/raw/<source_id>/<YYYY-MM-DD>/...   (+ manifest.json: URL, params, status, sha256, retrieved_at)
parse(snapshot)  -> {table_name: DataFrame}                 (pure; validated against scm/schema.py)
load(tables)     -> data/warehouse/<table>/<source_id>.parquet
build            -> data/warehouse/scm.duckdb (views over Parquet + trade_discrepancy + finance_event_dedup)
export           -> web/public/data/real/ (meta with per-country coverage, period, country/<ISO3>.json, parliament/, media/, validation.json, region, index, quant, flows, insights, story, prices, policy; coverage.json is no longer written)
classify         -> data/warehouse/{doc_translation,doc_classification,doc_embedding,topic*}/<slot>.parquet (Phase 3 model outputs)
analyse          -> data/warehouse/{concentration,index_value,index_component,say_do_gap,anomaly_flag,network_metric,network_edge,event_effect,regression_result,forecast,backtest,analysis_text,quant_run}/quant.parquet (Phases 4-6)
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
| congress_gov | `ingest/tier2.py` | policy_document | `CONGRESS_GOV_KEY`; lists every bill of each Congress from the one sitting in the period's first year (`tier2.first_congress()`: the 106th for 2000; 250 bills per page) and keeps titles about minerals or mining, or naming China with a Western Hemisphere term; the API has no keyword search |
| us_census_trade | `ingest/tier2.py` | trade_flow (monthly HS10 mirror) | `CENSUS_KEY` (free registered key; first run 2026-10-13, 9,306 monthly rows since 2013-01): US imports from each reporter by month, aggregated to HS6; a complete year (all twelve months of a code) is summed and fills the US mirror of the per-country trade block and of `trade_discrepancy` where UN Comtrade has no annual US-reported row yet (`warehouse.annual_mirror_from_months`), so the US side of the comparison reaches the years Comtrade has not published; a running year is never summed |
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
| RSS_<outlet> (33) | `ingest/press.py` | document (news), media_volume | one class per registry press source with `access: rss` that names its countries (26 national outlets and 8 regional feeds: Xinhua, People's Daily and CGTN in Spanish, the State, Treasury, USTR and DFC press rooms, Dialogue Earth; a regional headline is filed under each in-scope country it names and dropped when it names none); the feed is `api_url` when it looks like one (set to the feed each outlet's runs actually read), else the feeds the home page declares, then common paths; a home page geo-redirected to a section (Infobae's US edition from a US runner) is not trusted for feeds; reader-comments feeds are never read; one unreachable candidate is recorded and discovery goes on; an outlet whose every URL robots.txt forbids reports `skipped`, not `failed`; feed items are counted once per run across an outlet's feeds |
| bra_senado_api | `ingest/legis_bra.py` | document (bills), vote, vote_member | matters per year (classic and renamed routes tried), votes per matter kept |
| chl_camara | `ingest/legis_chl.py` | document (bills), vote, vote_member | opendata.camara.cl XML services per year, votes and member detail per boletín |
| gdelt | `ingest/gdelt.py` | document (news), media_volume (window ledger) | GDELT DOC API per country and window since 2017 (`sourcelang:` for es/pt/nl); outlets matched on registry domains; `GDELT_BACKFILL_WINDOWS` windows and `GDELT_TIME_BUDGET_MIN` minutes per run; stops after repeated HTTP 429 |
| mediacloud | `ingest/mediacloud.py` | document (news), media_volume (monthly, per national collection) | Media Cloud API v4 (`MEDIACLOUD_KEY`, free registered key): per country and year since 2010, three daily count series (mineral terms; AND China; AND the United States) summed into months plus up to 2,000 headlines; the national collection `<Country> - National` is looked up by name each run; a country-year is done once its months are in the ledger, newest year first; `MEDIACLOUD_TIME_BUDGET_MIN` minutes per run (default 40), `MEDIACLOUD_YEARS=YYYY-YYYY` bounds a run; every search endpoint is paced to two requests a minute (Media Cloud's per-user limit, by endpoint), so a country-year costs about two minutes; a throttled request waits the seconds the answer names and is retried once; stops after 5 consecutive failed requests or 10 throttle answers; the story list is fetched newest first, and a country-year with more matches than the cap records the window its kept headlines come from (`headlines_window` {from, to, kept, matched, truncated} in the manifest and in the `ingest_run` record), which the export passes to the media files |
| arg_hcdn | `ingest/legis_arg.py` | document (bills, votes), vote, vote_member | datos.hcdn.gob.ar CKAN; proyectos, votaciones and votos resources found by search (candidates recorded) |
| ury_parlamento | `ingest/legis_ury.py` | document (bills) | catalogodatos.gub.uy CKAN; no roll-call dataset |
| col_camara | `ingest/legis_col.py` | document (bills) | Socrata kcxp-nxum paged; votes are PDF only; Senado never fetched (403, terms) |
| col_anm_anna | `ingest/national_col.py` | concession | Socrata catalogue discovery; the national titles layer is an unexportable map view, so the adapter records the catalogue choice and stores 0 rows (si2v-pbq5 is the annotations table, never stored) |
| chl_senado | `ingest/legis_chl.py` | vote, vote_member | tramitacion.senado.cl `votaciones.php` and the tramitación document for the boletines the Cámara adapter kept; both carried no roll calls in October 2026 |
| pry_silpy, ecu_asamblea, per_congreso_spley | `ingest/legis_misc.py` | document (bills / votes) | undocumented services: index pages and first bytes recorded; parsers completed from fixtures. Ecuador's adapter runs clean and returns no records (the bills database is HTML only, the plenary-votes page a script-rendered application whose data service is not exposed); `export_site.NO_STRUCTURED_LEGISLATURE` carries that reason to the site's Politics tab |
| ecu_cadastre | `ingest/national_ecu.py` | concession | ArcGIS REST layer query, paged |
| per_bcrp_api | `ingest/national_per.py` | production | series chosen from BCRPData metadata (annual mine production) when the metadata export answers CSV; since 2026-10-04 it answers an Incapsula challenge page, so the adapter falls back to the committed list `config/bcrp_series.json` (the selection of the last successful read; the manifest's `series_source` says which) and requests the JSON API only |
| chl_cochilco | `ingest/national_chl.py` | production | anuario XLSX from the page; sheets with producción and a Chile/total row |
| guy_ggmc | `ingest/national_guy.py` | production (1979–2024; gold grand total, bauxite, manganese) | direct CSV with a three-row header |

Target groups: `legislature`, `press`, `national` (plus `tier1`, `tier2`, `annual`, `monthly`,
`all`). The monthly workflow's default targets are `tier1 tier2 legislature national`: the tier-two
adapters (Congress.gov, Census, BU CODF) are gated by secrets and record an instant `skipped` when
theirs is missing, so a run always leaves a record of them; `press` runs weekly from
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
data release; the first-seen row wins. Because that merge preserves a wrong row for ever, a small
documented list in `ingest/base.py`, `PURGE_RECORD_URL_SUBSTRINGS: dict[source_id, list[str]]`,
names rows to drop at merge time by a substring of their `source_record_url`, each entry with its
reason; the first entry drops Infobae's US-edition rows (`/category/estados-unidos/`) that a
geo-redirected home page had passed off as Argentine news, and the run record counts the rows
purged (`<table>_purged`). Adapters that fetch HTML, feeds or web services set
`respect_robots = True`: robots.txt is read once per host and crawl-delays raise the request
interval. The keyword filter (`ingest/keywords.py`) is versioned; `relevance()` returns the
matched terms, which are stored with each row.

**Adding a press outlet:** add the registry entry with `access: rss`, the feed URL in `api_url`
(the feed the run actually reads; the discovery fallback is for outlets whose feed is unknown),
`countries` (one ISO3 for a national outlet, all twenty for a regional voice whose headlines are
filed by the countries they name), `orientation` and `paywall` (required for press); the adapter
class is created automatically. A new outlet starts with `status: uncertain` and a dated note until
the Monday liveness check and the Wednesday press run confirm the feed; a publisher whose
robots.txt forbids automated clients keeps `access: html` and gets no adapter (De Ware Tijd), and a
host that answers 403 to automated clients is marked `dead` for the adapter's purpose and never
fetched (US embassy press rooms, DECISIONS 29). Registry `api_url` answers that are 404 by design
(an SDMX root) are noted in the entry so the weekly check's result is not read as a fault. XML
feeds are recorded as fixtures (first 60 items per element).

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
| `quant/index.py` | `index_component`, `index_value` | six components per actor (`COMPONENTS`), winsorised min–max to 0–100 whose bounds come from each component's mineral "all" rows (one country × year × actor panel) and apply to every row, equal weights over the available components (≥3), sub-indices `economic_ties` and `political_alignment`; 500-draw sensitivity band (Dirichlet weights, rank normalisation in half of the draws) and rank stability; also per core mineral where the country traded it. Method 2026.10.2: a composite is held back (value and band null, `n_components` and `components_available` kept) in a year where a component it rested on the year before is missing only because its source's release lags (note "source coverage ends L", L within `LAG_YEARS` = 2 of the current year), so a late release never changes the composition silently; an ended source (AidData, 2021) is not a lag. The US finance component's `source_ids` name the DFC and EXIM rows actually summed |
| `quant/say_do.py` | `say_do_gap` | standardised legislative stance (≥5 records) minus the standardised change of the economic-ties sub-index, with the doc ids and the text model's status |
| `quant/anomalies.py` | `anomaly_flag` | rule-based flags with evidence levels (DECISIONS 48) and source ids |
| `quant/network.py` | `network_metric`, `network_edge` | lender–recipient graph (networkx): degree, weighted degree, betweenness, eigenvector (largest component), greedy-modularity communities |
| `quant/events.py` | `event_effect` | event windows (t+1..t+2 vs t−2..t−1 on export shares, placebo from the series' other years) and difference-in-differences with a permutation placebo for scoped events, from `config/events.yaml` (every row carries the event's review status, title, type and source) |
| `quant/panel.py` | `regression_result` | two-way fixed-effects OLS (numpy) on export and import shares with standardised regressors; CR1 cluster SE, wild cluster bootstrap p (`--boot`, default 999), drop-one-country range; country-FE variant |
| `quant/briefs.py` | `analysis_text` | Phase 6: seven generated sections per country and for the region, each sentence with its indicator ids (`sentences_json`), template version, diff flag against the previous release; the owner's Markdown under `data/manual/interpretation/` loaded as `model = human` (front matter `drafted_by`, `reviewed`, `data_release`: the exporter reads `data_release` from the file and the site prints it beside the text, with a note when the current release is newer) |
| `quant/forecast.py` | `forecast`, `backtest` | Phase 5: five models (persistence, drift, pooled drift, AR(1) on changes, damped local linear trend) backtested on expanding windows (CRPS, MAE, 80/95% coverage, horizons 1–3), the best published only if it beats persistence; forecasts to 2030 for the index and the export shares with 5/25/75/95 percentiles of 2,000 simulated paths; three scenarios as stated yearly shifts. The fitted series is a country's latest unbroken run of published values: a share cell with no partner row and a composite held back for a lagging source are not observations, so the forecast anchors on the last published composite; a country whose run is shorter than eight years or not current is skipped and listed with the reason |
| `quant/run.py` | `quant_run` | orchestration; one row with the draws, the rank stability and the notes (source coverage, unattributed events) |

The exporter writes the per-country `analysis` block (index with sub-indices, drivers with availability
notes, concentration, say–do, flags with source references, the top network nodes, `quant_model` status),
`index.json` (the rows the map and the panels read: every published composite, for all minerals and per
mineral, plus the two sub-indices for mineral "all", each row naming its `index` (`composite`,
`economic_ties`, `political_alignment`) and its `components_available`; the composite all-minerals rows
also carry `lead`, the component available for both actors with the largest gap between their normalised
values, with `lead_gap` (China minus United States, in points of the 0–100 component scale), `lead_cn` and
`lead_us`, the same on both actors' rows and null when the actors share no component; a cell without a
value has no row) and `quant.json` (component definitions, availability, rules and counts for the
methodology page, the forecast targets with every skipped country and its reason); `meta.json` sets
`layers.analysis` to `real`. The site treats a row without `index` as a composite and hides the switch and
the "carried by" line when the fields are absent, so an older file still works.
`pipeline/config/events.yaml` is the dated event list (draft until the owner marks events `reviewed`;
the results carry the status). The country file's `analysis.event_effects` holds the country's event rows,
`quant.json` the regression table and the event list summary. The country file's `forecast` block holds the
forecast rows (baseline and scenarios), the scenario texts and the backtest status of each published model;
`quant.json` holds the full backtest table; `meta.json` sets `layers.forecast` to `real`. The country file's
`interpretation` block and `region.json`'s carry the generated sections (sentences with indicator ids, "updated"
flags) and the owner's text where a file exists; `meta.json` sets `layers.interpretation` to `generated` or
`generated+human`.

`flows.json` (one file for all twenty countries, read by the map's flow view) holds finance commitments by country, origin and year from the de-duplicated finance events (documented amounts in `amount_musd`; swap drawdowns and lower-confidence amounts reported apart) and reported exports to the United States, China and the rest of the world for all minerals and each core mineral, plus `meta.last_year` per source (DECISIONS 56). `make_sample_data.py` writes the sample counterpart from the same sample events and trade rows.

`insights.json` (one file, read by the Lab, once the Insights page) is computed at export time by `scm/insights.py` from the row lists above (DECISIONS 59): per country the latest trade year with every mineral, the share series, documented finance by year, the latest index components with the published composite, the forecast paths of every scenario and the "words" (executives', US officials' and Chinese officials' coded statements by year, the legislatures' zero-shot stance, press tone) plus the contrast indicators built from them; region-wide, statements by bloc against money by origin, event echoes by event family, the TWFE regressions with the regressors' standard deviations, annual prices per mineral, US policy attention by year and the index's normalisation bounds (`scales`) so the site's scenario studio can apply the published formula to a reader's numbers; then the generated findings (template sentences with indicator ids, an evidence level and a caveat) and the written interpretation from `data/manual/interpretation/insights.md` with its `drafted_by` label (DECISIONS 61). `meta.layers.insights` is `real` once findings exist; there is no sample counterpart (the page states the absence).

The owner's political-statements dataset (`data/manual/statements/`, DECISIONS 58) is ingested by the `manual_statements` adapter into the `statement` table and exported as each country file's `statements` block (records, the coded stance of domestic speakers by year, counts by speaker bloc) and as `region.json`'s `statements` (region-wide records and summaries); `meta.layers.statements` and `coverage[iso].statements` say what exists.

The period the project covers is one constant, `PERIOD_FROM` in `scm/period.py` (2000; `SCM_PERIOD_FROM` overrides it for a local run), read by the Comtrade adapter (its year chunks stay aligned on 2008 so the recorded file names do not move), the legislature adapters, the Federal Register filter, the Congress.gov adapter (the first Congress is the one sitting in the period's first year), the index and the insights builder. The export writes `period.json` (`{"from", "data_from", "to"}`: the project period, the first year the exported trade rows hold at or after it, and the current year) next to the other real files and the same block into `meta.json` and `flows.json meta`; the site imports `period.json` at build time for its year range (DECISIONS 73).

Two more exports feed the step-by-step pages (`scm/geometry.py`): `words.json` holds every embedded document as a point, the 384-dimensional sentence embedding folded to two dimensions by principal component analysis of the centred matrix (the explained variance is stated in the file), with the document's country, type, date, language, outlet or chamber, narrative, stance labels where coded, the original title and its English translation, and its three nearest neighbours by cosine similarity in the full space; the narratives' labels; and the "featured" documents (each narrative's record nearest its centroid) with their full vectors and their nearest and farthest records. `components.json` holds every all-minerals row of `index_component` and `index_value` with the normalisation bounds the quant run used. `classifier.json` holds the classifier page's examples: labelled, embedded records with the stance head's exact input row (embedding ⊕ actor one-hot ⊕ mention flags), the adjudicated hand codes with the pipeline's split once the validation sample is loaded and, until then, a balanced sample of the zero-shot model's own labels (`label_source` says which), plus the saved head (`data/models/stance_head_v1.json`) when one exists. A document without an embedding is not a point; the files are regenerated by every export, so `words.json` grows with each text run.

`story.json` (DECISIONS 72) is the one file written for the story home: the statement records the story quotes (`STORY_QUOTE_IDS` in `export_site.py`, keyed by statement id, in the same record shape as the country files, so the home page does not load twelve country files for a dozen quotes) and, for Chile, Argentina, Peru and Brazil, the yearly share of each named mineral's exports going to China and to the United States with the world total (`STORY_SERIES`, from the concentration rows). Everything else the story shows is derived in the browser from `flows.json`, `insights.json`, `quant.json`, `region.json` and `meta.json`. There is no sample counterpart; when the file is absent the home page says so in the cold open and leaves the mineral lanes empty.

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
| `ingest-monthly.yml` | 3rd of each month, and on demand | Tier 1 and tier 2 adapters, the legislatures and the national sources (default targets `tier1 tier2 legislature national`), fixtures, `analyse` (Phase 4), build, export, tests, commits `web/public/data/real/`, publishes a Parquet release `data-vYYYY.MM.DD.<run>`, opens an issue on failure; `targets: none` recomputes, rebuilds and re-exports without ingesting |
| `ingest-annual.yml` | 15 March | USGS, V-Dem, UNGA, DPI, BGS via the same job |
| `ingest-press.yml` | Wednesdays | The press group (the RSS adapters, then GDELT with 60 backlog windows and a 45-minute budget, then Media Cloud with a 40-minute budget of country-years, newest first) via the same job |
| `diagnose.yml` | on demand | Read-only probes of the GDELT DOC API (`what: gdelt`, `translingual`) and of Google News's robots rules (`gnews`); the job log is the record |
| `text-analysis.yml` | Thursdays, and on demand | Phase 3: restores the release, installs the `[ml]` extra (CPU torch), caches model weights, runs `scm classify` (translate, classify, embed, topics), `analyse`, build, export, tests, guard, commits site data, publishes a release; inputs `steps`, `limit`, `force`, `codebook_version`, `fields`, `draw_sample`, `train` |
| `liveness.yml` | Mondays | HEAD/GET of every registry URL → `data/liveness.json`, regenerates SOURCES.md |
| `ci.yml` | every push | lint, typecheck, unit tests, build (web and pipeline) |

Dispatch inputs of `ingest-monthly.yml`: `targets` (source ids or a group; `none` only recomputes and exports),
`fetch_only`, `gdelt_backfill_windows` (missing historical windows to fetch, about 15 s each, more when
throttled), `gdelt_time_budget_min` (GDELT stops fetching after this many minutes and leaves the rest for the
next run), `gdelt_countries` (ISO3 codes in priority order; empty = all), `gdelt_backlog_first` (fetch the historical
windows before the recent ones), `adapter_budget_min` (the cut-off for
any single adapter: set it above the GDELT budget for a backfill, `0` for no limit), `allow_empty_warehouse`,
`mediacloud_time_budget_min` and `mediacloud_years` (Media Cloud: minutes per run and an optional `YYYY-YYYY` bound),
`allow_regression`. A backfill of about 200 windows: `targets: gdelt`, `gdelt_backfill_windows: 200`,
`gdelt_time_budget_min: 150`, `adapter_budget_min: 175`, `gdelt_backlog_first: true`; the job limit is 300 minutes
and the run shares its concurrency group with the Wednesday press run and the Thursday text run, which wait for
it. Expect little from it: the run of the evening of 2026-10-09 got 10 windows in 150 minutes against 39
throttle responses, so the adapter now stops after 20 throttles in a run, and the history has to come from an
address GDELT does not throttle (next section).

The press history therefore comes from Media Cloud (`ingest/mediacloud.py`, since 2026-10-11), which answers a
registered key instead of throttling by address and whose national collections reach back to about 2010, three
years further than GDELT. The adapter runs in the weekly press group after the feeds and GDELT: per country and
year it asks for three daily count series over the country's national collection (the mineral terms alone, with
the China terms, with the United States terms), sums them into monthly `media_volume` rows (`period = YYYY-MM-01`,
`items_total` = the collection's own daily totals, so `items_mining / items_total` is a share of the indexed
collection, not of all press) and lists up to 2,000 headlines per country-year, kept as `document` rows through
the same keyword filter and outlet mapping as GDELT. Only months that have ended are written (the incremental merge
keeps the first row stored per month, so a half-counted running month would stay so); a country-year is done once
its twelve months are in the ledger, so each run resumes where the last one stopped, newest year first (the current
year is refreshed every run and gains the month that has just ended). The yearly attention chart's denominator stays
the feeds' and GDELT's totals: Media Cloud's `items_total` is its whole collection and is shown apart, by month;
`MEDIACLOUD_TIME_BUDGET_MIN` (dispatch input `mediacloud_time_budget_min`, default 40) bounds a run in minutes
and `MEDIACLOUD_YEARS=YYYY-YYYY` (`mediacloud_years`) bounds it in years. A full first fill: `targets: mediacloud`,
`mediacloud_time_budget_min: 150`, `adapter_budget_min: 175`, repeated until the manifest in `data/raw/mediacloud/`
reports `years_left: 0`. GDELT keeps running for the recent weeks and as a second index of the same outlets;
the two sources stay apart in the warehouse (`source_id`) and on the site. A first fill of the 204 country-years takes about seven hours of fetching at that pace: dispatch `targets: mediacloud` with `mediacloud_time_budget_min: 170` and `adapter_budget_min: 200` twice, newest years first; the weekly press run then keeps the current year.

The media files' `history` rows (`text/series.py`, `monthly_frame`) are one row per source and calendar
month, and the three sources are counted differently because their `media_volume` rows mean different
things. GDELT windows (half-months) and Media Cloud months are disjoint, so their rows are summed into the
month. A feed's rows are fetch days of the same rolling list (four or five a month in the weekly run, mostly
the same headlines), so they are never summed: `items_total` is the feed's largest fetch of the month (the
most items it exposed at once) with its mineral, China and US counts taken from that same fetch (the
parser's own measure, which flags an item naming a mineral or mining; the kept `document` rows carry a
narrower flag and are not used), and `n_fetches` the number of fetches; the Media tab words a feed month
as "items seen at the month's fullest fetch". The yearly attention
series uses the same monthly feed totals, so a denominator no longer grows with the number of fetches.
Media Cloud's headline lists are requested newest first, but the API answers matches in its own order, so
when a country-year has more matches than the 2,000 the adapter keeps, the kept list is a sample spread
over the year; the cut is recorded (`headlines_window`: source, year, the first and last
publication date kept, how many were kept and how many matched) in the ingest-run record, from which the
export writes `freshness.headlines_window` into the media file and the Media tab says, for example,
"headlines, 2013: 2,000 of 6,640 matching headlines kept, dated 2 Jan to 24 Nov 2013".

Each ingestion run first restores the Parquet warehouse from the latest `data-v*` release, so
running a subset of adapters (`targets: wb_wgi usgs_mcs`) refreshes only those tables and keeps
the rest. Data commits carry `[skip ci]`. Scheduled workflows are disabled by GitHub after 60 days
without repository activity; the monthly data commit keeps them alive.

## Backfilling GDELT from your own connection

GDELT throttles GitHub's shared runner addresses (LIMITATIONS, "GDELT from GitHub's runners"), so the press
history of 2017–2026 (about 1,770 half-month and monthly windows) has to be fetched from an address GDELT does
not throttle: a home or university connection, in one or several sittings. The steps are the ones the workflow
runs, on your machine, from the repository root:

1. Set up the pipeline once (`cd pipeline && python -m venv .venv && . .venv/bin/activate && pip install -e ".[dev]"`)
   and restore the warehouse from the newest data release: `gh release list --limit 5` shows the tags (the newest
   `data-v*` is the one the workflow would restore), then `gh release download <tag> --pattern 'warehouse-*.tar.gz'
   --dir /tmp/prev && tar xzf /tmp/prev/warehouse-*.tar.gz -C data`.
2. Fetch, from `pipeline/`: `GDELT_BACKFILL_WINDOWS=200 GDELT_TIME_BUDGET_MIN=150 GDELT_BACKLOG_FIRST=1 python -m scm run gdelt`.
   Each run continues where the last stopped (the ledger in `media_volume` says which windows are done); repeat
   until the manifest in `data/raw/gdelt/` reports `windows_backlog: 0`. Then `python -m scm fixtures`,
   `python -m scm analyse`, `python -m scm build`, `python -m scm export` and `pytest -q`, as the workflow does.
3. Publish: commit `web/public/data/real` and `pipeline/tests/fixtures`, push to `main` (Vercel deploys), then
   package the warehouse as a release so the next Actions run restores it instead of the older one:
   `tag=data-v$(date -u +%Y.%m.%d).local && tar czf warehouse-$tag.tar.gz -C data warehouse models && gh release create "$tag" "warehouse-$tag.tar.gz" --title "Data release $tag" --notes "Parquet warehouse from a backfill run on the owner's connection"`
   (leave out `models` if `data/models` does not exist). `restore_release.sh` takes the newest usable release by
   publication date, and the regression guard passes because the tables only grew.

GDELT's public BigQuery dataset (`gdelt-bq.gdeltv2`) would be another route within Google's free tier; it needs
a Google Cloud project in your name and a new adapter, and is not planned.

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
