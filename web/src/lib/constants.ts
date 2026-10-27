import type { Reliability } from "./types";

import period from "../../public/data/real/period.json";

/** The years the site spans: the first year the trade record holds and the current year, written by the pipeline's export
 * (`period.json`, next to the other real exports; `from` is the project's period, `data_from` where the record starts). */
export const PERIOD_FROM: number = period.from;
export const YEAR_MIN: number = period.data_from;
export const YEAR_MAX: number = period.to;

export const ACTOR_LABEL: Record<"US" | "CN", string> = { US: "United States", CN: "China" };

/** Colorblind-safe pair: US blue, China vermilion. Neutral grey for "no lean". */
export const ACTOR_COLOR: Record<"US" | "CN", string> = { US: "#1f5fa8", CN: "#c8441c" };
export const OTHER_COLOR = "#8a8f98";

/** Where the flow arcs end: Washington and Beijing (schematic anchors, not the location of any lender or buyer). */
export const ACTOR_ANCHOR: Record<"US" | "CN", [number, number]> = { US: [-77.04, 38.9], CN: [116.4, 39.9] };

export const RELIABILITY_LABEL: Record<Reliability, string> = {
  official: "Official",
  independent_academic: "Independent / academic",
  partisan: "Partisan",
  state_media: "State-controlled media",
  analysis: "Analysis",
};

export const EVIDENCE_LABEL: Record<string, string> = {
  documented: "Documented",
  strongly_indicated: "Strongly indicated",
  speculative: "Speculative",
};

export const STANCE_LABEL: Record<number, string> = {
  [-2]: "Strongly negative",
  [-1]: "Negative",
  0: "Neutral / mixed",
  1: "Positive",
  2: "Strongly positive",
};

export const COUNTRY_NAMES: Record<string, string> = {
  ARG: "Argentina",
  BOL: "Bolivia",
  BRA: "Brazil",
  CHL: "Chile",
  COL: "Colombia",
  ECU: "Ecuador",
  GUY: "Guyana",
  PRY: "Paraguay",
  PER: "Peru",
  SUR: "Suriname",
  URY: "Uruguay",
  VEN: "Venezuela",
  MEX: "Mexico",
  GTM: "Guatemala",
  BLZ: "Belize",
  HND: "Honduras",
  SLV: "El Salvador",
  NIC: "Nicaragua",
  CRI: "Costa Rica",
  PAN: "Panama",
  GUF: "French Guiana",
  FLK: "Falkland Islands / Islas Malvinas",
};

export const IN_SCOPE = ["ARG", "BOL", "BRA", "CHL", "COL", "ECU", "GUY", "PRY", "PER", "SUR", "URY", "VEN", "MEX", "GTM", "BLZ", "HND", "SLV", "NIC", "CRI", "PAN"];
/** how many countries the record covers, for prose ("the twenty countries") */
export const COUNTRY_COUNT = IN_SCOPE.length;
export const COUNT_WORDS: Record<number, string> = { 5: "five", 6: "six", 7: "seven", 8: "eight", 9: "nine", 10: "ten", 11: "eleven", 12: "twelve", 13: "thirteen", 18: "eighteen", 19: "nineteen", 20: "twenty", 21: "twenty-one" };
/** A count as a word where one is listed, capitalised for the start of a sentence. */
export const countWord = (n: number, capital = false) => { const w = COUNT_WORDS[n] ?? String(n); return capital ? w.charAt(0).toUpperCase() + w.slice(1) : w; };
export const COUNTRY_COUNT_WORD = COUNT_WORDS[COUNTRY_COUNT] ?? String(COUNTRY_COUNT);
/** South America and Central America (Mexico counted with the isthmus), for regional groupings */
export const SUBREGION: Record<string, "south_america" | "central_america"> = Object.fromEntries(IN_SCOPE.map((iso, i) => [iso, i < 12 ? "south_america" : "central_america"])) as Record<string, "south_america" | "central_america">;

export const LANGUAGE_NAME: Record<string, string> = { es: "Spanish", pt: "Portuguese", en: "English", nl: "Dutch", zh: "Chinese", multi: "Multiple" };

export function prettyMineral(id: string): string {
  return id.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()).replace("Rare earths", "Rare earth elements");
}

export function prettyLabel(id: string): string {
  return id.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}
