import { COUNTRY_NAMES } from "./constants";
import { rowIndex } from "./indexView";
import type { Actor, IndexName, IndexRow } from "./types";

/**
 * The "Votes and ore" page: the two halves of the influence index set against each other. Every number here is
 * derived in the browser from index.json (the composite and its two sub-indices, all-minerals rows); nothing is
 * estimated. A lean is China's index minus the United States' for one index and country-year, and it exists only
 * when both actors have a value that year.
 */

export interface LeanPoint {
  iso3: string;
  name: string;
  year: number;
  /** China index minus US index; null when either actor's row is missing or held back */
  composite: number | null;
  economic: number | null;
  political: number | null;
}

/** One point per country-year from the all-minerals rows, sorted by country then year. */
export function leanPoints(rows: IndexRow[]): LeanPoint[] {
  const acc = new Map<string, { iso3: string; year: number; v: Record<IndexName, Partial<Record<Actor, number>>> }>();
  for (const r of rows) {
    if (r.mineral !== "all" || r.value == null || !Number.isFinite(r.value)) continue;
    const key = `${r.iso3}|${r.year}`;
    let e = acc.get(key);
    if (!e) {
      e = { iso3: r.iso3, year: r.year, v: { composite: {}, economic_ties: {}, political_alignment: {} } };
      acc.set(key, e);
    }
    e.v[rowIndex(r)][r.actor] = r.value;
  }
  const lean = (p: Partial<Record<Actor, number>>) => (p.CN != null && p.US != null ? p.CN - p.US : null);
  return Array.from(acc.values())
    .map((e) => ({ iso3: e.iso3, name: COUNTRY_NAMES[e.iso3] ?? e.iso3, year: e.year, composite: lean(e.v.composite), economic: lean(e.v.economic_ties), political: lean(e.v.political_alignment) }))
    .sort((a, b) => a.iso3.localeCompare(b.iso3) || a.year - b.year);
}

export interface BothLean {
  iso3: string;
  name: string;
  year: number;
  economic: number;
  political: number;
}

/** The country-years where both sub-indices exist: the only ones the comparison can use. */
export function withBoth(points: LeanPoint[]): BothLean[] {
  const out: BothLean[] = [];
  for (const p of points) if (p.economic != null && p.political != null) out.push({ iso3: p.iso3, name: p.name, year: p.year, economic: p.economic, political: p.political });
  return out;
}

/** Pearson's r; null with fewer than three pairs or without variance on an axis. */
export function pearson(pairs: readonly (readonly [number, number])[]): number | null {
  const n = pairs.length;
  if (n < 3) return null;
  let mx = 0;
  let my = 0;
  for (const [x, y] of pairs) {
    mx += x;
    my += y;
  }
  mx /= n;
  my /= n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (const [x, y] of pairs) {
    sxy += (x - mx) * (y - my);
    sxx += (x - mx) ** 2;
    syy += (y - my) ** 2;
  }
  if (sxx === 0 || syy === 0) return null;
  return sxy / Math.sqrt(sxx * syy);
}

export interface Correlation {
  r: number | null;
  /** country-years */
  n: number;
  countries: number;
  from: number | null;
  to: number | null;
}

/** The correlation between the economic and the political lean over every country-year that has both. */
export function correlation(points: BothLean[]): Correlation {
  const years = points.map((p) => p.year);
  return {
    r: pearson(points.map((p) => [p.economic, p.political] as const)),
    n: points.length,
    countries: new Set(points.map((p) => p.iso3)).size,
    from: years.length ? Math.min(...years) : null,
    to: years.length ? Math.max(...years) : null,
  };
}

/** r within each year, over the countries that have both leans that year (null where fewer than three). */
export function correlationByYear(points: BothLean[]): { year: number; r: number | null; n: number }[] {
  const by = new Map<number, BothLean[]>();
  for (const p of points) by.set(p.year, [...(by.get(p.year) ?? []), p]);
  return Array.from(by, ([year, ps]) => ({ year, r: pearson(ps.map((p) => [p.economic, p.political] as const)), n: ps.length })).sort((a, b) => a.year - b.year);
}

/** A lean this close to zero on an axis reads as balanced on that axis. */
export const DEAD_BAND = 5;

export type Quadrant = "both_china" | "both_us" | "sell_china_vote_us" | "vote_china_sell_us" | "mixed";

export const QUADRANTS: readonly Quadrant[] = ["both_china", "sell_china_vote_us", "vote_china_sell_us", "both_us", "mixed"];

export const QUADRANT_LABEL: Record<Quadrant, string> = {
  both_china: "Both toward China",
  both_us: "Both toward the United States",
  sell_china_vote_us: "Sells to China, votes with the United States",
  vote_china_sell_us: "Votes with China, sells to the United States",
  mixed: `Balanced on one axis (within ±${DEAD_BAND})`,
};

/** Which corner a country-year sits in: the sign of each lean, with a dead band around zero. */
export function quadrant(economic: number, political: number, band = DEAD_BAND): Quadrant {
  const e = Math.abs(economic) < band ? 0 : Math.sign(economic);
  const p = Math.abs(political) < band ? 0 : Math.sign(political);
  if (e > 0 && p > 0) return "both_china";
  if (e < 0 && p < 0) return "both_us";
  if (e > 0 && p < 0) return "sell_china_vote_us";
  if (e < 0 && p > 0) return "vote_china_sell_us";
  return "mixed";
}

