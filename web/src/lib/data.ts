import type { CountryData, IndexFile, IndexRow, Meta, RegionData } from "./types";

const BASE = "/data/sample";

async function getJSON<T>(path: string): Promise<T> {
  const res = await fetch(path, { cache: "force-cache" });
  if (!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`);
  return (await res.json()) as T;
}

export const loadMeta = () => getJSON<Meta>(`${BASE}/meta.json`);
export const loadIndex = () => getJSON<IndexFile>(`${BASE}/index.json`);
export const loadCountry = (iso3: string) => getJSON<CountryData>(`${BASE}/country/${iso3}.json`);
export const loadRegion = () => getJSON<RegionData>(`${BASE}/region.json`);

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
