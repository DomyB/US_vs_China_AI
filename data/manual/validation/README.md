# Hand-coded validation sample (Phase 3)

Files produced and consumed by `python -m scm validation …` (see `pipeline/config/codebook.md` for the
coding rules):

| File | Written by | Read by |
|---|---|---|
| `sample_<round>.csv` | `validation draw` (the text workflow with `draw_sample: true`) | the two coders: copy it to `coder1_<round>.csv` (owner) and `coder2_<round>.csv` (Claude, in sessions) and fill the eight coding columns |
| `coder1_<round>.csv`, `coder2_<round>.csv` | the coders, blind to each other | `validation adjudicate`, `validation load` |
| `adjudicated_<round>.csv` | `validation adjudicate` (both codings side by side, `agree_*` flags, `final_*` prefilled where they agree) | the adjudication session fills `resolution` (`agree`, `coder1`, `coder2`, `discussed`) and the remaining `final_*`; then `validation load` |

Blank `stance_us` / `stance_cn` means "not applicable" (the actor is not named); `0` means neutral.
No model output is included in the template, so the coders never see the baseline's values.

**Two pitfalls of the committed `sample_v1.csv`** (left as is so coder 2's row order stays valid):
a missing summary appears as the word `nan` (later templates write an empty cell), and the codebook
prints the Unicode minus (`−1`); the reader accepts it, a plain hyphen and an en dash alike. `topic`
must be one of the codebook's eight values; a file with any other value is rejected with the list.

**Blindness.** `coder2_v1.csv` (Claude's coding, 2026-10-04) is committed so it cannot be lost; the
owner codes `coder1_v1.csv` from `sample_v1.csv` without opening it. Coder 2 did not see any model
output while coding (the template carries none).
