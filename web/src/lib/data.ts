import type { CountryData, IndexFile, IndexRow, Meta, RealCountryData, RealMeta, RegionData } from "./types";

const BASE = "/data/sample";
const REAL = "/data/real";

async function getJSON<T>(path: string): Promise<T> {
  const res = await fetch(path, { cache: "force-cache" });
  if (!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`);
  return (await res.json()) as T;
}

export const loadMeta = () => getJSON<Meta>(`${BASE}/meta.json`);
export const loadIndex = () => getJSON<IndexFile>(`${BASE}/index.json`);
export const loadRegion = () => getJSON<RegionData>(`${BASE}/region.json`);

/** Real-data metadata, or null when no ingestion has run yet (file absent). */
export async function loadRealMeta(): Promise<RealMeta | null> {
  try {
    const res = await fetch(`${REAL}/meta.json`, { cache: "force-cache" });
    if (!res.ok) return null;
    return (await res.json()) as RealMeta;
  } catch {
    return null;
  }
}

/**
 * Country data with the facts layer (actions, governance) taken from the real dataset when
 * the ingestion has produced it for this country, and every other layer from the sample set.
 * `layers` records where each block came from so the UI can label it.
 */
export async function loadCountry(iso3: string): Promise<CountryData> {
  const sample = await getJSON<CountryData>(`${BASE}/country/${iso3}.json`);
  sample.layers = { actions: "sample", governance: "none", parliament: "sample", media: "sample", analysis: "sample", forecast: "sample" };
  const realMeta = await loadRealMeta();
  const cov = realMeta?.coverage?.[iso3];
  if (!cov || (!cov.actions && !cov.governance_available)) return sample;
  try {
    const real = await getJSON<RealCountryData>(`${REAL}/country/${iso3}.json`);
    if (cov.actions) {
      sample.actions = { events: real.actions.events, trade: real.actions.trade, contracts: real.actions.contracts, production: real.actions.production };
      sample.freshness = { ...sample.freshness, actions: real.freshness.actions };
      sample.layers.actions = "real";
      sample.trade_discrepancies = real.trade_discrepancies;
    }
    if (cov.governance_available) {
      sample.governance = real.governance;
      sample.freshness = { ...sample.freshness, governance: real.freshness.governance };
      sample.layers.governance = "real";
    }
  } catch {
    // real file missing or malformed: keep the sample and say so through layers
  }
  return sample;
}

/** Region mineral shares from real trade data when available, else sample. */
export async function loadRegionShares(): Promise<{ rows: RegionData["mineral_shares"]; layer: "real" | "sample" }> {
  const realMeta = await loadRealMeta();
  if (realMeta) {
    try {
      const real = await getJSON<{ mineral_shares: RegionData["mineral_shares"] }>(`${REAL}/region.json`);
      if (real.mineral_shares.length > 0) return { rows: real.mineral_shares, layer: "real" };
    } catch {
      // fall through
    }
  }
  const sample = await loadRegion();
  return { rows: sample.mineral_shares, layer: "sample" };
}

export type IndexLookup = Map<string, IndexRow>;

export function indexKey(iso3: string, year: number, actor: string, mineral: string): string {
  return `${iso3}|${year}|${actor}|${mineral}`;
}

export function buildIndexLookup(rows: IndexRow[]): IndexLookup {
  const m: IndexLookup = new Map();
  for (const r of rows) m.set(indexKey(r.iso3, r.year, r.actor, r.mineral), r);
  return m;
}

/** Value shown on the map for a country given the actor mode. "both" returns CN minus US in [-100, 100]. */
export function mapValue(lookup: IndexLookup, iso3: string, year: number, mode: "US" | "CN" | "both", mineral: string): number | null {
  if (mode === "both") {
    const us = lookup.get(indexKey(iso3, year, "US", mineral));
    const cn = lookup.get(indexKey(iso3, year, "CN", mineral));
    if (!us || !cn) return null;
    return cn.value - us.value;
  }
  const r = lookup.get(indexKey(iso3, year, mode, mineral));
  return r ? r.value : null;
}
