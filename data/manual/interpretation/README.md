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
---
```

Rules that keep the three layers honest:

- Opinion and judgement belong here and nowhere else; say what you think, and say why.
- Every factual claim should point to something on the site (name the indicator, chart or source)
  or to a cited document; do not state numbers the warehouse does not hold.
- Mark what is uncertain. The generated brief already lists what the data cannot say.
- `reviewed: true` means you stand behind the text as published; `false` shows it with a
  "draft" mark.

The text is shown as paragraphs; `#`/`##` headings and blank-line paragraph breaks are rendered,
other Markdown is shown as typed.

## AI-drafted text (`insights.md`)

`insights.md` is the exception to the "owner only" rule: it was drafted from the indicators of the
site's Insights page at the owner's request, and its front matter says so (`drafted_by: ai`,
`reviewed: false`). The site shows it under the label "AI-drafted from the indicators · not yet
reviewed by the owner" until the owner edits it as they see fit and sets `reviewed: true` (keep or
drop `drafted_by` as you prefer; the label follows the front matter). Every claim in the file names
in square brackets the finding or indicator on the page it rests on, so the review can check each
one against the live numbers. The pipeline never rewrites this file either.
