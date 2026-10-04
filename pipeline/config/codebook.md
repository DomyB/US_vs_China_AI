# Codebook v1 — stance, tone and topic of legislative records and headlines

Version `v1`, 2026-10-04. Applies to every document in the `document` table (legislative records of
the six legislatures with machine-readable data, and press headlines). The codebook is published
before any coding at scale; the owner reviews it before the first coding round. Changes get a new
version, and classifications record the version they were produced under.

## 1. Unit of coding

- **Legislative record**: the title (`title_original`) plus the summary the legislature publishes
  (`summary`: Brazil's *ementa*, Colombia's *objeto*). Where the title already contains the summary
  (Brazil: `PL n/yyyy: <ementa>`), code the longer of the two. Nothing else is available: no full
  text, no debate transcript.
- **Headline**: the headline alone. No article text is stored or read.
- Code **what the text says**, not what you know about the bill, the author or the outlet. The
  machine translation (`title_en_mt`) is an aid; the original is authoritative.

## 2. Applicability (`applicable_us`, `applicable_cn`)

An actor is *applicable* when the text names it or refers to it unambiguously:
- the country or its government ("Estados Unidos", "EE.UU.", "EUA", "Washington"; "China",
  "República Popular", "Pekín/Pequim/Beijing"), its institutions (DFC, Ex-Im Bank, USGS, Pentágono,
  Comando Sur; CDB, Bank of China, Belt and Road / Franja y la Ruta / Rota da Seda), its leaders
  named in the text;
- a firm clearly of that origin named in the text (Albemarle, Freeport, Newmont, Livent; Tianqi,
  Ganfeng, Zijin, CMOC, CATL, BYD, Chinalco, MMG, Shougang, Sinopec, CNPC, Minmetals, Huawei).
- Not applicable: generic "foreign" or "extranjero" without the actor; "US$" or "dólares" as a
  currency; "América" meaning the continent; Taiwan alone (code China only if mainland China is
  the referent).
- When not applicable, leave the stance blank. Blank is a value ("not applicable"), distinct
  from 0 ("neutral").

## 3. Stance toward each applicable actor (`stance_us`, `stance_cn`), five points

| Value | Meaning | Typical signals |
|---|---|---|
| −2 | strongly negative | restriction, prohibition, sanction, expulsion, denunciation of a treaty, accusation of harm or illegality aimed at the actor |
| −1 | negative | concern, criticism, conditions or scrutiny expressed with evaluative language; demand for explanations framed as suspicion |
| 0 | neutral or mixed | the actor is mentioned descriptively (a request for information, a listing, a procedural step) or the text balances positive and negative |
| +1 | positive | welcomes, approves or seeks cooperation, investment or an agreement with the actor; highlights benefits |
| +2 | strongly positive | celebrates, urges deepening, "strategic partnership" language, honours or thanks the actor |

Rules:
- **Procedural records** (requerimentos de informação, pedidos de informes, hearing convocations,
  "solicita informes al Poder Ejecutivo") are 0 unless the request itself evaluates ("ante el
  riesgo que representa…" → −1).
- **Treaty or agreement approval bills** (mensajes, acuerdos, convenios submitted for approval)
  are +1 toward the counterpart: submitting an agreement for approval endorses it. A bill that
  denounces or suspends an agreement is −1 or −2.
- **Credit operations and loans** from the actor's institutions submitted for authorisation: +1.
- Bills restricting foreign ownership or investment **without naming** the actor: not applicable.
- Both actors named: code each independently (a text can be +1 toward one and −1 toward the other).
- Headlines: literal reading; sarcasm is coded by its surface meaning unless unmistakable.
- Only the title available and it is truncated: code what is readable; note "truncated".

## 4. Tone (`tone`): −1 negative, 0 neutral, +1 positive

Overall tone of the text as a whole, independent of any actor: conflict, loss, risk, accusation
→ −1; gains, cooperation, success, celebration → +1; descriptive or procedural → 0.

## 5. Topic (`topic`), one best value

`investment_jobs` · `sovereignty_resource_nationalism` · `environment_water_communities` ·
`geopolitics_security` · `regulation_procedure` · `trade_prices` · `corruption_transparency` ·
`other`

## 6. Confidence (`confidence`) 1–3 and notes

1 = guess (truncated or ambiguous text), 2 = reasonable, 3 = clear. Use `notes` for the reason
when confidence is 1, for truncation, and for anything the codebook does not cover (these notes
drive the next codebook version).

## 7. Metadata rules (not for coders)

- Semana (Colombia) is aggregated as two outlets, before and after 2020-01-01 (ownership change);
  coders do not adjust for it.
- The applicability flags from ingestion (`mentions_us`, `mentions_cn`) are shown in the coding
  file for reference only; coders decide applicability from the text.

## 8. Files

- Template: `data/manual/validation/sample_v1.csv` (blind: no model output included).
- Coder files: `coder1_v1.csv` (owner), `coder2_v1.csv` (Claude, coded in development sessions).
  Neither coder sees the other's file before both are complete.
- Adjudication: `adjudicated_v1.csv`, produced by `python -m scm validation adjudicate`, with the
  two codings side by side, agreement flags and `final_*` columns; disagreements are resolved
  together and the resolution recorded (`agree`, `coder1`, `coder2`, `discussed`).
