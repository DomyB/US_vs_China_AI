import type { StanceCode, StatementRecord } from "@/lib/types";

/** Speaker blocs of the statements dataset, in a fixed display order, with short labels and fixed hues
 *  (the four validated categorical hues plus the neutral grey; globals.css binds them to the theme). */
export const BLOC_ORDER = ["LatAm executive", "LatAm legislature", "LatAm state company", "LatAm party/candidate", "LatAm judiciary", "United States", "China", "Other (business, civil society, third countries)"];
export const BLOC_SHORT: Record<string, string> = {
  "LatAm executive": "Executive",
  "LatAm legislature": "Legislature",
  "LatAm state company": "State company",
  "LatAm party/candidate": "Party or candidate",
  "LatAm judiciary": "Judiciary",
  "United States": "United States",
  China: "China",
  "Other (business, civil society, third countries)": "Other",
};
export const BLOC_COLOR: Record<string, string> = { "LatAm executive": "#1d8f6e", "LatAm legislature": "#6a4fb8", "United States": "#1f5fa8", China: "#c8441c" };
export const OTHER_BLOC_COLOR = "#8a8f98";
export const blocColor = (bloc: string) => BLOC_COLOR[bloc] ?? OTHER_BLOC_COLOR;
export const blocShort = (bloc: string) => BLOC_SHORT[bloc] ?? bloc;

export const STANCE_WORD: Record<StanceCode, string> = { positive: "positive", neutral: "neutral", mixed: "mixed", negative: "negative", not_mentioned: "not mentioned" };
export const VERIFICATION_LABEL: Record<StatementRecord["source"]["verification"], string> = { primary_verified: "primary source seen", secondary_reported: "reported by media", unverified: "unverified" };

export type StanceFilter = "any" | "cn_any" | "cn_positive" | "cn_negative" | "us_any" | "us_positive" | "us_negative";
export interface StatementFilters {
  bloc: string;
  stance: StanceFilter;
  mineral: string;
  theme: string;
  channel: string;
  /** restrict to one year, or null for every year */
  year: number | null;
  q: string;
}
export const EMPTY_FILTERS: StatementFilters = { bloc: "", stance: "any", mineral: "", theme: "", channel: "", year: null, q: "" };

export function filterStatements(records: StatementRecord[], f: StatementFilters): StatementRecord[] {
  const q = f.q.trim().toLowerCase();
  return records.filter((r) => {
    if (f.bloc && r.speaker.bloc !== f.bloc) return false;
    if (f.mineral && !r.minerals.includes(f.mineral)) return false;
    if (f.theme && !r.themes.includes(f.theme)) return false;
    if (f.channel && r.channel !== f.channel) return false;
    if (f.year !== null && r.year !== f.year) return false;
    if (f.stance !== "any") {
      const [actor, kind] = f.stance.split("_") as ["cn" | "us", "any" | "positive" | "negative"];
      const code = r.stance[actor];
      if (kind === "any" ? code === "not_mentioned" : code !== kind) return false;
    }
    if (q) {
      const hay = `${r.speaker.name} ${r.speaker.role ?? ""} ${r.summary_en} ${r.quote_original ?? ""} ${r.quote_en ?? ""} ${r.event_context ?? ""} ${r.related_entities ?? ""} ${r.source.name}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

/** Distinct values for the filter selects, most frequent first. */
export function facet(records: StatementRecord[], pick: (r: StatementRecord) => string[]): { value: string; n: number }[] {
  const c = new Map<string, number>();
  for (const r of records) for (const v of pick(r)) if (v) c.set(v, (c.get(v) ?? 0) + 1);
  return Array.from(c, ([value, n]) => ({ value, n })).sort((a, b) => b.n - a.n || a.value.localeCompare(b.value));
}
