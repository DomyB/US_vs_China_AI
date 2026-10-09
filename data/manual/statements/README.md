# Political statements on critical minerals (project dataset)

`political_statements_minerals.csv`: 395 statements and acts, 2019-03 to 2026-10-02, one row per statement or act by
one actor on one date about minerals, mining or strategic materials in Latin America: presidential speeches and
interviews, ministers, governors, state companies, legislators, debates and bills, court rulings, social-media posts
(mostly through news reports quoting them), Chinese and US embassy and central-government statements, joint
declarations and memoranda. Built on 6 October 2026 for the "Investigating with AI" project (Sciences Po) and
supplied by the project owner; the owner's companion workbook (not committed here) carries the same
records plus summary sheets, a codebook and an HS6 join key to the trade data.

## How it was made, and how to read it

- Collected by AI research agents with web search under a fixed codebook; every record carries the source URL
  actually consulted, a `source_type` (primary_official, legislative_record, news_media, think_tank_or_ngo,
  primary_social_media) and a `verification` level (`primary_verified`: seen on an official or primary page;
  `secondary_reported`: credible media report; `unverified`: weak source).
- Nothing is invented, but the coding of stance (`stance_china`, `stance_us`: positive, neutral, mixed, negative,
  not_mentioned) and themes is interpretive and has **not been validated** by a second coder. The site shows the
  stance as "coded under the dataset's codebook", never as a measurement, and never feeds it into the influence
  index or the say–do gap.
- Quotes are exact excerpts of at most 30 words with an English translation; 100 records carry no quote (only a
  summary). Social-media posts are mostly sourced through news articles that quote them.
- Known coverage gaps (dataset v1): Chinese embassy statements are under-represented; US ambassadors in Mexico,
  Colombia and Bolivia; Colombia, Ecuador and Panama are thinner than the main producers. Mexico and Panama records
  are kept in the warehouse but are outside the twelve countries of this site; region-wide records (`REG`) appear
  on the region page.

## Additions of 2026-10-09 (AI research batch and a second coding)

- **22 records added by an AI session** (`PS-0396`–`PS-0417`, `research_batch` `GUY_PRY_SUR_URY_VEN_ai` and
  `CHN_embassy_ai`): Suriname (3: the Chinalco bauxite MoU of 2024 and its re-evaluation in 2025), Guyana (3:
  Bosai's manganese commitments, the 2024 bauxite rebound, the OTC 2026 address), Paraguay (4: uranium and
  rare-earth prospects, 2025–2026), Venezuela (4: the 2026 mining-law reform announced with US Interior Secretary
  Burgum, his own remarks, the Assembly's president and the bill's presenter) and eight Chinese officials
  (ambassadors in Guyana, Bolivia, Chile and Peru, the embassy in Chile, and the Foreign Ministry on Venezuela).
  **Uruguay: none found** (the searches returned exploration notes of the mining directorate without a dated
  statement by a named official). The records were coded under the vocabularies above from web-search results
  that cite each page; the pages themselves were not opened by the session, so `verification` is
  `secondary_reported` throughout (`unverified` for the Guyana OTC record, whose minerals passage one search
  reported and another did not) and every `notes` field says so. Dates are month-precise where the day was not
  established. The owner should treat this batch as a lead list to check, not as verified records.
- **Second coding of a sample** (`second_coder_sample_v1.csv`, `pipeline/scripts/statements_agreement.py`): 40
  records drawn by a fixed seed, stratified by country and speaker bloc, were re-coded for `stance_china` and
  `stance_us` by an AI session reading only the quote and the summary. Agreement with the dataset's codes:
  China 95.0% (Cohen's κ 0.90 on the five codes, 0.94 collapsed to positive / negative / other); United States
  87.5% (κ 0.77, 0.73 collapsed). Four of the five US disagreements have the same shape: the dataset codes a US
  official's own government as `positive` when the statement attacks China (Rubio, Holsey), the second coding
  left it `not_mentioned`; the codebook should say which is intended. This is the stability of an AI coding
  re-read by an AI, not a validation against human judgement; the site's wording ("coded under the dataset's
  codebook, not validated") stays.

## How the pipeline uses it

The adapter `manual_statements` (`pipeline/scm/ingest/statements.py`) copies this file into a snapshot, normalises
it into the `statement` table (dates completed to a day with their precision; list fields comma-joined; stance
codes kept and scored +1 / 0 / −1, null when the actor is not mentioned) and derives each record's reliability
from its `source_type` (official for primary and legislative sources, independent media for news, state media for
Chinese and allied state outlets, analysis for think tanks, partisan for a politician's own post) and its confidence
from `verification`. The export puts each in-scope country's records, the coded stance of domestic speakers by
year and the counts by speaker bloc into the country file (`statements`), and the region-wide records and
summaries into `region.json`.

## Updating

Replace the CSV (same columns) and run the ingestion (`Ingest (monthly)` with `manual_statements` among the
targets, or the default targets, which include it). `STATEMENTS_FILE_URL` can point at a file elsewhere instead.
