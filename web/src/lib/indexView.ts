import { ACTOR_LABEL, IN_SCOPE, prettyMineral } from "./constants";
import type { Actor, IndexName, IndexRow } from "./types";

export type { IndexName };

/**
 * Reading index.json on the map, the ranking, the comparison and the Analysis tab: which index a row belongs to (the
 * composite influence index or one of its two sub-indices), which component carries the gap between the actors, and
 * the honest sentence for a country-year without an index. Every function works on an older file whose rows carry
 * none of the new fields: such rows read as composite rows, the switch has nothing to show and the "carried by" lines
 * stay empty, with no error.
 */

export const INDEX_NAMES: readonly IndexName[] = ["composite", "economic_ties", "political_alignment"];

export const INDEX_LABEL: Record<IndexName, string> = { composite: "Composite influence index", economic_ties: "Economic ties", political_alignment: "Political alignment" };
/** lower case, for the middle of a sentence */
export const INDEX_PHRASE: Record<IndexName, string> = { composite: "composite influence index", economic_ties: "economic ties sub-index", political_alignment: "political alignment sub-index" };
/** the formula each index applies to its normalised components (pipeline/scm/quant/index.py COMPONENTS, GROUPS) */
export const INDEX_FORMULA: Record<IndexName, string> = {
  composite: "equal-weight mean of the components available, at least three of six (export share, import share, finance over GDP, debt owed over GDP, UN voting agreement, legislative stance)",
  economic_ties: "equal-weight mean of export share, import share, finance over GDP and debt owed over GDP, at least two of the four; computed for all minerals together",
  political_alignment: "equal-weight mean of UN voting agreement and legislative stance, whichever is available; computed for all minerals together",
};
/** the same, short enough for the map legend */
export const INDEX_FORMULA_SHORT: Record<IndexName, string> = {
  composite: "equal-weight mean of the available components, at least 3 of 6",
  economic_ties: "export share, import share, finance / GDP, debt / GDP (at least 2 of 4), all minerals together",
  political_alignment: "UN voting agreement and legislative stance, all minerals together",
};
export const INDEX_MIN_COMPONENTS: Record<IndexName, number> = { composite: 3, economic_ties: 2, political_alignment: 1 };
export const INDEX_N_COMPONENTS: Record<IndexName, number> = { composite: 6, economic_ties: 4, political_alignment: 2 };

export const COMPONENT_LABEL: Record<string, string> = {
  trade_export_share: "Export share to actor",
  trade_import_share: "Import share from actor",
  finance_flow: "Official finance (3 yr) / GDP",
  debt_stock: "Debt owed to actor / GDP",
  diplomatic_alignment: "UN voting agreement",
  legislative_stance: "Legislative stance",
};
const COMPONENT_PHRASE: Record<string, string> = {
  trade_export_share: "the export share",
  trade_import_share: "the import share",
  finance_flow: "official finance over GDP",
  debt_stock: "debt owed over GDP",
  diplomatic_alignment: "UN voting agreement",
  legislative_stance: "legislative stance",
};
/** a component name in the middle of a sentence ("carried by UN voting agreement") */
export function componentPhrase(name: string): string {
  return COMPONENT_PHRASE[name] ?? name.replace(/_/g, " ");
}

/** The sources behind `quant_model.last_year`, the actor and the indices each one feeds (GDP is the denominator of
 *  the finance and debt components), and how to name them in a sentence. */
const SOURCE_END: { key: string; label: string; actors: Actor[]; indices: IndexName[] }[] = [
  { key: "unga", label: "UN voting", actors: ["US", "CN"], indices: ["composite", "political_alignment"] },
  { key: "debt_CN", label: "debt owed to China", actors: ["CN"], indices: ["composite", "economic_ties"] },
  { key: "finance_CN", label: "Chinese finance", actors: ["CN"], indices: ["composite", "economic_ties"] },
  { key: "finance_US", label: "US finance", actors: ["US"], indices: ["composite", "economic_ties"] },
  { key: "stance", label: "legislative stance", actors: ["US", "CN"], indices: ["composite", "political_alignment"] },
  { key: "gdp", label: "GDP", actors: ["US", "CN"], indices: ["composite", "economic_ties"] },
];

