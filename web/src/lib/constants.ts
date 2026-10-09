import type { Reliability } from "./types";

export const YEAR_MIN = 2008;
export const YEAR_MAX = 2026;

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
  GUF: "French Guiana",
  FLK: "Falkland Islands / Islas Malvinas",
};

export const IN_SCOPE = ["ARG", "BOL", "BRA", "CHL", "COL", "ECU", "GUY", "PRY", "PER", "SUR", "URY", "VEN"];

export const LANGUAGE_NAME: Record<string, string> = { es: "Spanish", pt: "Portuguese", en: "English", nl: "Dutch", zh: "Chinese", multi: "Multiple" };

export function prettyMineral(id: string): string {
  return id.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()).replace("Rare earths", "Rare earth elements");
}

export function prettyLabel(id: string): string {
  return id.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}
