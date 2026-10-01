# Phase 0 Plan — US–China Competition for Critical Minerals in South America (2008–2026)

## Context

The repository is empty (one-line README). You asked for a Phase 0 plan before any code: architecture and stack, verification of every source in section 7, a coverage matrix, a data model, a cost estimate, and a phased timeline. This document is that plan. Nothing has been built yet; approving it starts Phase 1 (UI with sample data).

Two environment facts shaped the verification work and affect Phase 2:

- **This cloud sandbox blocks almost all outbound HTTP.** Only github.com, pypi.org and the web-search backend are reachable. Every source below was verified through search-engine results, GitHub mirrors and PyPI, not by fetching the source directly. Statuses marked LIVE are high-confidence (multiple 2025–2026 references); anything I could not confirm is marked UNCERTAIN rather than guessed. You chose to run all ingestion in GitHub Actions (open egress), so the first Phase 2 workflow run doubles as the direct liveness check of every URL.
- **Budget is $0** (school project, no paid services). The plan uses only free tiers, open data and open-weight models.
- **No Python data stack is preinstalled** (Python 3.11, Node 22, pnpm, uv, psql present; pandas/pymc absent). Phase 1 starts with dependency setup.

---

## 1. Architecture and tech stack

### 1.1 Principle: separate the pipeline from the site

The site must be fast, cheap and robust; the analysis must be reproducible. So the public site never queries a live analytical database. Pipelines produce versioned data artifacts; a build step turns them into static JSON the site serves.

```
 sources (APIs, bulk files, RSS)
        │  scheduled GitHub Actions (daily/weekly/monthly)
        ▼
 ingest/  ─► raw/ (immutable snapshots, retrieval date, checksum)
        ▼
 DuckDB warehouse (Parquet-backed, documented schema, dbt-style SQL models)
        ▼
 analysis/  (Python: indices, text classification, econometrics, forecasts)
        ▼
 data release (Parquet + JSON, tagged version, DVC/git-lfs or GitHub Release)
        ▼
 web/ (Next.js, reads versioned JSON at build time; ISR for freshness)
        ▼
 Vercel (public URL)
```

### 1.2 Stack (follows your defaults in section 12; deviations flagged)

| Layer | Choice | Why |
|---|---|---|
| Frontend | Next.js 15 (App Router) + TypeScript + Tailwind | Your default. Static generation per country/year page, ISR for refreshes. |
| Map | MapLibre GL JS + Natural Earth 1:10m admin-0 (public domain), French Guiana rendered from the France map-unit polygon and styled "outside analysis" | Vector tiles not needed; a single ~1 MB GeoJSON/TopoJSON suffices. D3-geo for the project-locations layer. |
| Charts | Observable Plot (D3-based) for time series/diverging scales; Recharts fallback for simple panels | Serious, print-like aesthetic; handles uncertainty bands natively. |
| Data pipelines | Python 3.11, `uv` for env, pandas/polars, `comtradeapicall`, `wbgapi`, `requests` + per-source adapters | Your default. |
| Warehouse | **DuckDB + Parquet** as the system of record for analysis; **Postgres (Neon) optional later** for full-text search over news/parliament metadata | Deviation from "Postgres default": a managed Postgres free tier is 0.5 GB, too small for ~1M news rows, and the site doesn't need live SQL. DuckDB files are versionable, zero-cost, and reproducible. Same documented schema works in Postgres if we later need it. |
| Models | statsmodels, linearmodels (panel FE), scikit-learn, networkx, PyMC (BSTS/hierarchical), statsforecast (ARIMA baselines), BERTopic + multilingual sentence-transformers | Established, documented methods per section 9–10. |
| Text classification | **Open-weight models only, zero cost** (your constraint: no paid services). Fine-tuned multilingual encoder (`xlm-roberta-base` or `mdeberta-v3-base`) trained on a hand-coded codebook sample; zero-shot NLI model to bootstrap labels; open translation models for the UI. Training on Google Colab/Kaggle free GPU, inference on GitHub Actions CPU. Details in §1.3. | Section 8. No Anthropic API calls in the pipeline. I act as the second coder for the validation sample inside our sessions, which is free. |
| Scheduling | GitHub Actions cron (free and unlimited for public repos); one workflow per cadence (daily news, weekly parliaments, monthly trade/finance) with failure alerts via GitHub Issues auto-opened on job failure | Your default. Note: scheduled workflows auto-disable after 60 days of no repo activity; a monthly "keepalive" commit of the data release prevents this. |
| Data versioning | Parquet/JSON releases tagged `data-vYYYY.MM.DD`; large raw snapshots in GitHub Releases (2 GB/file limit) or git-lfs | Reproducibility: every site build pins a data version shown in the UI. |
| Hosting | **Your existing Vercel account** (Hobby tier is free for non-commercial use, 100 GB/month transfer, free `*.vercel.app` URL); no database hosting | Decided. A school project satisfies the non-commercial rule. |
| Tests | pytest for ingestion adapters (recorded fixtures via VCR-style cassettes), transformation unit tests, model smoke tests against known outputs; Playwright for UI; schema checks with pandera | Section 12. |
| Docs | README.md, SOURCES.md (generated from a `sources.yaml` registry so the Sources page and the docs never diverge), DECISIONS.md, LIMITATIONS.md, METHODOLOGY.md | Section 1. |

### 1.3 Free-only text analysis stack (replaces paid LLM classification)

| Task | Model / method | Where it runs | Notes |
|---|---|---|---|
| Topic (mineral, project, actor; multi-label) and stance toward US and toward China (5-point ordinal), tone | Fine-tuned `xlm-roberta-base` (or `mdeberta-v3-base`) multi-head classifier trained on the hand-coded sample | Train: Google Colab or Kaggle free GPU (minutes per run). Inference: GitHub Actions CPU (an encoder classifies roughly 5–20 docs/s; the 150k backfill splits across parallel jobs and finishes in an afternoon, or runs once on Colab in minutes) | Established approach in political text analysis; the codebook and the sample are the deliverable you review before scaling. |
| Bootstrap labels before fine-tuning | Zero-shot NLI: `MoritzLaurer/mDeBERTa-v3-base-xnli-multilingual-nli-2mil7`; sentiment: `pysentimiento` (ES/PT), `cardiffnlp/twitter-xlm-roberta-base-sentiment-multilingual` | GitHub Actions / Colab | Reported on the methodology page as the "weak" baseline the fine-tuned model must beat. |
| Hand-coded validation sample | Stratified random sample (~1,500–2,500 documents across 4 languages × 3 document types). Coder 1: you. Coder 2: me, inside our Claude Code sessions (no API cost). Disagreements adjudicated jointly. | Sessions | Produces Cohen's kappa / Krippendorff's alpha and the train/test split. Reported honestly as human + LLM-assisted coding. |
| Narrative tracking | BERTopic with `paraphrase-multilingual-MiniLM-L12-v2` embeddings | GitHub Actions CPU | Interpretable labeled topics with example documents. |
| Translation of excerpts shown in the UI | `Helsinki-NLP/opus-mt-{es,pt,nl}-en` (or NLLB-200 distilled 600M) | GitHub Actions CPU | Original kept alongside, labeled "machine translation". |
| Ownership-chain extraction from filings | Rule-based parsing of structured sources (EDGAR XBRL, ICIJ CSV, company registries) + manual curation for the anchor cases | Sessions | No generative model needed; chains are small and must be hand-verified anyway. |
| Written political analysis (Phase 6) | **Template-driven text generated from indicators** (data-to-text rules: alignment, trajectory, drivers, flags) plus your own written interpretation layer | Pipeline | More defensible academically than LLM prose; every sentence maps to a named indicator. Optional: draft prose with an open model on Colab if you want it, still free. |