export function parseIndexName(raw: string | null | undefined): IndexName {
  return INDEX_NAMES.includes(raw as IndexName) ? (raw as IndexName) : "composite";
}

/** The index a row belongs to; an older file's rows carry no `index` and are composite rows. */
export function rowIndex(r: IndexRow): IndexName {
  return r.index ?? "composite";
}

/** Whether the file carries sub-index rows at all (the switch is shown only then). */
export function hasSubIndices(rows: IndexRow[]): boolean {
  return rows.some((r) => r.index !== undefined && r.index !== "composite");
}

export function rowsForIndex(rows: IndexRow[], name: IndexName): IndexRow[] {
  return rows.filter((r) => rowIndex(r) === name);
}

export interface LastIndexed {
  CN: number | null;
  US: number | null;
}

/** The last year with a composite all-minerals row for each actor (any country). */
export function lastIndexedYears(rows: IndexRow[]): LastIndexed {
  const m: LastIndexed = { CN: null, US: null };
  for (const r of rows) {
    if (rowIndex(r) !== "composite" || r.mineral !== "all") continue;
    m[r.actor] = Math.max(m[r.actor] ?? r.year, r.year);
  }
  return m;
}

/** Countries with a composite all-minerals row for both actors, by year. */
export function bothActorCounts(rows: IndexRow[]): Map<number, number> {
  const by = new Map<string, Set<Actor>>();
  for (const r of rows) {
    if (rowIndex(r) !== "composite" || r.mineral !== "all") continue;
    const k = `${r.iso3}|${r.year}`;
    const s = by.get(k) ?? new Set<Actor>();
    s.add(r.actor);
    by.set(k, s);
  }
  const counts = new Map<number, number>();
  for (const [k, s] of by) {
    if (s.size < 2) continue;
    const y = Number(k.split("|")[1]);
    counts.set(y, (counts.get(y) ?? 0) + 1);
  }
  return counts;
}

/** the share of the most countries ever indexed together that a year must reach to count as broadly indexed */
const BROAD_SHARE = 0.75;

/**
 * The year the map opens on: the latest year in which most countries have both actors' composite index, "most" being at
 * least three quarters of the largest number ever indexed together (the release of 2026-10: 12 countries to 2013, 11
 * from 2014, when Venezuela's trade record ends, to 2024, Brazil alone in 2025: the year is 2024). `fallback` before the
 * file is loaded or when it has no row with both actors.
 */
export function defaultIndexYear(rows: IndexRow[], fallback: number): number {
  const counts = bothActorCounts(rows);
  if (counts.size === 0) return fallback;
  const top = Math.max(...counts.values());
  return Math.max(...Array.from(counts).filter(([, n]) => n >= top * BROAD_SHARE).map(([y]) => y));
}

export interface Lead {
  lead: string;
  lead_gap: number;
  lead_cn: number;
  lead_us: number;
}

/** `${iso3}|${year}` → the leading component of the composite all-minerals index, where the file carries one. */
export function leadLookup(rows: IndexRow[]): Map<string, Lead> {
  const m = new Map<string, Lead>();
  for (const r of rows) {
    if (rowIndex(r) !== "composite" || r.mineral !== "all" || !r.lead || r.lead_gap == null || r.lead_cn == null || r.lead_us == null) continue;
    m.set(`${r.iso3}|${r.year}`, { lead: r.lead, lead_gap: r.lead_gap, lead_cn: r.lead_cn, lead_us: r.lead_us });
  }
  return m;
}

/** "carried by UN voting agreement (CN 90 vs US 34)"; null without a lead. */
export function carriedBy(l: Lead | null | undefined): string | null {
  if (!l) return null;
  return `carried by ${componentPhrase(l.lead)} (CN ${l.lead_cn.toFixed(0)} vs US ${l.lead_us.toFixed(0)})`;
}

