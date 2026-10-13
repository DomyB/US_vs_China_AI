import type { ComponentsFile } from "./geometry";
import type { IndexRow } from "./types";

/**
 * The whole picture: region-wide series computed in the browser from the exported rows (flows.json, index.json,
 * components.json). A sum covers the countries that reported in that year and says how many; nothing is imputed for a
 * country without a row, and a cell that is absent for one actor is absent from that actor's sum, never read as zero.
 */

export interface FlowTradeRow {
  iso3: string;
  year: number;
  mineral: string;
  exports_musd: { US?: number | null; CN?: number | null; ROW?: number | null; WLD?: number | null };
}
export interface FlowFinanceRow {
  iso3: string;
  year: number;
  origin: "US" | "CN";
  amount_musd: number;
  n_events: number;
  swap_musd: number;
  undocumented_musd: number;
}

export interface TradeYear {
  year: number;
  CN: number | null;
  US: number | null;
  WLD: number | null;
  /** countries with an all-minerals row that year, and how many of them carry a China / US cell */
  n: number;
  n_cn: number;
  n_us: number;
  /** the two actors' shares of the summed world totals of the countries that carry both cells */
  share_cn: number | null;
  share_us: number | null;
}

/** Yearly sums of reported mineral exports (mineral "all") to China, to the United States and to the world, over the countries in `scope`. */
export function tradeByYear(rows: FlowTradeRow[], scope: ReadonlySet<string>): TradeYear[] {
  const by = new Map<number, TradeYear & { wld_both: number }>();
  for (const r of rows) {
    if (r.mineral !== "all" || !scope.has(r.iso3)) continue;
    const t = by.get(r.year) ?? { year: r.year, CN: null, US: null, WLD: null, n: 0, n_cn: 0, n_us: 0, share_cn: null, share_us: null, wld_both: 0 };
    t.n += 1;
    const e = r.exports_musd;
    if (e.CN != null) { t.CN = (t.CN ?? 0) + e.CN; t.n_cn += 1; }
    if (e.US != null) { t.US = (t.US ?? 0) + e.US; t.n_us += 1; }
    if (e.WLD != null) t.WLD = (t.WLD ?? 0) + e.WLD;
    if (e.CN != null && e.US != null && e.WLD != null) t.wld_both += e.WLD;
    by.set(r.year, t);
  }
  return Array.from(by.values())
    .sort((a, b) => a.year - b.year)
    .map(({ wld_both, ...t }) => ({ ...t, share_cn: wld_both > 0 && t.CN != null ? t.CN / wld_both : null, share_us: wld_both > 0 && t.US != null ? t.US / wld_both : null }));
}

export interface FinanceYear {
  year: number;
  CN: { amount: number; swap: number; n: number; countries: number };
  US: { amount: number; swap: number; n: number; countries: number };
}

/** Yearly documented commitments by origin (swap drawdowns apart), over the countries in `scope`. */
export function financeByYear(rows: FlowFinanceRow[], scope: ReadonlySet<string>): FinanceYear[] {
  const by = new Map<number, FinanceYear & { cCN: Set<string>; cUS: Set<string> }>();
  for (const r of rows) {
    if (!scope.has(r.iso3)) continue;
    const f = by.get(r.year) ?? { year: r.year, CN: { amount: 0, swap: 0, n: 0, countries: 0 }, US: { amount: 0, swap: 0, n: 0, countries: 0 }, cCN: new Set<string>(), cUS: new Set<string>() };
    const side = f[r.origin];
    side.amount += r.amount_musd;
    side.swap += r.swap_musd ?? 0;
    side.n += r.n_events;
    (r.origin === "CN" ? f.cCN : f.cUS).add(r.iso3);
    by.set(r.year, f);
  }
  return Array.from(by.values())
    .sort((a, b) => a.year - b.year)
    .map(({ cCN, cUS, ...f }) => ({ ...f, CN: { ...f.CN, countries: cCN.size }, US: { ...f.US, countries: cUS.size } }));
}

export interface VotesYear {
  year: number;
  CN: number | null;
  US: number | null;
  n: number;
}

/** Mean UN General Assembly agreement rate with each actor per year, over the countries with a value for both. */
export function votesByYear(file: ComponentsFile, scope: ReadonlySet<string>): VotesYear[] {
  const by = new Map<number, Map<string, { CN?: number; US?: number }>>();
  for (const r of file.components) {
    if (r.k !== "diplomatic_alignment" || !r.ok || r.raw == null || !scope.has(r.c)) continue;
    const m = by.get(r.y) ?? new Map();
    const c = m.get(r.c) ?? {};
    c[r.a] = r.raw;
    m.set(r.c, c);
    by.set(r.y, m);
  }
  return Array.from(by.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([year, m]) => {
      const both = Array.from(m.values()).filter((c) => c.CN != null && c.US != null);
      const mean = (k: "CN" | "US") => (both.length ? both.reduce((s, c) => s + (c[k] as number), 0) / both.length : null);
      return { year, CN: mean("CN"), US: mean("US"), n: both.length };
    });
}

export interface LeanYear {
  year: number;
  /** mean of (China index − US index) over the countries with both composites */
  net: number | null;
  CN: number | null;
  US: number | null;
  n: number;
  /** countries leaning China (net > 0) and the United States (net < 0) */
  lean_cn: number;
  lean_us: number;
}

export function leanByYear(rows: IndexRow[], scope: ReadonlySet<string>): LeanYear[] {
  const by = new Map<number, Map<string, { CN?: number; US?: number }>>();
  for (const r of rows) {
    if (r.mineral !== "all" || (r.index ?? "composite") !== "composite" || r.value == null || !scope.has(r.iso3)) continue;
    const m = by.get(r.year) ?? new Map();
    const c = m.get(r.iso3) ?? {};
    c[r.actor] = r.value;
    m.set(r.iso3, c);
    by.set(r.year, m);
  }
  return Array.from(by.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([year, m]) => {
      const both = Array.from(m.values()).filter((c) => c.CN != null && c.US != null) as { CN: number; US: number }[];
      const n = both.length;
      return {
        year,
        net: n ? both.reduce((s, c) => s + c.CN - c.US, 0) / n : null,
        CN: n ? both.reduce((s, c) => s + c.CN, 0) / n : null,
        US: n ? both.reduce((s, c) => s + c.US, 0) / n : null,
        n,
        lean_cn: both.filter((c) => c.CN > c.US).length,
        lean_us: both.filter((c) => c.US > c.CN).length,
      };
    });
}

/** The latest year at or before `max` with at least `min` countries, else the latest year at all. */
export function latestYear<T extends { year: number; n: number }>(rows: T[], max: number, min = 3): T | null {
  const ok = rows.filter((r) => r.year <= max && r.n >= min);
  return ok.length ? ok[ok.length - 1] : rows.length ? rows[rows.length - 1] : null;
}