Compute budget: GitHub Actions is unlimited for public repos (6 h per job, 20 parallel jobs); Colab/Kaggle free GPUs cover training. Hugging Face Hub hosts the fine-tuned model weights for free.

### 1.4 Repository layout

```
/web                 Next.js app
/pipeline            Python package: ingest/, transform/, text/, models/, forecast/
/pipeline/config     minerals.yaml, hs_codes.yaml, sources.yaml, actors.yaml, codebook.md
/data/raw            immutable source snapshots (gitignored; stored in releases)
/data/warehouse      DuckDB + Parquet (versioned releases)
/data/site           JSON consumed by the web app (committed per release)
/.github/workflows   ingest-daily.yml, ingest-weekly.yml, ingest-monthly.yml, build-release.yml
/docs                SOURCES.md, DECISIONS.md, LIMITATIONS.md, METHODOLOGY.md, DEPLOYMENT.md
```

---

## 2. Source verification

Legend: **LIVE** confirmed via 2025–2026 references; **MOVED** new URL/access path; **DEAD** no longer updated; **UNCERTAIN** could not confirm from here. Reliability uses your four categories plus "analysis" for think tanks. Every row becomes an entry in `sources.yaml` → SOURCES.md.

### 2.1 Changes you need to know about (dead, moved, or materially different from the brief)

| Source in brief | Finding | What we use instead |
|---|---|---|
| IMF Direction of Trade Statistics | Legacy portal retired Nov 2025; `dataservices.imf.org` no longer resolves. Dataset renamed **IMTS** on data.imf.org (SDMX 3.0 API, free). | `sdmx1` client against `api.imf.org/external/sdmx/3.0`, dataflow `IMF.STA/IMTS`. Same for CDIS → renamed **DIP** (direct investment positions by counterpart). |
| BU + Inter-American Dialogue "Chinese Loans to LAC" | **Archived Feb 2025**, last data 2023. No further updates. | BU GDP Center **China's Overseas Development Finance (CODF)** 2008–2024 (free, signed data-use agreement) + **AidData GCDF 3.0** (2000–2021 commitments) + Red ALC-China Monitor for FDI. |
| EXIM authorizations (data.exim.gov) | Portal closed Sept 2023. | CSV on data.gov covering FY2007–FY2025 (title stale, file current). |
| ACLED | API keys discontinued Sept 2025; OAuth login now; free research tier with download caps. | Keep ACLED (Latin America from 2018) via `acled` PyPI package; GDELT for 2008–2017 protest proxies, labeled as such. |
| Minerals Security Partnership | Superseded Feb 2026 by **FORGE** (Forum on Resource Geostrategic Engagement); MSP pages only on the 2021–2025 state.gov archive. | Track both: MSP archive for 2022–2025, FORGE pages going forward. |
| Georgetown Political Database of the Americas | Decommissioned 2010 (static archive). | Georgetown **SIGLA** + International IDEA + V-Dem/DPI for institutional variables. |
| UNCTAD bilateral FDI | Bilateral series discontinued after 2012; UNCTADstat has totals only. | IMF DIP (CDIS) counterpart positions + MOFCOM bulletin + Red ALC-China + AEI CGIT. |
| IDB Database of Political Institutions | Good news: **DPI 2023 edition published March 2026** (brief assumed 2020). | Use DPI 2023 for government ideology to 2023; extend 2024–2026 manually with sourced election outcomes. |
| USGS critical minerals list | 2025 list has **60 minerals and now includes copper and silver** (Federal Register, Nov 2025). | Mineral config defaults to the 2025 list; Chile/Peru copper now counts as "critical". |
| China export controls | Antimony is Announcement 2024 No. 33; Oct 2025 announcements 55–58/61/62 **suspended until Nov 2026** by No. 70. | Event table records both the control and the suspension as separate dated events. |
| US copper tariff | Section 232 proclamation (July 2025): 50% on semi-finished copper from Aug 2025, **ores, concentrates and cathodes exempt**. | Event-study candidate; matters for Chile/Peru flows. |
| Lithium prices | No free, licensed daily/monthly lithium benchmark exists (Fastmarkets, Benchmark, SMM all paid). | USGS annual average + customs unit values (Comtrade 2836.91 / 2825.20 value ÷ quantity, labeled "implicit realized price") + LME delayed Li hydroxide as spot-check. Paid feeds only if you approve. |
| EITI | Suriname suspended Mar 2025, lifted mid-2025; Brazil, Chile, Bolivia, Venezuela, Paraguay, Uruguay are not members. | As planned, six members; status recorded per year. |
| EJAtlas | No API; bulk CSV only on approved request (CC BY-NC-SA). | Submit a bulk request in Phase 2; OCMAL (HTML, activist) as complement, labeled partisan. |
| China customs (GACC) | Query UI only, XLSX per query, no API/bulk; foreign-IP blocking reported but unverified. | China-reported HS6 monthly data via UN Comtrade as the primary GACC proxy; direct GACC pulls only for spot cross-checks. |

### 2.2 International (7a)