export interface LeadSummary {
  year: number;
  /** the component that leads the gap in most countries */
  component: string;
  /** how many of the countries with both composite indices it leads */
  n: number;
  total: number;
  /** mean China-minus-US gap of that component where it leads, in points of the 0–100 component scale */
  meanGap: number;
  /** mean sub-index values over the countries that have them (null when the file carries no sub-index rows) */
  economic_ties: { CN: number; US: number } | null;
  political_alignment: { CN: number; US: number } | null;
}

function meanByActor(rows: IndexRow[]): { CN: number; US: number } | null {
  const acc: Record<Actor, number[]> = { CN: [], US: [] };
  for (const r of rows) acc[r.actor].push(r.value);
  if (!acc.CN.length || !acc.US.length) return null;
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  return { CN: mean(acc.CN), US: mean(acc.US) };
}

/** What carries the lean in a year, over the countries that have both composite indices (all minerals). */
export function leadSummary(rows: IndexRow[], year: number): LeadSummary | null {
  const leads = leadLookup(rows);
  const counts = new Map<string, number[]>();
  let total = 0;
  const seen = new Set<string>();
  const actors = new Map<string, Set<Actor>>();
  for (const r of rows) {
    if (r.year !== year || r.mineral !== "all" || rowIndex(r) !== "composite") continue;
    const s = actors.get(r.iso3) ?? new Set<Actor>();
    s.add(r.actor);
    actors.set(r.iso3, s);
  }
  for (const [iso, s] of actors) {
    if (s.size < 2 || seen.has(iso)) continue;
    seen.add(iso);
    total += 1;
    const l = leads.get(`${iso}|${year}`);
    if (!l) continue;
    counts.set(l.lead, [...(counts.get(l.lead) ?? []), l.lead_gap]);
  }
  if (total === 0 || counts.size === 0) return null;
  const [component, gaps] = Array.from(counts).sort((a, b) => b[1].length - a[1].length)[0];
  const year_rows = rows.filter((r) => r.year === year && r.mineral === "all");
  return {
    year,
    component,
    n: gaps.length,
    total,
    meanGap: gaps.reduce((a, b) => a + b, 0) / gaps.length,
    economic_ties: meanByActor(year_rows.filter((r) => rowIndex(r) === "economic_ties")),
    political_alignment: meanByActor(year_rows.filter((r) => rowIndex(r) === "political_alignment")),
  };
}

/** One sentence from a LeadSummary, every figure from the rows. */
export function leadSentence(s: LeadSummary): string {
  const ahead = s.meanGap >= 0 ? ACTOR_LABEL.CN : `the ${ACTOR_LABEL.US}`;
  let out = `In ${s.year} ${componentPhrase(s.component)} carries the lean in ${s.n} of ${s.total} ${s.total === 1 ? "country" : "countries"} (the widest gap between the actors, ${ahead} ahead by ${Math.abs(s.meanGap).toFixed(0)} points on average)`;
  const e = s.economic_ties;
  const p = s.political_alignment;
  if (e) {
    out += e.CN < 10 && e.US < 10
      ? `; economic ties are near zero for both (${e.CN.toFixed(0)} vs ${e.US.toFixed(0)} on the 0–100 scale)`
      : `; economic ties average ${e.CN.toFixed(0)} for China and ${e.US.toFixed(0)} for the United States`;
  }
  if (p) out += `${e ? "," : ";"} political alignment ${p.CN.toFixed(0)} vs ${p.US.toFixed(0)}`;
  out += ".";
  if (e || p) out += " Switch the index to see each.";
  return out;
}

const actorName = (a: Actor) => (a === "US" ? "US" : "China");

/** The sources feeding an actor's components of an index whose last year lies before `year`: "UN voting to 2024, Chinese finance to 2021". */
export function laggingSources(lastYear: Record<string, number | null> | null | undefined, year: number, actor: Actor, indexName: IndexName = "composite"): string[] {
  if (!lastYear) return [];
  return SOURCE_END.filter((s) => s.actors.includes(actor) && s.indices.includes(indexName) && lastYear[s.key] != null && (lastYear[s.key] as number) < year).map((s) => `${s.label} to ${lastYear[s.key]}`);
}

