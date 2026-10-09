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