| Source | Status | Access / limits | Coverage | License | Freq | Reliability |
|---|---|---|---|---|---|---|
| UN Comtrade Plus | LIVE | REST; free key: 100k rows/call, 500 calls/day; `comtradeapicall` 1.3.2 | All 12 countries, HS6 + tariff line, annual and monthly, 1988– | UN terms, attribution; no redistribution of bulk | Continuous | official |
| IMF IMTS (ex-DOTS) | MOVED | SDMX 3.0, free | Bilateral goods trade, monthly, 1948– | IMF terms | Monthly | official |
| WTO Stats API | LIVE | REST, free key | Trade by product group, tariffs | WTO terms | Annual/quarterly | official |
| USGS Mineral Commodity Summaries 2026 | LIVE | PDF + CSV/XLSX data release | 90+ commodities, world production and reserves by country, data year 2025 | Public domain | Annual (Feb) | official |
| USGS Minerals Yearbook vol. III (Latin America) | LIVE, 2–3 yr lag | PDF + XLSX tables | Country chapters; 2022 tables released, 2023 partial | Public domain | Annual | official |
| BGS World Mineral Statistics | LIVE | XLSX query tool; OGC API (beta) | 70+ commodities, 1970–2023 | UK Open Government Licence | Annual | official |
| UNCTAD WIR / UNCTADstat | LIVE (totals only) | Bulk CSV | FDI flows/stocks 1970–2024 | Open, attribution | Annual | official |
| World Bank WDI | LIVE | REST, no key; `wbgapi` | 1960– | CC BY 4.0 | Quarterly | official |
| World Bank IDS (creditor-level) | LIVE | REST source 6; bulk | PPG debt by creditor incl. China; 10 of 12 countries (not Chile, Uruguay) 1970–2024 | CC BY 4.0 | Annual | official |
| IMF DIP (ex-CDIS) | MOVED | SDMX, free | Inward/outward DI positions by counterpart 2009–2024 | IMF terms | Annual | official |
| EITI | LIVE | Country pages, summary XLSX, document API | 6 members; validations rolling | EITI open data | Annual | official (multi-stakeholder) |
| ResourceContracts.org | LIVE | REST `api.resourcecontracts.org`, CSV | 3,343 contracts, 107 countries incl. PE, CO, EC, GY, AR | Open | Continuous | independent/academic |
| World Bank WGI | LIVE | XLSX; WB API source 3 | 1996–2024 | CC BY 4.0 | Annual | official |
| V-Dem v16 | LIVE | CSV bulk (registration); no Python package | 1789–2025 | CC BY-SA 4.0 | Annual (Mar) | independent/academic |
| IDB DPI 2023 | LIVE | XLSX/CSV | 1975–2023 | IDB open data | Irregular | official/academic |
| UNGA voting (Bailey/Strezhnev/Voeten) | LIVE | Harvard Dataverse CSV; raw votes via UNGA-DM to Jan 2025 | Sessions 1–79 | CC0 / Dataverse | Annual | independent/academic |
| GDELT 2.0 Events/GKG/DOC API | LIVE | Raw CSV files free; BigQuery 1 TB/month free then $6.25/TB; DOC API free, polite rate | 2015– (Events 1.0 from 1979); 65 languages incl. ES/PT | Open, attribution | 15 min | independent (automated, noisy) |
| ACLED | LIVE (OAuth) | REST; free research tier, caps | Latin America 2018– | ACLED terms, no redistribution | Weekly | independent (NGO) |
| Media Cloud | LIVE | REST; free key, 4,000 req/week; `mediacloud` 5.1 | National collections, ES/PT, 2008– (density varies) | Terms; counts and URLs only | Continuous | independent/academic |
| EJAtlas | LIVE (bulk on request) | HTML; CSV by request | 4,000+ cases | CC BY-NC-SA 3.0 | Continuous | independent/activist |
| OCMAL | LIVE | HTML only (scrape) | 250+ conflicts, company-linked | Not stated | Irregular | partisan (activist network) |

**HS6 mapping confirmed** (HS 2017/2022, unchanged in HS 2022): 2836.91 lithium carbonate; 2825.20 lithium oxide/hydroxide (shared code, cannot split LiOH); 2603.00 copper ores and concentrates; 7403.11 refined copper cathodes; 2846.10/.90 rare-earth compounds; 2615.90 niobium/tantalum/vanadium ores; 7202.93 ferroniobium; 2504.10/.90 natural graphite; 2604.00 nickel ores; 2609.00 tin ores; 2616.10 silver ores; 2613.10/.90 molybdenum ores. Additions: 2605.00 cobalt ores; 2530.90 (spodumene has no dedicated code, labeled as such); 2612.10 uranium ores; 2805.19 lithium metal; 8505.11 permanent magnets. These go in `hs_codes.yaml` with stage tags.

### 2.3 United States (7b)

| Source | Status | Access / limits | Notes |
|---|---|---|---|
| USGS 2025 critical minerals list; DOE critical materials list (2023, amended May 2025) | LIVE | HTML/PDF, public domain | Mineral config seeds. |
| Census International Trade API (`api.census.gov/data/timeseries/intltrade`) | LIVE | REST, optional free key; monthly HS10 by partner 2013– | Only HS10 monthly US-side source. |
| DFC active projects | LIVE | Quarterly XLSX, no API | Diff quarterly snapshots. |
| EXIM authorizations | MOVED | data.gov CSV FY2007–FY2025 | See 2.1. |
| USAspending API | LIVE | REST, no key | Limited minerals relevance; DoD/DOE awards. |
| State Dept MSP → FORGE; embassy press releases | MOVED | HTML; embassy sites are WordPress so `/feed/` RSS likely, unverified | Test RSS before scraping. |
| Congress.gov API v3 | LIVE | Free key, 5,000 req/hour; bills, hearings, CRS reports, House votes (beta) | |
| Federal Register API | LIVE | REST, no key | EO 14241 (Mar 2025), Section 232 critical minerals (Apr 2025), copper proclamation (Jul 2025). |

### 2.4 China (7c)

| Source | Status | Access | Reliability | Notes |
|---|---|---|---|---|
| MOFCOM OFDI Statistical Bulletin | LIVE | PDF only; 2024 bulletin Sept 2025; English edition lags | official (state) | OFDI by destination, HK/Cayman routing dominates. |
| GACC customs statistics | LIVE, query-only | HTML query UI, XLSX per query; no bulk | official (state) | Primary proxy: China-reported data in Comtrade. |
| MOFCOM export-control announcements | LIVE | HTML (zh); mirrored in EN by law firms and IEA policy DB | official (state) | Full announcement list in 2.1. |
| Chinese embassies (`<cc>.china-embassy.gov.cn/esp/sgxw/`) | LIVE | HTML, no RSS; URL pattern confirmed for Argentina | state-controlled | Scrape index pages, respect robots. |
| Xinhua Spanish | LIVE | RSS feeds incl. "China-Iberoamérica" | state-controlled media | People's Daily Spanish RSS uncertain. |
| CDB / China Exim | no loan-level disclosure | Annual report PDFs | state | Rely on 2.5 databases. |

### 2.5 China–Latin America databases (7d)

