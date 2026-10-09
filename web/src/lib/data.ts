import type { ValidationFile, CountryCoverage, CountryData, IndexFile, IndexRow, Meta, QuantFile, RealCountryData, RealMediaFile, RealMeta, RealParliamentFile, RegionData } from "./types";

const BASE = "/data/sample";
const REAL = "/data/real";

async function getJSON<T>(path: string): Promise<T> {
  const res = await fetch(path, { cache: "force-cache" });
  if (!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`);
  return (await res.json()) as T;
}

export const loadMeta = () => getJSON<Meta>(`${BASE}/meta.json`);
export const loadRegion = () => getJSON<RegionData>(`${BASE}/region.json`);

/** The seeded sample index, tagged as such. */
export const loadSampleIndex = async (): Promise<IndexFile> => ({ ...(await getJSON<IndexFile>(`${BASE}/index.json`)), layer: "sample" });

/**
 * The influence index: the computed one (web/public/data/real/index.json, Phase 4) once the real metadata says the
 * analysis layer is real and the file carries rows, otherwise the sample index. `layer` says which one came back.
 */
export async function loadIndex(): Promise<IndexFile> {
  const realMeta = await loadRealMeta();
  if (realMeta?.layers?.analysis === "real") {
    try {
      const real = await getJSON<IndexFile>(`${REAL}/index.json`);
      if (real.rows.length > 0) return { ...real, layer: "real" };
    } catch {
      // fall through to the sample index
    }
  }
  return loadSampleIndex();
}

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
 * wholesale. For parliament and media the record lists are replaced; when the real file also carries
 * the model-output series (stance series, volume, narratives: Phase 3) they replace the sample series
 * and the layer is "real", otherwise the series stay sample and the layer is "facts_only". When the real
 * file carries an `analysis` block (Phase 4) it replaces the sample analysis and the layer is "real".
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
  sample.text_model = null;
  if (parliament && cov.parliament_available) {
    const coded = Array.isArray(parliament.stance_series);
    sample.parliament = { ...sample.parliament, documents: parliament.documents, ...(coded ? { stance_series: parliament.stance_series! } : {}) };
    sample.freshness = { ...sample.freshness, parliament: parliament.freshness };
    sample.layers.parliament = coded ? "real" : "facts_only";
    if (coded) sample.text_model = parliament.text_model ?? null;
  }
  if (media && cov.media_available) {
    const coded = Array.isArray(media.volume);
    sample.media = { ...sample.media, articles: media.articles, ...(coded ? { volume: media.volume!, narratives: media.narratives ?? [] } : {}) };
    sample.freshness = { ...sample.freshness, media: media.freshness };
    sample.layers.media = coded ? "real" : "facts_only";
    if (coded) {
      sample.text_model = sample.text_model ?? media.text_model ?? null;
      sample.media_volume_basis = media.volume_basis;
    }
  }
  if (real?.analysis) {
    const a = real.analysis;
    sample.analysis = { components: a.components, say_do_gap: a.say_do_gap, flags: a.flags, key_events: [], index: a.index, concentration: a.concentration, network: a.network, event_effects: a.event_effects ?? [], quant_model: a.quant_model };
    if (real.freshness.analysis) sample.freshness = { ...sample.freshness, analysis: real.freshness.analysis };
    sample.layers.analysis = "real";
  }
  if (real?.forecast) {
    const f = real.forecast;
    sample.forecast = { series: f.series, scenarios: f.scenarios, model_status: f.model_status, horizon_year: f.horizon_year, models: f.models, label: f.label };
    if (real.freshness.forecast) sample.freshness = { ...sample.freshness, forecast: real.freshness.forecast };
    sample.layers.forecast = "real";
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

/** Phase 4 method summary for the methodology page (absent until the quant step has run). */
export async function loadQuant(): Promise<QuantFile | null> {
  try {
    return await getJSON<QuantFile>(`${REAL}/quant.json`);
  } catch {
    return null;
  }
}

/** Validation metrics for the methodology page (absent until the text workflow has run). */
export async function loadValidation(): Promise<ValidationFile | null> {
  try {
    return await getJSON<ValidationFile>(`${REAL}/validation.json`);
  } catch {
    return null;
  }
}
