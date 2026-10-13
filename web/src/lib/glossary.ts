import { COUNTRY_COUNT_WORD } from "./constants";
/** The terms the ribbons, the drawer and the methods page link to; one or two plain sentences each, consistent with /methodology. */
export interface GlossaryEntry {
  id: string;
  term: string;
  definition: string;
  /** where the term is used on the site */
  where: string;
}

export const GLOSSARY: GlossaryEntry[] = [
  { id: "documented", term: "Documented commitment", definition: "A finance event whose source reports an amount it stands behind. Only documented amounts enter the index's finance component and the headline totals.", where: "the ledger, the iceberg, the case files" },
  { id: "lower_confidence", term: "Lower-confidence amount", definition: "An amount the source itself marks as less certain (AidData's non-recommended records among them). Shown apart with a dotted fill, never added to the documented total.", where: "the iceberg, the money arcs" },
  { id: "swap_drawdown", term: "Swap drawdown", definition: "Money drawn on a central-bank currency swap line, recorded by AidData as rescue lending. Emergency liquidity, not finance for anything: shown hatched and kept out of the index.", where: "the iceberg, chapter 8, the Argentine case file" },
  { id: "no_amount", term: "Event without amount", definition: "A finance event the source records without a dollar figure. Counted as an event, drawn as an outline, never valued.", where: "the iceberg" },
  { id: "no_recipient", term: "Event naming no recipient", definition: "A finance event whose record names no borrower or recipient institution. Counted, drawn as an outline, not attributed to any country's ledger.", where: "the iceberg, the lender network" },
  { id: "draft_event", term: "Draft event", definition: "A dated policy event in the pipeline's event list that the project owner has not yet reviewed. Its measured windows are shown with the draft mark until then.", where: "event studies, chapter 8, the Lab" },
  { id: "reliability_rating", term: "Reliability rating", definition: "The registry's rating of a source: official, independent or academic, partisan, state media, or analysis. Every number on the site carries its source's rating.", where: "every exhibit" },
  { id: "evidence_level", term: "Evidence level", definition: "Strong: facts layers with dozens of records or full series. Moderate: facts plus one unvalidated coding with ten or more records, or a panel association. Thin: fewer than ten records, a single year, press tone, zero-shot stance or draft events.", where: "the chapter meters, the findings" },
  { id: "coverage", term: "Coverage", definition: "Which tables hold rows for a country and for which years. Missing coverage is shown as missing, never as zero.", where: "chapter 9, the status strip, the case files" },
  { id: "partners_absent", term: "Partner row absent", definition: "A trade year where the reporter sent no row for a partner. The share cannot be computed and is printed as absent; the rest-of-world figure is not derived by reading the gap as zero.", where: "trade receipts, the mineral board, the case files" },
  { id: "export_share", term: "Export share", definition: "The share of a country's mineral exports, by value, going to a partner in a year, from the reporter's own UN Comtrade rows.", where: "chapter 2, the map, the forecasts" },
  { id: "influence_index", term: "Composite influence index", definition: "A composite of up to six observable ties to an actor (export share and import share, finance over GDP, debt over GDP, UN voting agreement, legislative stance), equal weights over the components available, at least three, normalised by winsorised min–max over the country × year × actor panel (both actors on one scale). A description of recorded ties, not of intent; its two halves are the economic-ties and political-alignment sub-indices.", where: "the map, the case files, chapter 8" },
  { id: "economic_ties", term: "Economic ties (sub-index)", definition: "The composite's economic half: export share, import share, finance over GDP and debt over GDP, equal weights over those available, at least two, on the same 0–100 scale; computed for all minerals together.", where: "the map's index switch, the region page, the Analysis tab" },
  { id: "political_alignment", term: "Political alignment (sub-index)", definition: "The composite's political half: UN General Assembly voting agreement and legislative stance, whichever is available, on the same 0–100 scale; while legislative stance is absent it is UN voting alone.", where: "the map's index switch, the region page, the Analysis tab" },
  { id: "net_lean", term: "Net lean", definition: "The China index minus the US index for a country and year, in points of the 0–100 scale, on one scale from −60 to +60 everywhere it is drawn (the map, the ranking, the heatmap and the line charts). The scale is clamped: the rare country-year beyond ±60 is drawn at the edge and printed in full in its tooltip and table. Before the 2010s trade and finance are near zero for both actors, so the early lean is mostly UN voting agreement; the economic-ties switch shows the ties alone.", where: "the map, the ranking, the heatmap, the region page, Compare" },
  { id: "winsorised", term: "Winsorised", definition: "Values beyond the 2.5th and 97.5th percentiles of the panel are pulled to those bounds before min–max normalisation, so one extreme year cannot set the scale.", where: "the index" },
  { id: "dirichlet_draws", term: "Dirichlet draws", definition: "The index's uncertainty band: weights redrawn hundreds of times from a Dirichlet distribution around equal weights, half the draws using percentile ranks instead of min–max; the band is the 5th–95th percentile of the results.", where: "the index bands" },
  { id: "rca", term: "Revealed comparative advantage (RCA)", definition: "A country's share of a mineral in its exports divided by the world's share of that mineral in world exports; above 1 means the country specialises in it.", where: "concentration" },
  { id: "crps", term: "CRPS", definition: "The continuous ranked probability score: how far a forecast's whole distribution sits from what happened, averaged over the backtests. Lower is better; a model is published only if its CRPS beats naive persistence.", where: "the forecasts, chapter 7" },
  { id: "coverage_80", term: "80% band coverage", definition: "The share of backtests in which the realised value fell inside the forecast's 80% band. Below 0.80 the band is too narrow and is said so on the chart.", where: "the forecasts" },
  { id: "placebo_p", term: "Placebo p-value", definition: "For an event window, the share of other years in the same series where the post-minus-pre change is at least as large; the smaller, the less ordinary the change. An association, not a cause.", where: "event studies, chapter 4" },
  { id: "wild_cluster_p", term: "Wild-cluster p-value", definition: `A bootstrap p-value for a panel coefficient that resamples whole countries, so ${COUNTRY_COUNT_WORD} clusters do not pretend to be hundreds of independent observations.`, where: "the panel regressions" },
  { id: "diff_in_diff", term: "Difference in differences", definition: "The change after an event in the countries it touched minus the change in the countries it did not, with a permutation placebo over country subsets.", where: "event studies" },
  { id: "zero_shot", term: "Zero-shot stance", definition: "A stance label assigned by a multilingual text model that was not trained on this project's records. Carried as a baseline, labelled not validated until the hand-coded sample is adjudicated.", where: "the legislative stance, the press tone" },
  { id: "hedging_balance", term: "Hedging balance", definition: "One when a country's executives speak equally warmly of both powers, zero when one-sided; computed from at least four positive positions.", where: "chapter 5, the Lab" },
  { id: "say_do_gap", term: "Say–do gap", definition: "A flag raised when executives' coded stance toward a power and the share of exports going there point in opposite directions.", where: "chapter 5, the flag registry" },
  { id: "parity", term: "Parity", definition: "Arithmetic at constant totals: half the difference between what China and the United States buy of a country's minerals is what would have to switch for the two to be equal. Redirected exports need buyers, smelters, ships and contracts the arithmetic ignores.", where: "chapters 6, 7 and 8" },
  { id: "implied_volume", term: "Implied volume", definition: "A reported export value divided by the year's average world price of the mineral, with the price series named; used to separate a price effect from a buyer effect.", where: "the scenario studio in the Lab (price lever)" },
  { id: "status", term: "Record status", definition: "The state a source gives a finance event (committed, in implementation, completed, suspended, cancelled) where it records one; EXIM authorisations carry none.", where: "the case files" },
];

export const GLOSSARY_BY_ID: Record<string, GlossaryEntry> = Object.fromEntries(GLOSSARY.map((g) => [g.id, g]));

export function glossaryHref(id: string): string {
  return `/methodology#glossary-${id}`;
}
