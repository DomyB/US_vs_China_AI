# Human-written interpretation (Phase 6)

The site's third layer, "Interpretation", has two parts: text **generated from named indicators**
by `pipeline/scm/quant/briefs.py` (every sentence lists the indicator ids it rests on), and this
folder, the **project owner's own writing**. The pipeline reads the files here and shows them
on the site in a separate box labelled "Written by the project owner"; it never writes or edits
them.

Files: one Markdown file per country named by ISO3 (`BRA.md`, `CHL.md`, …) and `regional.md`
for the regional synthesis. Start from `_TEMPLATE.md`. Front matter (optional but recommended):

```
---
title: Brazil: what the numbers do and do not say
author: Your name
date: 2026-10-15
reviewed: true
data_release: data-v2026.10.11.62
---
```

`data_release` names the data release (the `inputs_release` tag in `web/public/data/real/meta.json`,
`quant_model.inputs_release`) whose numbers the text quotes. The exporter passes it to the site, which prints
"drafted from data release X" under the text and adds "the current release is Y, numbers may have moved"
once a newer release is on the site, so a reader can tell a stale draft from the live figures.

Rules that keep the three layers honest:

- Opinion and judgement belong here and nowhere else; say what you think, and say why.
- Every factual claim should point to something on the site (name the indicator, chart or source)
  or to a cited document; do not state numbers the warehouse does not hold.
- Mark what is uncertain. The generated brief already lists what the data cannot say.
- `reviewed: true` means you stand behind the text as published; `false` shows it with a
  "draft" mark.

The text is shown as paragraphs; `#`/`##` headings and blank-line paragraph breaks are rendered,
other Markdown is shown as typed.

## AI-drafted files (every country, `regional.md`, `insights.md`)

The twelve country files, `regional.md` and `insights.md` were drafted by an AI session on
2026-10-09 at the owner's request, from the site's own indicators (the generated brief, the index
and its components, the contrasts of the Lab (/lab, formerly the Insights page), the flags, the dated events and the
forecasts), and re-drafted on 2026-10-11 from data release `data-v2026.10.11.62` after the record
was extended to 2000 and the trade backfill landed. Their front matter says so (`drafted_by: ai`,
`reviewed: false`, an `author` line that names no person, `data_release` naming the release the
numbers were read from). The site shows each under the label "AI-drafted from the indicators · not yet
reviewed by the owner" until the owner edits it and sets `reviewed: true` (keep or drop
`drafted_by`; the label follows the front matter; `drafted_by` reaches the warehouse as a column of
`analysis_text`, DECISIONS 62). Every claim names in square brackets the indicator, finding, record
or table it rests on (for example `[index_value:influence:CN:2024]`, `[flow_trade:ARG:lithium:2025]`,
`[insights:parity_gap:CHL]`), so the review can check each one against the live numbers. The numbers
quoted are those of the release named in each file and will drift as the data update; the site says
when its current release is newer, one more reason to review. Uruguay's and Venezuela's files are
shorter than the others: Uruguay's reported mineral exports are under US$10 m a year from 2019, so its
index rests on tiny flows, and Venezuela's index stops in 2013 with its reported trade. The pipeline
never rewrites these files.