function fewerThan(name: IndexName): string {
  const min = INDEX_MIN_COMPONENTS[name];
  return min === 1 ? "no component available" : `fewer than ${min} components`;
}

/**
 * Why a source ending before the year leaves no index: the composite is not published for a year in which a component
 * it rested on the year before has no data yet (method 2026.10.2 holds it back rather than change its composition), or
 * too few components remain; a sub-index only has the second case.
 */
function sourceEndClause(name: IndexName): string {
  return name === "composite" ? `the index is not published where a component it rested on the year before has no data yet, or with ${fewerThan(name)}` : fewerThan(name);
}

/**
 * Why one country has no index value: the trade record not reaching the year, a source ending before it (only when the
 * year lies beyond the last year most countries are indexed, so the gap is the sources' and not the country's), the
 * mineral, or the components themselves (the case file says which).
 */
export function noIndexReason(o: { year: number; mineral: string; indexName: IndexName; missing: Actor[]; lastYear: Record<string, number | null> | null | undefined; defaultYear: number | null }): string {
  const label = INDEX_PHRASE[o.indexName];
  const trade = o.lastYear?.trade ?? null;
  if (trade !== null && o.year > trade) return `no ${label} for ${o.year}: no trade reported for ${o.year} yet (UN Comtrade runs to ${trade})`;
  if (o.mineral !== "all") {
    if (o.indexName !== "composite") return `no ${label} for ${prettyMineral(o.mineral).toLowerCase()}: the sub-indices are computed for all minerals together`;
    return `no ${label} for ${prettyMineral(o.mineral).toLowerCase()} in ${o.year}: no reported trade in the mineral that year, or ${fewerThan(o.indexName)}`;
  }
  const structural = o.defaultYear !== null && o.year > o.defaultYear;
  const parts = o.missing.map((a) => {
    const lags = structural ? laggingSources(o.lastYear, o.year, a, o.indexName) : [];
    return lags.length
      ? `no ${actorName(a)} ${label} for ${o.year}: ${lags.join(", ")} (${sourceEndClause(o.indexName)})`
      : `no ${actorName(a)} ${label} for ${o.year}: ${fewerThan(o.indexName)} (the case file's Analysis tab says which)`;
  });
  return parts.length ? parts.join("; ") : `no ${label} for ${o.year}`;
}

/** The ranking's note when some countries have no index in the year, with the reason that applies. */
export function missingIndexNote(o: { year: number; mineral: string; indexName: IndexName; missingAny: number; missingCN: number; missingUS: number; total?: number; lastYear: Record<string, number | null> | null | undefined; defaultYear: number | null }): string | null {
  if (o.missingAny === 0) return null;
  const total = o.total ?? IN_SCOPE.length;
  const label = INDEX_PHRASE[o.indexName];
  const head = `${o.missingAny} of ${total} countries have no ${label} in ${o.year}`;
  const trade = o.lastYear?.trade ?? null;
  if (trade !== null && o.year > trade) return `${head}: no trade reported for ${o.year} yet (UN Comtrade runs to ${trade}).`;
  if (o.mineral !== "all") {
    if (o.indexName !== "composite") return `${head}: the sub-indices are computed for all minerals together.`;
    return `${head}: no reported trade in the mineral that year, or ${fewerThan(o.indexName)}.`;
  }
  const structural = o.defaultYear !== null && o.year > o.defaultYear;
  if (structural) {
    const parts: string[] = [];
    for (const [a, n] of [["CN", o.missingCN], ["US", o.missingUS]] as [Actor, number][]) {
      if (n === 0) continue;
      const lags = laggingSources(o.lastYear, o.year, a, o.indexName);
      parts.push(`the ${actorName(a)} index is missing for ${n}${lags.length ? ` (${lags.join(", ")})` : ` (${fewerThan(o.indexName)})`}`);
    }
    return `${head}: ${parts.join("; ")}. ${sourceEndClause(o.indexName).replace(/^the/, "The")}. The last year with both indices for most countries is ${o.defaultYear}.`;
  }
  return `${head}: ${fewerThan(o.indexName)} (each case file's Analysis tab says which).`;
}
