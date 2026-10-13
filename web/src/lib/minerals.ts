/** The mineral case files (minerals.json and minerals/<id>.json), written by the pipeline's export (scm/minerals_export.py). */

export interface MineralSource {
  id: string | null;
  url: string | null;
}

export interface MineralIndexEntry {
  id: string;
  name: string;
  core: boolean;
  on_us_list: boolean;
  on_cn_list: boolean;
  in_region: string[];
  note: string | null;
  uses: string | null;
  why_it_matters: string | null;
  uses_source: string | null;
  producers: string[];
  n_trade_rows: number;
  n_production_rows: number;
  n_prices: number;
  n_concessions: number;
  n_index_rows: number;
  countries_with_trade: string[];
  hs6: string[];
  top_exporters: MineralImportance[];
}

export interface MineralsFile {
  dataset: string;
  generated_on: string;
  layer: "facts";
  minerals: MineralIndexEntry[];
  note: string;
}

export interface MineralImportance {
  iso3: string;
  name: string;
  year: number;
  exports_musd: number | null;
  share_cn: number | null;
  share_us: number | null;
}

export interface MineralTradeCell {
  iso3: string;
  year: number;
  flow: "X" | "M";
  musd: { CN: number | null; US: number | null; WLD: number | null };
  source_id: string | null;
}

export interface MineralProductionRow {
  iso3: string;
  year: number;
  measure: "production" | "reserves";
  qty: number | null;
  unit: string;
  note: string | null;
  source: MineralSource | null;
}

export interface MineralPrice {
  series: string;
  date: string;
  year: number;
  price: number;
  unit: string;
  source: MineralSource | null;
}

export interface MineralConcession {
  id: string;
  iso3: string;
  title: string | null;
  holder: string | null;
  status: string | null;
  granted_year: number | null;
  area_ha: number | null;
  lat: number | null;
  lon: number | null;
  source: MineralSource | null;
}

export interface MineralFile extends Omit<MineralIndexEntry, "n_trade_rows" | "n_production_rows" | "n_prices" | "n_concessions" | "n_index_rows" | "countries_with_trade" | "hs6" | "top_exporters"> {
  dataset: string;
  generated_on: string;
  layer: "facts";
  hs_codes: { hs6: string; stage: string | null; description: string | null; shared: boolean }[];
  importance: MineralImportance[];
  production: MineralProductionRow[];
  trade: MineralTradeCell[];
  prices: MineralPrice[];
  concessions: MineralConcession[];
  index: { iso3: string; year: number; actor: "US" | "CN"; value: number; n_components: number | null }[];
  note_method: string;
}

/** The production series worth drawing: per country, the unit with the most rows for `measure`; the other units stay in the table. */
/** The units of a measure, the one shared by the most countries first (so the chart opens on the most comparable series). */
export function unitsByCountries(series: { unit: string }[]): string[] {
  const n = new Map<string, number>();
  for (const s of series) n.set(s.unit, (n.get(s.unit) ?? 0) + 1);
  return Array.from(n.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([u]) => u);
}

export function mainSeries(rows: MineralProductionRow[], measure: "production" | "reserves"): { iso3: string; unit: string; rows: MineralProductionRow[] }[] {
  const by = new Map<string, Map<string, MineralProductionRow[]>>();
  for (const r of rows) {
    if (r.measure !== measure || r.qty == null) continue;
    const u = by.get(r.iso3) ?? new Map();
    u.set(r.unit, [...(u.get(r.unit) ?? []), r]);
    by.set(r.iso3, u);
  }
  return Array.from(by.entries())
    .map(([iso3, units]) => {
      const [unit, list] = Array.from(units.entries()).sort((a, b) => b[1].length - a[1].length)[0];
      // one row per year: the latest-noted source wins ties by keeping the first row seen
      const seen = new Map<number, MineralProductionRow>();
      for (const r of list) if (!seen.has(r.year)) seen.set(r.year, r);
      return { iso3, unit, rows: Array.from(seen.values()).sort((a, b) => a.year - b.year) };
    })
    .sort((a, b) => a.iso3.localeCompare(b.iso3));
}

/** The latest export cell per country with a world total, for the "who buys it" exhibit. */
export function latestExports(trade: MineralTradeCell[]): MineralTradeCell[] {
  const latest = new Map<string, MineralTradeCell>();
  for (const c of trade) {
    if (c.flow !== "X" || c.musd.WLD == null) continue;
    const cur = latest.get(c.iso3);
    if (!cur || c.year > cur.year) latest.set(c.iso3, c);
  }
  return Array.from(latest.values()).sort((a, b) => (b.musd.WLD ?? 0) - (a.musd.WLD ?? 0));
}

/** Yearly sums over the countries reporting: exports to China, to the United States and to the world. */
export function exportsByYear(trade: MineralTradeCell[]): { year: number; CN: number | null; US: number | null; WLD: number | null; n: number }[] {
  const by = new Map<number, { year: number; CN: number | null; US: number | null; WLD: number | null; n: number }>();
  for (const c of trade) {
    if (c.flow !== "X") continue;
    const t = by.get(c.year) ?? { year: c.year, CN: null, US: null, WLD: null, n: 0 };
    t.n += 1;
    for (const k of ["CN", "US", "WLD"] as const) if (c.musd[k] != null) t[k] = (t[k] ?? 0) + (c.musd[k] as number);
    by.set(c.year, t);
  }
  return Array.from(by.values()).sort((a, b) => a.year - b.year);
}
