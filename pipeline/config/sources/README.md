# Source registry

One YAML file per group; `pipeline/scripts/build_sources.py` merges them, validates
them and generates `SOURCES.md` (repo root) and `web/public/data/sources.json`
(site Sources page). Edit the YAML, never the generated files.

## Fields

| Field | Required | Values |
|---|---|---|
| `id` | yes | unique snake_case identifier, prefixed by ISO3 for national sources |
| `name` | yes | human-readable name |
| `url` | yes | landing page |
| `api_url` | no | API or bulk-download endpoint |
| `category` | yes | trade, production, concessions, finance, investment, deals, contracts, transparency, governance, macro, events, conflict, media, press, legislature, gazette, policy, diplomacy, filings, ownership, company, infrastructure, geodata, prices, analysis |
| `scope` | no | international, regional, US, CN, other; defaults to `country` when `countries` is set |
| `countries` | no | list of ISO3 codes |
| `reliability` | yes | official, independent_academic, partisan, state_media, analysis |
| `orientation` | press only | documented political orientation, neutral wording |
| `paywall` | press only | none, metered, yes, unknown |
| `license` | yes | license or terms of use |
| `access` | yes | api, bulk, rss, html, pdf, derived |
| `auth` | no | key, registration, limits; defaults to none |
| `update_frequency` | yes | how often the source publishes |
| `refresh_schedule` | yes | how often our pipeline refreshes it: daily, weekly, monthly, quarterly, semi-annual, annual, none |
| `coverage_from`, `coverage_to` | yes | years |
| `language` | yes | en, es, pt, nl, zh, multi |
| `status` | yes | live, moved, dead, uncertain |
| `verified_on`, `verified_method` | no | default 2026-10-01 / search (search = search-engine snippets; github = GitHub or PyPI fetch; direct = HTTP check from a runner) |
| `python_package` | no | PyPI client, if any |
| `notes` | no | anything a reader of SOURCES.md needs |