| Source | Status | Access / license | Coverage | Reliability |
|---|---|---|---|---|
| BU CODF (replaces CLLAC) | LIVE | XLSX after signed DUA; non-commercial, cite | CDB/CHEXIM loans 2008–2024, 1,304 loans | independent/academic |
| AidData GCDF 3.0 | LIVE | XLSX/CSV + GeoJSON; free with citation | 20,985 projects, commitments 2000–2021 | independent/academic |
| AEI/Heritage China Global Investment Tracker | LIVE | XLSX, free with citation; updated Jan and Jul 2026 | Investments and construction ≥$100m, 2005– | think tank; label "analysis-sourced data" |
| Red ALC-China Monitor de la OFDI | LIVE (2026 edition) | PDF; transaction table format uncertain | 678 transactions 2000–2024 | independent/academic |
| Dialogue Earth (ex Diálogo Chino) | LIVE, rebranded | HTML; RSS likely at `/es/feed/` | 2014– | independent journalism |
| CSIS, Atlantic Council, Inter-American Dialogue, CFR | LIVE | HTML/PDF | commentary | analysis only |

### 2.6 Prices and regional (7f, 7g)

| Source | Status | Notes |
|---|---|---|
| World Bank Pink Sheet | LIVE | Monthly XLSX, CC BY 4.0: copper, nickel, tin, silver, aluminum, iron ore, lead, zinc. No lithium, cobalt, REE, graphite. |
| IMF Primary Commodity Prices | LIVE | SDMX; includes cobalt, uranium; lithium uncertain. |
| LME | LIVE, limited | Delayed daily prices after free registration; historical bulk paid; no redistribution. |
| CEPALSTAT | LIVE | Open Data API (JSON) + SDMX structure. |
| ECLAC FDI in LAC report | LIVE | 2025 edition (Nov 2025) has a critical-minerals chapter; 2026 summary already out. |
| IDB INTrade → INTEGRA | MOVED | New platform integra.iadb.org; CSV export; API uncertain. |
| Georgetown PDBA → SIGLA; International IDEA | DEAD → replaced | See 2.1. |

---

### 2.7 National sources (7h), condensed per country

Columns: Official data (actions) / Legislature and gazette / Press. Full per-source rows (URL, license, update frequency) go into `sources.yaml` in Phase 2; here only what changes the plan.

**Argentina**
- Official: SIACAM datasets on datos.gob.ar (CKAN API, CC BY 4.0; monthly mineral exports, lithium exports, project portfolio) LIVE; SEGEMAR SIGAM geoservices (WMS/WFS) LIVE; INDEC comex query tool (NCM8 × country × month, bulk 2002–2020, later months via monthly report downloads, **no REST API**) LIVE; RIGI: official Economía page + Boletín Oficial resolutions (21–22 approvals, ~US$47bn by Aug 2026; lithium: Rincón, Sal de Oro, Exar, Tres Quebradas; copper: Los Azules) LIVE; provincial cadastres via unified SIACAM viewer plus Salta IDESA WFS and Jujuy JEMSE, contracts opaque.
- Legislature: HCDN datos abiertos (CKAN; **roll-call votes per deputy from 2011**, bills, Diarios de Sesiones dataset) LIVE, best in region after Brazil; Senado open data has bills/sessions but **no structured roll-call dataset** (scrape vote pages or argentinadatos.com); Boletín Oficial has no API/RSS, several community scrapers exist.
- Press: La Nación, Clarín, Infobae, Página/12, El Cronista all LIVE with RSS; Clarín, La Nación, El Cronista metered paywalls. Orientation documented (La Nación centre-right, Clarín centrist-right anti-kirchnerist, Página/12 left/kirchnerist, Infobae centrist pro-market, El Cronista business).

**Bolivia**
- Official: YLB publishes the CBC (CATL consortium) contract; Uranium One contract referenced; **neither ratified by the legislature; court suspension May 2025; Paz government (Nov 2025) announced a new lithium law Jan 2026; Sept 2026 decree on reorganising loss-making SOEs puts YLB itself in question**. Ministerio de Minería quarterly bulletins and Anuario (PDF only). INE exports by country × product (XLSX, monthly 2017–, annual 2010–; no API). COMIBOL UNCERTAIN.
- Legislature: **no open-data API, no roll-call datasets, no transcript datasets** (HTML news only). Gaceta Oficial metadata searchable, full text paywalled (subscription) → lexivox.org as free replacement.
- Press: El Deber, Los Tiempos, La Razón (paywall), Opinión (RSS confirmed) LIVE; RSS for the others UNCERTAIN.

**Brazil**
- Official: ANM open data MOVED to dadosabertos.anm.gov.br (AMB production by substance/municipality from 2010, SIGMINE shapefiles, CFEM royalties; daily); GeoSGB downloads; **Comex Stat REST API + bulk CSV, NCM × country × month 1997–Aug 2026** (wrappers: comexpy, comex-fetcher); BNDES operations dataset 2002– (CKAN); CMOC niobium figures from company reports, cross-checked with ANM and Comex Stat (NCM 2615.90, 7202.93). **Bill PL 2780/2024 became Lei 15.506/2026 (Política Nacional de Minerais Críticos e Estratégicos), Senate approval Sept 2026**: key event for the event-study list.
- Legislature: Câmara API v2 (proposições, nominal votes, speeches; bulk per year) and Senado open data (votações nominais, discursos) both LIVE, no auth; DOU searchable via in.gov.br JSON search (Querido Diário is municipal only, not a DOU source). Python wrapper DadosAbertosBrasil 2.1.0.
- Press: Folha, Estadão, O Globo, Valor all LIVE with RSS, all metered paywalls.

**Chile**
- Official: Cochilco Anuario 2025 (XLSX 2005–2024 incl. exports by destination) + monthly bulletin LIVE; Sernageomin anuario (PDF) and online cadastre; Codelco Memoria 2025; **Codelco–SQM JV "NovaAndino Litio" formalised Dec 2025, runs to 2060; Tianqi lost its Supreme Court challenge Jan 2026 and is trimming its SQM stake**; Corfo lithium contracts dispersed (BCN reports, Cámara documents, Albemarle SEC 8-K exhibit), no single repository; first CEOL signed Sept 2025 (ENAMI with Rio Tinto); Banco Central API (free registration, `bcchapi`); Aduanas exports by country × product XLSX and datos.gob.cl.
- Legislature: Cámara opendata.camara.cl (**SOAP/XML web services**, per-deputy votes, sessions, transcripts) and Senado XML services LIVE; BCN SPARQL endpoint open, **Ley Chile web service now requires an API key**; Diario Oficial free electronic since Aug 2016, no API.
- Press: La Tercera (paywall), El Mercurio (paywall; use Emol free), BioBioChile, CIPER, El Mostrador LIVE.

