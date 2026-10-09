import type { Feature, FeatureCollection, LineString } from "geojson";
import { ACTOR_LABEL } from "@/lib/constants";
import type { FlowsFile } from "@/lib/types";

export type FlowView = "index" | "money" | "trade";
export type FlowSpan = "1" | "3" | "all";
export type Actor = "US" | "CN";
export const FIRST_FLOW_YEAR = 2008;

/** One arc's worth of data: a country and an actor over the selected window. */
export interface FlowAgg {
  iso3: string;
  actor: Actor;
  /** money: documented commitments; trade: reported exports; million US$ */
  amount: number;
  /** money: finance events in the window; trade: year rows with a reported value */
  n: number;
  /** money: events with a published amount */
  nAmount: number;
  nUndocumented: number;
  undocumented: number;
  swap: number;
  sources: string[];
  from: number;
  to: number;
}

export interface FlowProps {
  id: string;
  iso3: string;
  actor: Actor;
  amount: number;
  n: number;
  n_amount: number;
  width: number;
  dim: boolean;
  title: string;
  detail: string;
}

export function spanYears(year: number, span: FlowSpan, first = FIRST_FLOW_YEAR): [number, number] {
  if (span === "all") return [first, year];
  if (span === "3") return [Math.max(first, year - 2), year];
  return [year, year];
}

/** Sum the flows file over the window for the view: finance by origin, or reported exports of the mineral to each actor. */
export function aggregateFlows(file: FlowsFile, view: FlowView, year: number, span: FlowSpan, mineral: string): FlowAgg[] {
  if (view === "index") return [];
  const [from, to] = spanYears(year, span);
  const out = new Map<string, FlowAgg>();
  const get = (iso3: string, actor: Actor) => {
    const k = `${iso3}|${actor}`;
    let a = out.get(k);
    if (!a) {
      a = { iso3, actor, amount: 0, n: 0, nAmount: 0, nUndocumented: 0, undocumented: 0, swap: 0, sources: [], from, to };
      out.set(k, a);
    }
    return a;
  };
  const addSource = (a: FlowAgg, s: string) => {
    if (s && !a.sources.includes(s)) a.sources.push(s);
  };
  if (view === "money") {
    for (const r of file.finance) {
      if (r.year < from || r.year > to) continue;
      const a = get(r.iso3, r.origin);
      a.amount += r.amount_musd;
      a.n += r.n_events;
      a.nAmount += r.n_with_amount;
      a.nUndocumented += r.n_undocumented;
      a.undocumented += r.undocumented_musd;
      a.swap += r.swap_musd;
      for (const s of r.source_ids) addSource(a, s);
    }
  } else {
    for (const r of file.trade) {
      if (r.mineral !== mineral || r.year < from || r.year > to) continue;
      for (const actor of ["US", "CN"] as const) {
        const v = r.exports_musd[actor];
        if (v === null || v === undefined) continue;
        const a = get(r.iso3, actor);
        a.amount += v;
        a.n += 1;
        a.nAmount += 1;
        addSource(a, r.source_id);
      }
    }
  }
  return Array.from(out.values())
    .filter((a) => a.n > 0)
    .sort((a, b) => a.iso3.localeCompare(b.iso3) || a.actor.localeCompare(b.actor));
}

/** Line width in pixels from the amount; the scale is shared by every arc on the map. */
export function widthScale(maxAmount: number): (amount: number) => number {
  const max = Math.max(maxAmount, 1e-9);
  return (amount: number) => (amount <= 0 ? 1 : Math.round((1.5 + 7.5 * Math.sqrt(Math.min(amount, max) / max)) * 100) / 100);
}

/**
 * Arc from one point to another in unwrapped longitude/latitude space: a quadratic curve bulging northward.
 * `westward` sends the arc west across the Pacific (longitudes below -180 for China), which MapLibre renders
 * continuously on the neighbouring world copy. Schematic, not a route.
 */
export function arcPoints(from: [number, number], to: [number, number], n = 48, westward = false): [number, number][] {
  let toLon = to[0];
  if (westward && toLon > from[0]) toLon -= 360;
  if (!westward && toLon - from[0] > 180) toLon -= 360;
  if (!westward && from[0] - toLon > 180) toLon += 360;
  const dLon = toLon - from[0];
  const bulge = Math.min(65, Math.max(from[1], to[1]) + Math.min(28, 0.2 * Math.abs(dLon)) + 4);
  const c: [number, number] = [from[0] + dLon / 2, bulge];
  const pts: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    pts.push([round(u * u * from[0] + 2 * u * t * c[0] + t * t * toLon), round(u * u * from[1] + 2 * u * t * c[1] + t * t * to[1])]);
  }
  return pts;
}

