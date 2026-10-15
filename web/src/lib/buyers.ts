/**
 * "Who buys": each country's China and US shares of its own reported exports of the tracked minerals, read from the
 * flows file (UN Comtrade reporter rows; the partner cells are the reporter's own, never mirrored). The bivariate grid
 * of the prototype's hero map colours both shares at once, so "both high" and "both low" stay distinct; the home page
 * and the explore page's "Who buys" view share the rule, the palette and the thresholds here.
 */
import type { FlowTradeRow } from "@/lib/types";

/** China's share across (columns), the US share down (rows); light where both are low, dark where both are high. */
export const BIV: string[][] = [
  ["#ecebe6", "#e9b89f", "#c4572b"],
  ["#b9c6dc", "#b79a9a", "#9e4f3b"],
  ["#3b69a8", "#5b5a8a", "#4a2f3a"],
];
export const BIV_NAMES = [
  ["Low China, low US", "Medium China, low US", "High China, low US"],
  ["Low China, medium US", "Medium both", "High China, medium US"],
  ["Low China, high US", "Medium China, high US", "High both"],
];
/** A share under 15% is low, over 40% high. */
export const BIV_LOW = 0.15;
export const BIV_HIGH = 0.4;
export const bin = (v: number) => (v < BIV_LOW ? 0 : v < BIV_HIGH ? 1 : 2);
/** The fill of a country whose both cells are present: row by the US share, column by China's. */
export const bivFill = (cn: number, us: number) => BIV[bin(us)][bin(cn)];

export interface BuyerCell {
  /** shares of the reporter's world total (0–1) */
  cn: number;
  us: number;
  /** the world total, million US$ */
  wld: number;
  source_id: string;
}

/** The countries of `scope` with a China cell, a US cell and a world total of at least US$1 million in the year for the mineral ("all" or a core id). */
export function buyerCells(rows: readonly FlowTradeRow[], year: number, mineral: string, scope: readonly string[]): Map<string, BuyerCell> {
  const set = new Set(scope);
  const out = new Map<string, BuyerCell>();
  for (const r of rows) {
    if (r.year !== year || r.mineral !== mineral || !set.has(r.iso3)) continue;
    const e = r.exports_musd;
    if (e.WLD == null || e.WLD < 1 || e.CN == null || e.US == null) continue;
    out.set(r.iso3, { cn: e.CN / e.WLD, us: e.US / e.WLD, wld: e.WLD, source_id: r.source_id });
  }
  return out;
}

/** The years in which at least `min` countries of `scope` carry both cells for the mineral, ascending. */
export function buyerYears(rows: readonly FlowTradeRow[], mineral: string, scope: readonly string[], min = 3): number[] {
  const set = new Set(scope);
  const by = new Map<number, number>();
  for (const r of rows) {
    if (r.mineral !== mineral || !set.has(r.iso3)) continue;
    const e = r.exports_musd;
    if (e.WLD == null || e.WLD < 1 || e.CN == null || e.US == null) continue;
    by.set(r.year, (by.get(r.year) ?? 0) + 1);
  }
  return Array.from(by.entries()).filter(([, n]) => n >= min).map(([y]) => y).sort((a, b) => a - b);
}