**Colombia**
- Official: ANM AnnA Minería cadastre (WFS + Socrata datasets on datos.gov.co), Servicio Geológico open data (ArcGIS Hub), UPME SIMCO monthly PDFs (no API), **DANE export microdata from 2008 (registration)**, all LIVE.
- Legislature: Cámara bills XLSX/Socrata from 2008–09, no roll-call dataset (votes inside PDF actas); **Senado website returns 403 to automated access**; Gaceta del Congreso PDFs; Congreso Visible (Uniandes, since 1998) as structured secondary source, scraping terms UNCERTAIN.
- Press: El Tiempo, El Espectador, Semana all paywalled; La Silla Vacía free. **Semana shifted to right-wing/uribista line after the 2020 Gilinski takeover** — stance coding must treat pre- and post-2020 Semana as different outlets.

**Ecuador**
- Official: mining cadastre exposed as an **ArcGIS REST MapServer** (queryable JSON) LIVE, though the regulator was re-split in 2025 (ARCERNNR → ARCOM), domain to verify; ministry statistics only in quarterly BCE "Reporte Minero" PDFs; BCE exports XLSX plus CKAN datasets (CC BY) from 2010; ENAMI EP annual reports.
- Legislature: bills database and **plenary votes page** (datos.asambleanacional.gob.ec/votaciones) LIVE, HTML only; actas archive to 1979; **Registro Oficial free and electronic since Jan 2020** (pre-2020 via paid aggregators).
- Press: El Universo (RSS; **sold in 2025 to a new owner group, watch for line change**), El Comercio, Primicias, GK LIVE.

**Guyana**
- Official: GGMC commodities CSV 1979–2024 LIVE; Bureau of Statistics trade tables; GYEITI reports FY2017–2023 (suspended 2023, lifted 2024; 2026 validation outcome UNCERTAIN).
- Legislature: Hansard PDFs (12th and 13th Parliaments confirmed, earlier years UNCERTAIN), bill status pages, no API, no structured votes.
- Press: **Stabroek News ceased publication 15 March 2026 (liquidation); archive at risk, snapshot early in Phase 2**; Kaieteur News (populist, anti-establishment) LIVE; Guyana Chronicle LIVE but **state-owned**, label accordingly; Demerara Waves, News Room as additions.

**Paraguay**
- Official: BCP SICEX trade query + monthly XLSX since 1994 LIVE, no API; INE on datos.gov.py (CKAN); mining viceministry statistics UNCERTAIN; critical-mineral activity is exploration-stage only (titanium Alto Paraná, uranium, REE prospecting).
- Legislature: **SILpy + datos.congreso.gov.py REST API (bills, votes, sessions from 2007)** LIVE, note a civil-society complaint about reuse restrictions, check terms.
- Press: ABC Color (RSS, metered paywall, conservative-liberal), Última Hora (centrist), La Nación PY (**Cartes-family owned, partisan**).
- Political variable: still recognises Taiwan; Peña state visit to Taipei May 2026 with new MOUs; Chinese pressure and agro-lobby pressure both intensifying.

**Peru**
- Official: MINEM Boletín Estadístico Minero (monthly PDF + XLSX annexes) and Cartera de Proyectos (annual PDF with owner/country of capital), INGEMMET GEOCATMIN (shapefile download + ArcGIS REST), SUNAT Aduanet (HTML forms, firm-level), **BCRPData REST API (no auth)**, Defensoría del Pueblo monthly conflict reports (PDF since 2004), all LIVE. Chancay: 342k containers in 2025, Jan–Jul 2026 +74% y/y; COSCO litigating Ositrán oversight.
- Legislature: **bicameral since 24 July 2026**; bill portal has an undocumented REST API (`api.congreso.gob.pe/spley-portal-service`, keyed by chamber) covering 10+ years; votes and attendance PDF only; Diario de los Debates PDF; El Peruano searchable with SPIJ open dataset. Community scrapers exist (AGPL).
- Press: El Comercio and Gestión (RSS, paywalled, Grupo El Comercio), La República (centre-left, free), OjoPúblico and IDL-Reporteros (investigative, free).

**Suriname**
- Official: ABS trade statistics PDF only; **EITI site MOVED to eitisuriname.gov.sr** (reports FY2016–2023/24; suspended Mar 2025, lifted mid-2025); ministry site UNCERTAIN; rely on EITI + company reports (Zijin Rosebel 95% since 2023, Newmont Merian).
- Legislature: De Nationale Assemblée publishes bills and committee reports (Dutch, PDF); verbatim Handelingen and roll-call votes digital availability UNCERTAIN; no API.
- Press: De Ware Tijd (RSS), Starnieuws LIVE, Dutch, no paywall.

**Uruguay**
- Official: **Uruguay XXI export series 2001–Aug 2026 by destination, NCM10, company (XLSX, refreshed every 48h)** is the best trade source; BCU XLS; INE; Dinamige cadastre WMS/WFS.
- Legislature: Parlamento open data on catalogodatos.gub.uy (bills since 1985, Diarios de Sesiones, full-text search); structured roll-call dataset UNCERTAIN.
- Press: El País UY, El Observador (RSS), Búsqueda paywalled; la diaria (RSS) mostly open.
- Political variable: Orsi state visit to Beijing Feb 2026 (19 agreements); bilateral FTA de-prioritised in favour of a Mercosur–China track.

**Venezuela**
- Official: ministry site is propaganda-grade with no series; **BCV resumed publication in Mar–Apr 2026 after a ten-year silence** (gaps 2015–2025 remain); Venezuela stopped reporting to Comtrade around 2013 (exact year to confirm in Comtrade metadata) → partner-reported mirror data throughout, labeled.
- Independent: Transparencia Venezuela (gold reports, in exile), SOS Orinoco (satellite monitoring of Arco Minero, geolocated) LIVE.
- Legislature: Chavista AN (VI Legislature installed Jan 2026) site LIVE, transcripts UNCERTAIN; 2015 opposition AN site LIVE but post-Jan 2025 activity UNCERTAIN; both recorded with the contested-legitimacy flag.
- Press: Efecto Cocuyo, El Pitazo, Runrunes unblocked inside Venezuela Sept 2026; Tal Cual still blocked; all LIVE, free, many staff in exile.
- Context affecting data (reported by search results, to be re-verified with direct fetches): a US operation in Jan 2026 removed Maduro, Delcy Rodríguez is acting president, and military deployments in mining zones followed in June 2026. Expect discontinuities in every official series and a surge of US-linked mining news from 2026.

### 2.8 Companies and ownership (7e)

