import type { CountryCoverage, CountryData, IndexFile, IndexRow, Meta, RealCountryData, RealMediaFile, RealMeta, RealParliamentFile, RegionData } from "./types";

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
  const realMeta = await loadRealMeta();
  const cov = realMeta?.coverage?.[iso3];
  if (!cov) return mergeRealLayers(sample, undefined, null, null, null);
  const safe = async <T,>(p: Promise<T>): Promise<T | null> => p.catch(() => null);
  const [real, parliament, media] = await Promise.all([
    cov.actions || cov.governance_available ? safe(getJSON<RealCountryData>(`${REAL}/country/${iso3}.json`)) : Promise.resolve(null),
    cov.parliament_available ? safe(getJSON<RealParliamentFile>(`${REAL}/parliament/${iso3}.json`)) : Promise.resolve(null),
    cov.media_available ? safe(getJSON<RealMediaFile>(`${REAL}/media/${iso3}.json`)) : Promise.resolve(null),
  ]);
  return mergeRealLayers(sample, cov, real, parliament, media);
}

/**
 * Pure merge of the real layers into the sample country file. Actions and governance are replaced
 * wholesale; for parliament and media only the record lists are replaced (stance series, volume
 * and narratives stay sample until Phase 3) and the layer is marked "facts_only".
 */
export function mergeRealLayers(sample: CountryData, cov: CountryCoverage | undefined, real: RealCountryData | null, parliament: RealParliamentFile | null, media: RealMediaFile | null): CountryData {
  sample.layers = { actions: "sample", governance: "none", parliament: "sample", media: "sample", analysis: "sample", forecast: "sample" };
  if (!cov) return sample;
  if (real && cov.actions) {
    sample.actions = { events: real.actions.events, trade: real.actions.trade, contracts: real.actions.contracts, production: real.actions.production };
    sample.freshness = { ...sample.freshness, actions: real.freshness.actions };
    sample.layers.actions = "real";
    sample.trade_discrepancies = real.trade_discrepancies;
  }
  if (real && cov.governance_available) {
    sample.governance = real.governance;
    sample.freshness = { ...sample.freshness, governance: real.freshness.governance };
    sample.layers.governance = "real";
  }
  if (parliament && cov.parliament_available) {
    sample.parliament = { ...sample.parliament, documents: parliament.documents };
    sample.freshness = { ...sample.freshness, parliament: parliament.freshness };
    sample.layers.parliament = "facts_only";
  }
  if (media && cov.media_available) {
    sample.media = { ...sample.media, articles: media.articles };
    sample.freshness = { ...sample.freshness, media: media.freshness };
    sample.layers.media = "facts_only";
  }
  sample.parliament_note = cov.parliament_note ?? null;
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
