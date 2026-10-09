/**
 * The scenario studio's arithmetic (DECISIONS 60): blends of the published forecast paths, historical echoes of
 * event families, redirected and revalued exports, and the index formula applied to a reader's numbers. Pure
 * functions over the numbers in insights.json; nothing here is stored or fed back into the pipeline.
 */
import type { EventEcho, ForecastPoint, InsightComponent, InsightTradeLatest, ScenarioId } from "./types";

export interface Levers {
  country: string;
  /** -1 = "US sourcing rules bite", 0 = baseline, +1 = "accelerated China pull" */
  pull: number;
  /** an event family (EventEcho.family) added as a shock, or null */
  shock: string | null;
  shockYear: number;
  divertMineral: string | null;
  /** share (0–1) of the mineral's exports to China moved away */
  divertPct: number;
  divertTo: "US" | "ROW";
  /** Chinese commitments at k × their 2015–2021 yearly average; 1 = leave the published component */
  cnFin: number;
  usFin: number;
  /** price change of the country's top priced mineral, in percent */
  pricePct: number;
}

export const DEFAULT_LEVERS: Omit<Levers, "country"> = { pull: 0, shock: null, shockYear: 2027, divertMineral: null, divertPct: 0, divertTo: "US", cnFin: 1, usFin: 1, pricePct: 0 };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Linear blend between the published paths: the pipeline's scenarios are the baseline paths plus a linear yearly shift,
 *  so an intermediate pull is exact except where a published path was clipped at a bound. */
export function blendPath(paths: Partial<Record<ScenarioId, ForecastPoint[]>> | undefined, pull: number): ForecastPoint[] {
  const base = paths?.baseline ?? [];
  const other = pull > 0 ? paths?.china_pull : pull < 0 ? paths?.us_reshoring : undefined;
  const w = clamp(Math.abs(pull), 0, 1);
  if (!other || w === 0) return base.map((p) => ({ ...p }));
  return base.map((b) => {
    const o = other.find((x) => x.year === b.year);
    if (!o) return { ...b };
    const mix = (k: keyof Omit<ForecastPoint, "year">) => b[k] * (1 - w) + o[k] * w;
    return { year: b.year, point: mix("point"), p05: mix("p05"), p25: mix("p25"), p75: mix("p75"), p95: mix("p95") };
  });
}

export function atYear(path: ForecastPoint[], year: number): ForecastPoint | undefined {
  return path.find((p) => p.year === year);
}

export interface EchoPoint {
  year: number;
  point: number;
  lo: number;
  hi: number;
}

/** The family's mean post-minus-pre change (and its middle half) added to a path from `fromYear` on: a historical echo, not a prediction. */
export function echoPath(path: ForecastPoint[], echo: Pick<EventEcho, "mean" | "p25" | "p75"> | null | undefined, fromYear: number, bounds: [number, number] = [0, 1]): EchoPoint[] {
  if (!echo) return [];
  return path
    .filter((p) => p.year >= fromYear)
    .map((p) => ({ year: p.year, point: clamp(p.point + echo.mean, bounds[0], bounds[1]), lo: clamp(p.point + Math.min(echo.p25, echo.p75), bounds[0], bounds[1]), hi: clamp(p.point + Math.max(echo.p25, echo.p75), bounds[0], bounds[1]) }));
}

export interface TradeWhatIf {
  exports: { US: number; CN: number; ROW: number };
  share_cn: number;
  share_us: number;
  total_musd: number;
  /** million US$ redirected away from China */
  moved_musd: number;
  /** change in value from the price lever, by destination */
  price_delta: { US: number; CN: number; ROW: number };
  parity: boolean;
  /** what would have to move from China to the United States for equal shares, after the levers */
  gap_musd: number;
}

/** Value that would have to move from China to the United States for equal shares (0 when the United States already buys more). */
export function parityGap(cn: number, us: number): number {
  return cn > us ? (cn - us) / 2 : 0;
}

/** Price lever first (every destination of the priced mineral revalued at constant volumes), then the redirect of a share of
 *  the diverted mineral's exports to China toward the United States or the rest of the world. */
export function tradeWhatIf(trade: InsightTradeLatest, levers: Pick<Levers, "divertMineral" | "divertPct" | "divertTo" | "pricePct">, pricedMineral: string | null): TradeWhatIf {
  const e = { US: trade.exports_musd.US ?? 0, CN: trade.exports_musd.CN ?? 0, ROW: trade.exports_musd.ROW ?? 0 };
  const price_delta = { US: 0, CN: 0, ROW: 0 };
  const minerals = new Map(trade.minerals.map((m) => [m.mineral, { US: m.exports_musd.US ?? 0, CN: m.exports_musd.CN ?? 0, ROW: m.exports_musd.ROW ?? 0 }]));
  const priced = pricedMineral ? minerals.get(pricedMineral) : undefined;
  if (priced && levers.pricePct !== 0) {
    const f = levers.pricePct / 100;
    for (const k of ["US", "CN", "ROW"] as const) {
      price_delta[k] = priced[k] * f;
      e[k] += price_delta[k];
      priced[k] += price_delta[k];
    }
  }
  const diverted = levers.divertMineral ? minerals.get(levers.divertMineral) : undefined;
  const moved_musd = diverted ? diverted.CN * clamp(levers.divertPct, 0, 1) : 0;
  e.CN -= moved_musd;
  if (levers.divertTo === "US") e.US += moved_musd;
  else e.ROW += moved_musd;
  const total_musd = e.US + e.CN + e.ROW;
  return { exports: e, share_cn: total_musd > 0 ? e.CN / total_musd : 0, share_us: total_musd > 0 ? e.US / total_musd : 0, total_musd, moved_musd, price_delta, parity: e.US >= e.CN, gap_musd: parityGap(e.CN, e.US) };
}