| Source | Status | Access and terms | Plan |
|---|---|---|---|
| SEC EDGAR full-text search + data.sec.gov | LIVE | Free, 10 req/s, User-Agent with contact required; `edgartools` 5.59 | Primary for US-listed and cross-listed firms (Albemarle, Freeport, SQM 20-F, Lithium Argentina 40-F, Tianqi via SQM filings). |
| SEDAR+ | LIVE, **no API; terms prohibit scraping and database building** | Bulk only via paid licence | Do not scrape. Use SEC filings of cross-listed issuers and company investor-relations pages for Canadian juniors. |
| HKEXnews | LIVE, **no API; 2025 terms ban scraping and text/data mining** | — | Do not scrape. Use company IR pages (Zijin, Ganfeng, CMOC, COSCO Shipping Ports) which republish the same announcements. |
| SSE / SZSE / cninfo | LIVE | Undocumented JSON endpoints, Chinese-language PDFs, terms UNCERTAIN | Spot use for Ganfeng/Tianqi A-share announcements; label. |
| OpenCorporates API | LIVE | Free tier 50 calls/day; public-benefit free access by application | Apply for public-benefit access in Phase 2; otherwise manual lookups for the anchor chains. |
| ICIJ Offshore Leaks | LIVE | Full CSV (ODbL + CC BY-SA), snapshot July 2026; Neo4j dump on GitHub | Load into the ownership graph as leads only, always corroborated. |

Anchor-deal status (Oct 2026, for sanity-checking what the pipeline must capture): Tianqi–SQM and the Codelco JV; Ganfeng Cauchari-Olaroz Stage 2 (RIGI May 2026) and Mariana (producing since Feb 2025); Zijin Tres Quebradas (plant Sept 2025, Phase 2 RIGI July 2026); CATL/CBC–YLB contract not in force; CMOC 2025 record niobium output; COSCO Chancay traffic growth and regulatory litigation; US–Argentina swap line (Oct 2025), trade framework (Nov 2025), critical-minerals supply instrument (2026), US$7bn loan facility (Sept 2026); US–Chile joint declaration (Mar 2026) and mining cooperation agreement (Apr 2026). All go in as `deal_event` rows with their source links.

### 2.9 Map data

| Source | Status | Notes |
|---|---|---|
| Natural Earth 1:10m admin-0 (v5.1.2 release, public domain) | LIVE | `admin_0_countries` merges French Guiana into France; `admin_0_map_units` has French Guiana as its own unit (GUF). We build our own TopoJSON from map_units so French Guiana can be drawn and labeled "French territory, outside analysis". |
| topojson/world-atlas | ARCHIVED (2023, Natural Earth 4.1) | Not used. |
| Project locations | Mixed | MINEM Peru cartera, Chile Cochilco investment catastro, Argentina SIACAM portfolio, ANM SIGMINE, Ecuador/Colombia cadastre services; Inter-American Dialogue Regional Repository of Chinese Investments (georeferenced, 8 countries, Mar 2025, license UNCERTAIN); USGS OFR 2017-1079 facilities; USGS MRDS (stale 2011). Project table assembled from these with per-row source. |

## 3. Coverage matrix

Scale: **S** strong (structured, machine-readable, back to 2008 or earlier), **M** moderate (available but PDF/HTML, partial years, or scraping needed), **W** weak (fragmentary), **A** absent. Year = first year with usable digital records.

| Country | Trade flows | Finance and deals (CN/US) | Production, concessions | Parliament: bills | Parliament: roll-call votes | Parliament: transcripts | Gazette | Media (national press) | Conflict/protest |
|---|---|---|---|---|---|---|---|---|---|
| Argentina | S (2002; Comtrade) | S (CODF, AidData, CGIT, DFC, RIGI) | S (SIACAM 2010s, cadastre GIS) | S (2011) | S Diputados (2011) / W Senado | S (dataset) | M (no API) | S (RSS; 2 paywalls) | S (ACLED 2018; EJAtlas; GDELT 2015) |
| Bolivia | M (INE XLSX 2010; Comtrade) | M (YLB contracts, CODF, AidData) | M (PDF bulletins) | W | A | A | M (metadata free, text paid) | M (RSS partly) | S |
| Brazil | S (1997, API) | S (BNDES 2002, CGIT, AidData) | S (ANM daily, 2010) | S (API) | S (API) | S (API speeches) | S (searchable) | S (RSS; all paywalled) | S |
| Chile | S (Cochilco 2005, Aduanas, BCCh API) | S (CGIT, SEC filings for SQM/Albemarle) | S (Cochilco, cadastre) | S (XML) | S (XML, ~2002) | S (XML) | S (2016 e-edition; BCN earlier) | S (3 free, 2 paywalled) | S |
| Colombia | S (DANE microdata 2008) | M (CGIT, DFC; little CN mining) | S (AnnA WFS, SGC) | M (2008, XLSX) | W (PDF actas only) | M (Gaceta PDF) | M | M (3 paywalled) | S |
| Ecuador | S (BCE 2010) | S (AidData loans-for-oil, CGIT, Mirador/EcuaCorriente) | M (ArcGIS cadastre; PDF stats) | M (HTML DB) | M (HTML votes page) | M (actas archive) | S (free since 2020) | M | S |
| Guyana | M (BoS tables; Comtrade) | M (Bosai bauxite, CGIT, ResourceContracts) | M (GGMC CSV 1979–2024, EITI) | M (PDF) | A | M (Hansard PDF) | W | W after Mar 2026 (Stabroek closed); M before | M |
| Paraguay | S (BCP 1994) | W (little CN; Taiwan ties) | W (exploration only) | S (API 2007) | S (SILpy) | M | W | S (RSS; 1 paywall) | M |
| Peru | S (BCRP API, SUNAT, Comtrade) | S (CGIT, MINEM cartera with capital origin, DFC) | S (MINEM monthly, GEOCATMIN) | S (API, 10+ yrs) | M (PDF) | M (PDF) | S (2011) | S (2 paywalled) | S (Defensoría 2004; ACLED) |
| Suriname | M (ABS PDF; Comtrade mirror) | M (EITI, Zijin/Newmont reports) | M (EITI 2016–2024) | M (Dutch PDF) | A | W | W | M (Dutch, free) | M |
| Uruguay | S (Uruguay XXI 2001, company-level) | W (no mining; China FTA/trade politics) | W | S (1985) | W (in Diario) | S (Diario de Sesiones) | M | S (3 paywalled) | M |
| Venezuela | M (mirror only; own reports end ~2013) | M (AidData, CODF to 2024; CGIT; NGO reports) | A official / M NGO (SOS Orinoco) | W (contested) | A | W | W | M (independent, exile) | M (ACLED, NGOs) |

