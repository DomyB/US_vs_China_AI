import type { FlowsFile, FlowFinanceRow, FlowTradeRow, InsightCountry, InsightsFile, RealMeta, RegionData } from "./types";

/**
 * The numbers the story page prints, computed from the exported files so the home page, the evidence room and the
 * case files cannot disagree: every function reads the same rows the charts read. No number in the story is typed
 * into prose; the parity test in __tests__/story.test.ts recomputes the headline figures from the committed export.
 */

export const STORY_SINCE = 2008;

export interface YearShares {
  year: number;
  US: number;
  CN: number;
  ROW: number;
  total: number;
  share_us: number;
  share_cn: number;
  reporters: number;
  /** reporters whose US or China cell was absent that year (ROW then read the absent cell as 0) */
  partners_absent: number;
}

/** Regional mineral exports by destination and year from the `mineral = all` rows; absent partner cells are counted, never summed as zero silently. */
export function regionalTrade(flows: FlowsFile): YearShares[] {
  const by = new Map<number, YearShares>();
  for (const r of flows.trade) {
    if (r.mineral !== "all") continue;
    const y = by.get(r.year) ?? { year: r.year, US: 0, CN: 0, ROW: 0, total: 0, share_us: 0, share_cn: 0, reporters: 0, partners_absent: 0 };
    const us = r.exports_musd.US, cn = r.exports_musd.CN, row = r.exports_musd.ROW;
    y.US += us ?? 0;
    y.CN += cn ?? 0;
    y.ROW += row ?? 0;
    y.reporters += 1;
    if (us === null || cn === null) y.partners_absent += 1;
    by.set(r.year, y);
  }
  return [...by.values()]
    .map((y) => {
      const total = y.US + y.CN + y.ROW;
      return { ...y, total, share_us: total ? y.US / total : 0, share_cn: total ? y.CN / total : 0 };
    })
    .sort((a, b) => a.year - b.year);
}

export interface LedgerSide {
  origin: "US" | "CN";
  /** documented commitments, US$ m */
  documented_musd: number;
  events: number;
  with_amount: number;
  /** lower-confidence amounts, reported apart */
  undocumented_musd: number;
  undocumented_n: number;
  /** swap-line drawdowns, reported apart */
  swap_musd: number;
  swap_n: number;
  /** events with no documented amount at all (not lower-confidence, not a swap) */
  no_amount_n: number;
  first_year: number | null;
  last_year: number | null;
  by_year: { year: number; documented_musd: number; undocumented_musd: number; swap_musd: number }[];
}

function side(rows: FlowFinanceRow[], origin: "US" | "CN"): LedgerSide {
  const s: LedgerSide = { origin, documented_musd: 0, events: 0, with_amount: 0, undocumented_musd: 0, undocumented_n: 0, swap_musd: 0, swap_n: 0, no_amount_n: 0, first_year: null, last_year: null, by_year: [] };
  const yrs = new Map<number, { year: number; documented_musd: number; undocumented_musd: number; swap_musd: number }>();
  for (const r of rows) {
    if (r.origin !== origin) continue;
    s.documented_musd += r.amount_musd ?? 0;
    s.events += r.n_events ?? 0;
    s.with_amount += r.n_with_amount ?? 0;
    s.undocumented_musd += r.undocumented_musd ?? 0;
    s.undocumented_n += r.n_undocumented ?? 0;
    s.swap_musd += r.swap_musd ?? 0;
    s.swap_n += r.n_swap ?? 0;
    s.first_year = s.first_year === null ? r.year : Math.min(s.first_year, r.year);
    s.last_year = s.last_year === null ? r.year : Math.max(s.last_year, r.year);
    const y = yrs.get(r.year) ?? { year: r.year, documented_musd: 0, undocumented_musd: 0, swap_musd: 0 };
    y.documented_musd += r.amount_musd ?? 0;
    y.undocumented_musd += r.undocumented_musd ?? 0;
    y.swap_musd += r.swap_musd ?? 0;
    yrs.set(r.year, y);
  }
  s.no_amount_n = Math.max(0, s.events - s.with_amount - s.undocumented_n - s.swap_n);
  s.by_year = [...yrs.values()].sort((a, b) => a.year - b.year);
  return s;
}

/** The two ledgers, never summed: documented commitments by origin, with the lower-confidence amounts, the swaps and the counts kept apart. */
export function financeLedger(flows: FlowsFile, opts: { since?: number | null; iso3?: string } = {}): { CN: LedgerSide; US: LedgerSide } {
  const since = opts.since === undefined ? STORY_SINCE : opts.since;
  const rows = flows.finance.filter((r) => (since === null || r.year >= since) && (!opts.iso3 || r.iso3 === opts.iso3));
  return { CN: side(rows, "CN"), US: side(rows, "US") };
}

/** Swap-line drawdowns by year for one country (the rescue-lending record), US$ m. */
export function swapsByYear(flows: FlowsFile, iso3: string, origin: "US" | "CN" = "CN"): { year: number; musd: number }[] {
  return flows.finance
    .filter((r) => r.iso3 === iso3 && r.origin === origin && (r.swap_musd ?? 0) > 0)
    .map((r) => ({ year: r.year, musd: r.swap_musd ?? 0 }))
    .sort((a, b) => a.year - b.year);
}

/** The largest lower-confidence totals by country since `since`, US$ m. */
export function undocumentedByCountry(flows: FlowsFile, origin: "US" | "CN" = "CN", since: number | null = STORY_SINCE): { iso3: string; musd: number }[] {
  const by = new Map<string, number>();
  for (const r of flows.finance) {
    if (r.origin !== origin || (since !== null && r.year < since)) continue;
    by.set(r.iso3, (by.get(r.iso3) ?? 0) + (r.undocumented_musd ?? 0));
  }
  return [...by.entries()].map(([iso3, musd]) => ({ iso3, musd })).filter((x) => x.musd > 0).sort((a, b) => b.musd - a.musd);
}