const round = (v: number) => Math.round(v * 1000) / 1000;

export function fmtAmount(musd: number): string {
  if (musd >= 1000) return `US$ ${(musd / 1000).toLocaleString("en-GB", { maximumFractionDigits: musd >= 10000 ? 0 : 1 })} bn`;
  if (musd >= 1) return `US$ ${musd.toLocaleString("en-GB", { maximumFractionDigits: 0 })} m`;
  return `US$ ${musd.toLocaleString("en-GB", { maximumFractionDigits: 2 })} m`;
}

/** Popup wording for one arc; every number is from the aggregated file and the sources are named. */
export function describeFlow(a: FlowAgg, view: FlowView, names: Record<string, string>, sourceNames: Record<string, { name: string }>): { title: string; detail: string } {
  const country = names[a.iso3] ?? a.iso3;
  const actor = ACTOR_LABEL[a.actor];
  const window = a.from === a.to ? String(a.to) : `${a.from}–${a.to}`;
  const sources = a.sources.map((s) => sourceNames[s]?.name ?? s).join(", ");
  if (view === "money") {
    const missing = a.n - a.nAmount - a.nUndocumented;
    const parts = [a.amount > 0 ? `${fmtAmount(a.amount)} in documented commitments` : "no documented commitment with a published amount", `${a.n} event${a.n === 1 ? "" : "s"}`];
    if (missing > 0) parts.push(`${missing} without a published amount`);
    if (a.nUndocumented > 0) parts.push(`${a.nUndocumented} lower-confidence record${a.nUndocumented === 1 ? "" : "s"} (${fmtAmount(a.undocumented)}, not counted)`);
    if (a.swap > 0) parts.push(`swap-line drawdowns of ${fmtAmount(a.swap)} shown apart`);
    return { title: `${actor} → ${country}`, detail: `${parts.join(" · ")} · ${window} · ${sources}` };
  }
  return { title: `${country} → ${actor}`, detail: `${fmtAmount(a.amount)} of reported exports · ${a.n} year${a.n === 1 ? "" : "s"} · ${window} · ${sources}` };
}

export function flowsToGeoJSON(
  aggs: FlowAgg[],
  view: FlowView,
  centroids: Record<string, [number, number]>,
  anchors: Record<Actor, [number, number]>,
  selection: Set<string>,
  names: Record<string, string>,
  sourceNames: Record<string, { name: string }>,
): FeatureCollection<LineString, FlowProps> {
  const width = widthScale(Math.max(0, ...aggs.map((a) => a.amount)));
  const features: Feature<LineString, FlowProps>[] = [];
  for (const a of aggs) {
    const c = centroids[a.iso3];
    if (!c) continue;
    const anchor = anchors[a.actor];
    const westward = a.actor === "CN";
    // money runs from the lender to the country, trade from the country to the buyer
    const pts = view === "money" ? arcPoints(c, anchor, 48, westward).reverse() : arcPoints(c, anchor, 48, westward);
    const { title, detail } = describeFlow(a, view, names, sourceNames);
    features.push({
      type: "Feature",
      geometry: { type: "LineString", coordinates: pts },
      properties: { id: `${a.iso3}-${a.actor}`, iso3: a.iso3, actor: a.actor, amount: a.amount, n: a.n, n_amount: a.nAmount, width: width(a.amount), dim: selection.size > 0 && !selection.has(a.iso3), title, detail },
    });
  }
  return { type: "FeatureCollection", features };
}

/** Bounds of every arc (unwrapped longitudes), for the camera in the flow views. */
export function flowBounds(fc: FeatureCollection<LineString, FlowProps>): [[number, number], [number, number]] | null {
  let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;
  for (const f of fc.features) {
    for (const [lon, lat] of f.geometry.coordinates) {
      if (lon < minLon) minLon = lon;
      if (lon > maxLon) maxLon = lon;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }
  }
  if (!Number.isFinite(minLon)) return null;
  return [[minLon, minLat], [maxLon, maxLat]];
}

export function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}