Cross-cutting: international sources (Comtrade, USGS, BGS, WGI, V-Dem, UNGA votes, DPI) are **S for all 12 countries 2008–2024**, with 2025–2026 partial. GDELT gives all 12 countries machine-coded events and tone from 2015 (events) and 1979 (v1, cruder), labeled as automated.

Implications for sequencing: Brazil, Chile, Argentina, Peru can reach full three-layer coverage first; Colombia, Ecuador, Paraguay, Uruguay next; Bolivia, Guyana, Suriname, Venezuela will show visible gaps in the Parliament tab that the UI must display as "no structured records available" rather than as zero activity.

---

## 4. Data model

Core design rules: every fact row carries provenance (`source_id`, `source_url`, `retrieved_at`, `original_language`, `reliability`, `confidence`); model outputs live in separate tables from facts; interpretation lives in a third group. Nothing is estimated silently: `value_type ∈ {reported, mirror, estimated}` with `method` required when estimated.

### 4.1 Reference tables

- `country(iso3 PK, name, in_scope bool, notes)` — 12 in scope + GUF (French Guiana, out of scope).
- `mineral(mineral_id PK, name, on_us_list bool, on_cn_list bool, group)` — configurable from `minerals.yaml`.
- `hs_code(hs6 PK, mineral_id FK, stage ∈ {ore, concentrate, intermediate, refined}, description)` — explicit mapping file.
- `actor(actor_id PK, name, type ∈ {government, embassy, policy_bank, dfi, soe, private_company, listed_company, subsidiary, multilateral}, ultimate_origin ∈ {US, CN, other, unknown}, origin_country, lei, ticker, exchange)`.
- `ownership_link(parent_actor_id, child_actor_id, share_pct, from_date, to_date, jurisdiction, evidence_source_id)` — the ownership chain; `ultimate_origin` is derived by walking links.
- `source(source_id PK, name, url, type, reliability ∈ {official, independent_academic, partisan, state_media, analysis}, license, update_frequency, coverage_from, coverage_to, country_iso3, language)` — generated from `sources.yaml`; drives SOURCES.md.
- `project(project_id PK, name, country, mineral_ids[], lat, lon, stage ∈ {exploration, development, production, closed}, operator_actor_id, start_year, source_id)`.

### 4.2 Fact tables ("Actions")

- `trade_flow(reporter, partner, hs6, year, month?, flow ∈ {X, M}, value_usd, qty, qty_unit, source_id, value_type, retrieved_at)` — Comtrade, national customs, GACC, US Census; mirror rows kept side by side for cross-checks.
- `trade_discrepancy(reporter, partner, hs6, year, source_a, source_b, value_a, value_b, ratio, flag)` — derived, but stored as fact-adjacent evidence.
- `finance_event(event_id PK, country, date, actor_lender_id, actor_borrower_id, type ∈ {loan, equity, grant, guarantee, bond}, amount_usd, currency, purpose, mineral_ids[], project_id?, source_ids[], dedup_cluster_id, confidence)` — BU/IAD loans, AidData, AEI CGIT, DFC, EXIM, BNDES; deduplicated by cluster with all source links kept.
- `deal_event(event_id PK, country, date, type ∈ {acquisition, stake, offtake, concession, contract, jv, mou, agreement, tariff, export_control, sanction}, actors[], amount_usd?, mineral_ids[], project_id?, description, source_ids[], confidence)`.
- `production(country, mineral_id, year, qty, unit, source_id, value_type)`; `reserves(...)` similarly — USGS, BGS, national.
- `price(mineral_id, date, price, unit, source_id)` — Pink Sheet, IMF.
- `governance(country, year, indicator, value, source_id)` — WGI, V-Dem, DPI, UNGA ideal-point distance to US and CN.
- `conflict_event(country, date, type, mineral_id?, project_id?, source_id)` — ACLED, EJAtlas, OCMAL, Defensoría del Pueblo.
- `election(country, date, type, outcome, ideology_change, source_id)`.

### 4.3 Text tables ("Parliament" and "Media")

- `document(doc_id PK, country, source_id, doc_type ∈ {bill, debate, vote, hearing, press_release, news, gazette, policy}, date, title_original, language, url, outlet_or_chamber, author?, text_hash, retrieved_at, full_text_stored bool)` — full text stored only for public records (parliaments, gazettes); for news only headline/lead/metadata.
- `doc_translation(doc_id, field, lang_to, text, method ∈ {llm, mt}, model)` — original kept alongside.
- `doc_classification(doc_id, run_id, topic_mineral_ids[], topic_actor_ids[], mentions_us bool, mentions_cn bool, stance_us ∈ [-2..2], stance_cn ∈ [-2..2], tone ∈ [-1..1], frame, confidence, model, codebook_version)`.
- `vote(vote_id PK, doc_id, country, chamber, date, result, yes, no, abstain, source_id)`; `vote_member(vote_id, member_id, party, choice)`.
- `topic_model_run(run_id, method, params, n_docs)`; `topic(run_id, topic_id, label, keywords[], example_doc_ids[])`; `doc_topic(doc_id, run_id, topic_id, prob)`.
- `validation_sample(doc_id, coder, label_set json, round)`; `validation_metric(run_id, class, precision, recall, f1, kappa, alpha, n)` — published on the methodology page.

### 4.4 Model-output tables (layer 2 in the UI)

- `index_value(country, year, actor ∈ {US, CN}, index_name, value, lower, upper, weights_version, method_version)` plus `index_component(country, year, actor, component, normalized_value, weight)`.
- `concentration(country, mineral_id, year, metric ∈ {hhi_export_dest, hhi_investor_origin, share_us, share_cn, rca}, value)`.
- `say_do_gap(country, year, actor, rhetoric_score, action_score, gap, evidence_doc_ids[])`.
- `anomaly_flag(flag_id, country, year, type, evidence_level ∈ {documented, strongly_indicated, speculative}, description, evidence_source_ids[], score)`.
- `forecast(country, mineral_id?, actor?, target, horizon_year, model, point, p05, p25, p75, p95, scenario_id, backtest_run_id)`; `backtest(run_id, model, target, train_end, test_period, crps, brier?, coverage_80, coverage_95, beats_naive bool)`.
- `network_metric(run_id, node_id, degree, betweenness, eigenvector, community)`.

### 4.5 Interpretation tables (layer 3)

- `analysis_text(country?, scope ∈ {country, regional}, version, date, section, text_md, supporting_indicator_ids[], model, reviewed_by_human bool)`.

### 4.6 Operational

- `ingest_run(run_id, source_id, started_at, status, rows, error, data_version)` — drives the freshness indicator and the refresh schedule shown in the UI.