export interface TradeReceipt {
  year: number;
  mineral: string;
  US: number | null;
  CN: number | null;
  ROW: number | null;
  total: number;
  share_us: number | null;
  share_cn: number | null;
  partners_absent: boolean;
}

/** One country's reported exports of one mineral in its latest (or a given) year; an absent partner cell stays null and is flagged. */
export function tradeReceipt(flows: FlowsFile, iso3: string, mineral: string, year?: number): TradeReceipt | null {
  const rows = flows.trade.filter((r) => r.iso3 === iso3 && r.mineral === mineral && (year === undefined || r.year === year));
  if (!rows.length) return null;
  const r = rows.reduce((a, b) => (b.year > a.year ? b : a));
  return receiptOf(r);
}

export function receiptOf(r: FlowTradeRow): TradeReceipt {
  const us = r.exports_musd.US, cn = r.exports_musd.CN, row = r.exports_musd.ROW;
  const total = (us ?? 0) + (cn ?? 0) + (row ?? 0);
  return { year: r.year, mineral: r.mineral, US: us, CN: cn, ROW: row, total, share_us: us === null || !total ? null : us / total, share_cn: cn === null || !total ? null : cn / total, partners_absent: us === null || cn === null };
}

/** Latest-year shares per mineral from region.json, sorted by the share to China, with the world total every bar is a share of. */
export function mineralBoard(shares: RegionData["mineral_shares"], year?: number) {
  const latest = year ?? Math.max(...shares.map((s) => s.year));
  return shares
    .filter((s) => s.year === latest && s.mineral !== "all")
    .map((s) => ({ mineral: s.mineral, year: s.year, share_cn: s.share_cn, share_us: s.share_us, share_other: s.share_other, world_musd: s.exports_wld_musd, small_total: (s.exports_wld_musd ?? 0) < 100 }))
    .sort((a, b) => (b.share_cn ?? 0) - (a.share_cn ?? 0));
}

export function country(insights: InsightsFile, iso3: string): InsightCountry | undefined {
  return insights.countries.find((c) => c.iso3 === iso3);
}

export function contrast<T extends { id: string }>(c: InsightCountry | undefined, id: string): T | undefined {
  return c?.contrasts.find((x) => x.id === id) as T | undefined;
}

/** The "loan arrives, line stays flat" cases: every finance_without_trade_response flag across the countries, largest share of GDP first. */
export function loanThenFlat(insights: InsightsFile) {
  const out: { iso3: string; name: string; year: number; actor: "US" | "CN"; score: number | null; description: string; id: string; series: InsightCountry["trade_series"] }[] = [];
  for (const c of insights.countries) {
    for (const f of c.flags.items) {
      if (!f.id.includes("finance_without_trade_response")) continue;
      out.push({ iso3: c.iso3, name: c.name, year: f.year, actor: f.actor, score: f.score, description: f.description, id: f.id, series: c.trade_series });
    }
  }
  return out.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
}

/**
 * Coverage as a fact: which record each country carries, from meta.json's coverage block. The two finance cells are
 * derived per origin from the finance rows in flows.json, so a country with Chinese rows and no DFC/EXIM row (Venezuela)
 * shows the US cell as missing, not held; the years come from the rows and from flows.meta.last_year.
 */
export function coverageWall(meta: RealMeta, flows: FlowsFile) {
  const cols = ["trade", "finance CN", "finance US", "statements", "parliament", "media", "forecast", "analysis"] as const;
  const span = (rows: FlowFinanceRow[]) => {
    const years = rows.map((r) => r.year);
    return `${Math.min(...years)}–${Math.max(...years)}`;
  };
  const rows = Object.entries(meta.coverage).map(([iso3, c]) => {
    const cn = flows.finance.filter((r) => r.iso3 === iso3 && r.origin === "CN");
    const us = flows.finance.filter((r) => r.iso3 === iso3 && r.origin === "US");
    const cells: Record<(typeof cols)[number], { ok: boolean; note: string }> = {
      trade: { ok: (c.trade_years?.length ?? 0) > 0, note: c.trade_years?.length ? `reported ${c.trade_years[0]}–${c.trade_years[c.trade_years.length - 1]}` : "no reported trade" },
      "finance CN": { ok: cn.length > 0, note: cn.length ? `AidData GCDF 3.0, rows ${span(cn)}; the source ends in ${flows.meta.last_year.finance_CN ?? "–"}` : "no Chinese finance record (AidData GCDF 3.0)" },
      "finance US": { ok: us.length > 0, note: us.length ? `DFC and EXIM authorisations, rows ${span(us)}; the record runs to ${flows.meta.last_year.finance_US ?? "–"}` : "no DFC or EXIM record" },
      statements: { ok: (c.statements ?? 0) > 0, note: `${c.statements ?? 0} coded statements` },
      parliament: { ok: !!c.parliament_available, note: c.parliament_available ? `${c.parliament_documents ?? 0} legislative records` : (c.parliament_note ?? "no machine-readable legislature") },
      media: { ok: (c.media_articles ?? 0) > 0, note: `${c.media_articles ?? 0} headlines` },
      forecast: { ok: !!c.forecast_available, note: c.forecast_available ? "backtested to 2030" : "too few trade years to forecast" },
      analysis: { ok: !!c.analysis_available, note: c.analysis_available ? "index computed" : "fewer than three components" },
    };
    return { iso3, cells };
  });
  return { cols: [...cols], rows };
}