/** The index's normalisation: winsorised min–max with the bounds the pipeline used (quant.index.normalise). */
export function normalise(raw: number, scale: { lo: number; hi: number }): number {
  if (scale.hi <= scale.lo) return 50;
  return ((clamp(raw, scale.lo, scale.hi) - scale.lo) / (scale.hi - scale.lo)) * 100;
}

export interface IndexWhatIf {
  value: number | null;
  n: number;
  used: string[];
  /** components whose value the reader's levers set */
  changed: string[];
}

/** The published formula (equal weights over the available normalised components, at least `minComponents`) applied to
 *  the published components with the reader's raw values substituted where given. */
export function recomputeIndex(components: InsightComponent[], overrides: Record<string, number | null | undefined>, scales: Record<string, { lo: number; hi: number }>, minComponents = 3): IndexWhatIf {
  const vals: { name: string; v: number }[] = [];
  const changed: string[] = [];
  for (const c of components) {
    const o = overrides[c.name];
    if (o !== undefined && o !== null) {
      const s = scales[c.name];
      if (!s) continue;
      vals.push({ name: c.name, v: normalise(o, s) });
      if (!c.available || c.raw_value === null || Math.abs(o - c.raw_value) > 1e-9) changed.push(c.name);
    } else if (c.available && c.normalized_value !== null) {
      vals.push({ name: c.name, v: c.normalized_value });
    }
  }
  const used = vals.map((x) => x.name);
  if (vals.length < minComponents) return { value: null, n: vals.length, used, changed };
  return { value: vals.reduce((s, x) => s + x.v, 0) / vals.length, n: vals.length, used, changed };
}

/** finance_flow raw value: commitments over three years relative to GDP, from a yearly amount in million US$. */
export function financeRaw(yearlyMusd: number, gdpUsd: number | null | undefined): number | null {
  return gdpUsd && gdpUsd > 0 ? (3 * yearlyMusd * 1e6) / gdpUsd : null;
}

/** Yearly average of documented commitments over a window (years without a row count as zero inside the window). */
export function yearlyAverage(byYear: { year: number; US: number | null; CN: number | null }[], actor: "US" | "CN", lo: number, hi: number): number {
  const n = hi - lo + 1;
  return byYear.filter((b) => b.year >= lo && b.year <= hi).reduce((s, b) => s + (b[actor] ?? 0), 0) / Math.max(1, n);
}

/** The levers as URL parameters, so a scenario can be shared; only values away from the defaults are written. */
export function leversToParams(l: Levers, base?: URLSearchParams): URLSearchParams {
  const p = new URLSearchParams(base?.toString() ?? "");
  const set = (k: string, v: string | null) => (v === null ? p.delete(k) : p.set(k, v));
  set("country", l.country);
  set("pull", l.pull !== 0 ? String(Math.round(l.pull * 100) / 100) : null);
  set("shock", l.shock);
  set("shock_year", l.shock ? String(l.shockYear) : null);
  set("divert", l.divertMineral && l.divertPct > 0 ? `${l.divertMineral}:${Math.round(l.divertPct * 100)}:${l.divertTo}` : null);
  set("cnfin", l.cnFin !== 1 ? String(l.cnFin) : null);
  set("usfin", l.usFin !== 1 ? String(l.usFin) : null);
  set("price", l.pricePct !== 0 ? String(Math.round(l.pricePct)) : null);
  return p;
}

export function leversFromParams(p: URLSearchParams, fallbackCountry: string): Levers {
  const num = (k: string, d: number, lo: number, hi: number) => {
    const v = Number(p.get(k));
    return p.get(k) !== null && Number.isFinite(v) ? clamp(v, lo, hi) : d;
  };
  const divert = (p.get("divert") ?? "").split(":");
  const divertMineral = divert[0] || null;
  const divertPct = divertMineral ? clamp(Number(divert[1] || 0) / 100, 0, 1) : 0;
  return {
    country: p.get("country") || fallbackCountry,
    pull: num("pull", 0, -1, 1),
    shock: p.get("shock") || null,
    shockYear: Math.round(num("shock_year", DEFAULT_LEVERS.shockYear, 2026, 2029)),
    divertMineral,
    divertPct,
    divertTo: divert[2] === "ROW" ? "ROW" : "US",
    cnFin: num("cnfin", 1, 0, 5),
    usFin: num("usfin", 1, 0, 5),
    pricePct: num("price", 0, -50, 100),
  };
}