---

## 5. Cost estimate

Constraint from you: **no paid services at all** (school project). The plan below is $0 end to end; the only requirement is that the GitHub repository stays public, which is what makes Actions minutes unlimited.

### 5.1 Hosting and infrastructure

| Item | Choice | Cost |
|---|---|---|
| Web hosting | Your Vercel account, Hobby tier (non-commercial, 100 GB/month transfer, free `*.vercel.app` URL) | $0 |
| Database | None (DuckDB + Parquet in the pipeline, static JSON on the site) | $0 |
| Scheduled pipelines and model inference | GitHub Actions on a public repo (unlimited minutes, 6 h/job, 20 parallel jobs) | $0 |
| Model training | Google Colab or Kaggle free GPU sessions | $0 |
| Model weights hosting | Hugging Face Hub | $0 |
| Data storage and versioning | GitHub Releases for Parquet snapshots (≤2 GB/file); git for the site JSON | $0 |
| Map | Self-served Natural Earth GeoJSON (public domain) | $0 |
| Domain | `*.vercel.app` (a custom domain would be ~$12/year, not needed) | $0 |

### 5.2 Data sources

Every source in section 7 has a free path: UN Comtrade free registered key (500 calls/day, 100k rows/call, enough for 12 reporters × ~40 HS codes × 19 years annual plus monthly for the top flows); ACLED free research access; BU CODF free after a signed data-use agreement; AidData, AEI CGIT, V-Dem, UNGA votes, WGI, DPI free downloads; Media Cloud free key (4,000 requests/week); GDELT raw files (we avoid BigQuery, which bills per query). Excluded: paid price feeds (Benchmark, Fastmarkets, S&P), SEDAR+ bulk licence, OpenCorporates paid tiers (we apply for the free public-benefit tier). Lithium prices come from USGS annual averages and customs unit values, labeled as such.

### 5.3 Text analysis

$0. See §1.3: fine-tuned open multilingual encoder for classification, zero-shot NLI bootstrap, BERTopic, open translation models, template-driven analysis text. The hand-coded validation sample is produced by you and me within our sessions. No Anthropic API key is used anywhere in the pipeline, so there is nothing to bill.

Rough compute: 150k news documents + 25k parliamentary documents classified once in backfill (hours of CPU across parallel Actions jobs, or minutes on a Colab GPU); ~6,000 documents/month ongoing (minutes).

### 5.4 Total

**$0 build, $0/month.** The trade-off versus a paid LLM: stance classification quality depends on the size and quality of the hand-coded training sample, so Phase 3 budgets more coding time rather than money.

---

## 6. Timeline and milestones

Estimates assume I work in long autonomous sessions and you review at phase boundaries. Each phase ends with a written status (what runs, what is missing, what broke, recommendation).

| Phase | Deliverable | Milestone check | Duration |
|---|---|---|---|
| 1 — UI | Next.js site with map, year slider + play, actor toggle, mineral filter, 5-tab country panel, regional overview, methodology, sources page, freshness indicators; **SAMPLE DATA** banner everywhere; deployed to Vercel preview | You can click through every country and tab on a public preview URL | 2 sessions |
| 2a — Core pipelines | `sources.yaml` registry; adapters for Comtrade, USGS, BGS, World Bank, WGI, V-Dem, UNGA votes, Pink Sheet; BU/IAD loans, AidData, AEI CGIT, DFC, EXIM, USAspending; Congress.gov, Federal Register; DuckDB warehouse; tests; GitHub Actions schedules; SOURCES.md generated | Trade, production, finance, governance tables populated 2008–2025 for all 12 countries with provenance; discrepancy report produced | 3–4 sessions |
| 2b — National and text pipelines | Legislature adapters (Brazil, Chile, Argentina, Uruguay, Colombia first; others via scrapers where terms allow), gazette and press metadata ingestion (RSS + GDELT/Media Cloud), ownership chain from EDGAR/HKEX/SEDAR+ for the anchor cases | Document table populated; anchor deals captured end-to-end with ownership chains | 3–4 sessions |
| 3 — Text analysis | Codebook (for your review before scale); stratified sample drawn; coding rounds (you + me, with adjudication); fine-tune the multilingual encoder on Colab/Kaggle; inference workflow on Actions; kappa/alpha and per-class P/R/F1 versus the zero-shot baseline; BERTopic narratives; attention metrics; methodology page updated | Validation metrics published; fine-tuned model beats the zero-shot baseline; Parliament and Media tabs show real data | 3–4 sessions (coding time is the bottleneck) |
| 4 — Quantitative | Composite influence index per OECD/JRC handbook with sensitivity analysis; HHI/shares/RCA; event studies and DiD around listed events; panel FE regressions with robustness; say–do gap; anomaly flags with evidence levels; firm–bank–government network | Analysis tab live; methodology page documents each method and its limits | 3 sessions |
| 5 — Forecasting | BSTS/state-space and hierarchical Bayesian models vs ARIMA/naive; backtests train ≤2019/2020, test 2021–2026; CRPS, interval coverage; Monte Carlo scenarios | Forecast tab live, with models shown only if they beat baselines; scores on methodology page | 2–3 sessions |
| 6 — Political analysis | Template-driven country briefs and regional synthesis generated from indicators (each sentence tied to a named indicator), plus a clearly separated human-written interpretation layer you author; marked as interpretation; regenerated per refresh with diff | Analysis texts live; full refresh runs end-to-end on schedule | 1–2 sessions |

Hardening (accessibility audit, mobile, performance budget, deployment docs) is folded into each phase rather than deferred.

---

## 7. Decisions taken (to be recorded in DECISIONS.md on day one)

1. **Warehouse:** DuckDB + Parquet, static JSON for the site. No managed database.
2. **Text analysis:** no paid LLM API. Open-weight models on free compute (§1.3); human + in-session Claude coding for the validation sample.
3. **Network:** all ingestion and inference run in GitHub Actions; this sandbox is for code, tests with recorded fixtures, and analysis on committed data.
4. **Hosting:** your existing Vercel account, Hobby tier, free subdomain.
5. **Budget:** $0 total. Any source that would require payment is excluded and listed in LIMITATIONS.md.

Still to confirm with you as they arise (not blocking Phase 1): signing the BU CODF data-use agreement and ACLED research registration in your name; applying for OpenCorporates public-benefit access; whether you want an open-model-drafted prose layer in Phase 6 or templates plus your own writing only.

---

## 8. Verification of this plan

Phase 0 has no code. Acceptance is your review of: the source tables (every section-7 source has a status and, if dead, a replacement), the coverage matrix, the schema, the cost table, and the timeline. Phase 1 acceptance will be a deployed preview URL.