export interface YearSplit {
  year: number;
  n: number;
  /** both leans toward the same actor */
  same: number;
  /** toward different actors */
  opposite: number;
  mixed: number;
  byQuadrant: Record<Quadrant, BothLean[]>;
}

export function yearSplit(points: BothLean[], year: number): YearSplit {
  const byQuadrant: Record<Quadrant, BothLean[]> = { both_china: [], both_us: [], sell_china_vote_us: [], vote_china_sell_us: [], mixed: [] };
  const ps = points.filter((p) => p.year === year).sort((a, b) => a.name.localeCompare(b.name));
  for (const p of ps) byQuadrant[quadrant(p.economic, p.political)].push(p);
  return {
    year,
    n: ps.length,
    same: byQuadrant.both_china.length + byQuadrant.both_us.length,
    opposite: byQuadrant.sell_china_vote_us.length + byQuadrant.vote_china_sell_us.length,
    mixed: byQuadrant.mixed.length,
    byQuadrant,
  };
}

export interface Mover {
  iso3: string;
  name: string;
  from: number;
  to: number;
  economicFrom: number;
  economicTo: number;
  politicalFrom: number;
  politicalTo: number;
  dEconomic: number;
  dPolitical: number;
  /** the political change minus the economic change: large when one axis moved and the other did not, or they moved apart */
  divergence: number;
  quadrantFrom: Quadrant;
  quadrantTo: Quadrant;
}

/** Every country with both leans in both years, sorted by how far its two leans moved apart. */
export function movers(points: BothLean[], from: number, to: number): Mover[] {
  const at = (year: number) => new Map(points.filter((p) => p.year === year).map((p) => [p.iso3, p]));
  const a = at(from);
  const b = at(to);
  const out: Mover[] = [];
  for (const [iso3, p0] of a) {
    const p1 = b.get(iso3);
    if (!p1) continue;
    const dEconomic = p1.economic - p0.economic;
    const dPolitical = p1.political - p0.political;
    out.push({
      iso3, name: p0.name, from, to,
      economicFrom: p0.economic, economicTo: p1.economic, politicalFrom: p0.political, politicalTo: p1.political,
      dEconomic, dPolitical, divergence: dPolitical - dEconomic,
      quadrantFrom: quadrant(p0.economic, p0.political), quadrantTo: quadrant(p1.economic, p1.political),
    });
  }
  return out.sort((x, y) => Math.abs(y.divergence) - Math.abs(x.divergence) || x.name.localeCompare(y.name));
}

export interface Trajectory {
  iso3: string;
  name: string;
  series: LeanPoint[];
}

/** One series per country, years ascending. */
export function trajectories(points: LeanPoint[]): Trajectory[] {
  const by = new Map<string, LeanPoint[]>();
  for (const p of points) by.set(p.iso3, [...(by.get(p.iso3) ?? []), p]);
  return Array.from(by, ([iso3, series]) => ({ iso3, name: series[0].name, series: series.sort((a, b) => a.year - b.year) })).sort((a, b) => a.name.localeCompare(b.name));
}

/** The latest year in which at least `min` countries have both leans; null when no year has. */
export function latestFullYear(points: BothLean[], min = 10): number | null {
  const counts = new Map<number, number>();
  for (const p of points) counts.set(p.year, (counts.get(p.year) ?? 0) + 1);
  const years = Array.from(counts).filter(([, n]) => n >= min).map(([y]) => y);
  return years.length ? Math.max(...years) : null;
}

export function firstYear(points: BothLean[]): number | null {
  return points.length ? Math.min(...points.map((p) => p.year)) : null;
}

/** "sells to China" / "sells to the United States" / "trade balanced" from an economic lean. */
export function sideWord(value: number, axis: "economic" | "political", band = DEAD_BAND): string {
  if (Math.abs(value) < band) return axis === "economic" ? "trade balanced" : "votes in between";
  const china = value > 0;
  return axis === "economic" ? (china ? "sells to China" : "sells to the United States") : china ? "votes with China" : "votes with the United States";
}

export interface MeanLean {
  year: number;
  /** mean over the countries with a value that year; null when none */
  economic: number | null;
  political: number | null;
  nEconomic: number;
  nPolitical: number;
}

/** The average lean per year across the countries that have one, for each sub-index. */
export function meanLeans(points: LeanPoint[]): MeanLean[] {
  const by = new Map<number, { e: number[]; p: number[] }>();
  for (const pt of points) {
    const b = by.get(pt.year) ?? { e: [], p: [] };
    if (pt.economic != null) b.e.push(pt.economic);
    if (pt.political != null) b.p.push(pt.political);
    by.set(pt.year, b);
  }
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  return Array.from(by, ([year, b]) => ({ year, economic: mean(b.e), political: mean(b.p), nEconomic: b.e.length, nPolitical: b.p.length })).sort((a, b) => a.year - b.year);
}

