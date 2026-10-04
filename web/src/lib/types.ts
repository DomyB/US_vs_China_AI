export type Actor = "US" | "CN";
export type ActorMode = "US" | "CN" | "both";
export type Reliability = "official" | "independent_academic" | "partisan" | "state_media" | "analysis";

export interface SourceRef {
  id: string;
  name: string;
  url: string;
  reliability: Reliability;
  sample?: boolean;
}

export interface Freshness {
  last_updated: string;
  source_ids: string[];
  schedule: string;
}

export interface CountryMeta {
  iso3: string;
  name: string;
  lat: number;
  lon: number;
  in_scope: boolean;
  eiti_member: boolean;
  note: string;
}

export interface MineralMeta {
  id: string;
  name: string;
  core: boolean;
}

export interface Meta {
  dataset: string;
  generated_on: string;
  seed?: number;
  years: number[];
  actors: Actor[];
  minerals: MineralMeta[];
  countries: CountryMeta[];
  refresh_schedule: { layer: string; cadence: string; note?: string }[];
  freshness: Record<"actions" | "parliament" | "media" | "analysis" | "forecast", Freshness>;
}

export interface IndexRow {
  iso3: string;
  year: number;
  actor: Actor;
  mineral: string;
  value: number;
  lower: number;
  upper: number;
}

export interface IndexFile {
  dataset: string;
  method: string;
  rows: IndexRow[];
}

export interface ActionEvent {
  id: string;
  date: string;
  year: number;
  type: string;
  actor_side: "US" | "CN" | "other";
  actors: string[];
  mineral: string;
  amount_musd: number | null;
  description: string;
  source: SourceRef;
  confidence: "documented" | "strongly_indicated" | "speculative";
  sector?: string | null;
  also_reported_by?: string[];
  date_precision?: "day" | "month" | "year";
}

export interface TradeRow {
  year: number;
  mineral: string;
  exports_musd: { CN: number | null; US: number | null; ROW: number | null };
  mirror_musd?: { CN: number | null; US: number | null };
  value_type: string;
  source: SourceRef | null;
  sources?: { reported?: SourceRef; mirror?: SourceRef };
}

export interface ContractRow {
  id: string;
  title: string;
  resource: string | null;
  mineral: string | null;
  companies: string | null;
  year: number | null;
  type: string | null;
  language: string | null;
  source: SourceRef;
}

export interface ProductionRow {
  mineral: string;
  measure: "production" | "reserves";
  year: number;
  qty: number | null;
  unit: string;
  note: string | null;
  source: SourceRef;
}

export interface GovernanceRow {
  year: number;
  indicator: string;
  name: string;
  value: number | null;
  source: SourceRef;
}

export interface TradeDiscrepancy {
  reporter: string;
  partner: string;
  hs6: string;
  mineral: string;
  year: number;
  flow: string;
  reported_usd: number | null;
  mirror_usd: number | null;
  ratio: number | null;
  flag: string;
}

/** "facts_only": real records are shown while the layer's model outputs (stance, tone) remain sample;
 *  "real": records plus labelled model outputs (see TextModelStatus for whether they are validated). */
export type LayerSource = "real" | "sample" | "none" | "facts_only";

/** How the text classifier that produced stance and tone values stands (exported in meta.json and per layer file). */
export interface TextModelStatus {
  method: "zero_shot" | "trained" | "human" | null;
  model: string | null;
  codebook_version: string | null;
  run_id: string | null;
  validated: boolean;
  kappa_stance_pooled: number | null;
  alpha_stance_pooled: number | null;
  macro_f1_held_out: number | null;
  beats_baseline: boolean | null;
  n_coded: number;
  n_total: number;
  n_classified: number;
  label: string | null;
}

export interface ClassifierRef {
  method: "zero_shot" | "trained" | "human";
  model: string;
  codebook_version: string;
  confidence: number | null;
  tone_model?: string | null;
}

export interface TranslationRef {
  method: "mt" | "llm" | "human" | "none";
  model: string | null;
}

/** web/public/data/real/validation.json: what the methodology page shows. */
export interface ValidationFile {
  generated_on: string;
  codebook_version: string | null;
  status: "not_yet_measured" | "measured";
  sample: { n: number; by_coder: Record<string, number> };
  agreement: Record<string, Record<string, { value: number | null; n: number }>>;
  models: Record<string, Record<string, Record<string, Record<string, Record<string, { value: number | null; n: number }>>>>>;
  selected_method: string | null;
  beats_baseline: boolean | null;
  text_model: TextModelStatus;
}

export interface CountryCoverage {
  trade_years: number[];
  mirror_years: number[];
  events: number;
  contracts: number;
  governance: number;
  production: number;
  actions: boolean;
  governance_available: boolean;
  parliament_available?: boolean;
  parliament_documents?: number;
  parliament_votes?: number;
  parliament_from?: number | null;
  parliament_note?: string | null;
  media_available?: boolean;
  media_articles?: number;
  media_from?: number | null;
  concessions?: number;
  parliament_classified?: number;
  parliament_translated?: number;
  media_classified?: number;
  narratives_available?: boolean;
}

export interface RealMeta {
  dataset: "REAL";
  generated_on: string;
  generated_at: string;
  sources_ok: string[];
  ingest_runs: { source_id: string; status: string; finished_at: string; rows: string; error: string | null }[];
  tables: Record<string, number>;
  layers: Record<string, string>;
  text_model?: TextModelStatus;
  coverage: Record<string, CountryCoverage>;
}

export interface RealCountryData {
  dataset: "REAL";
  iso3: string;
  name: string;
  generated_on: string;
  freshness: { actions: Freshness; governance: Freshness };
  actions: { events: ActionEvent[]; trade: TradeRow[]; contracts: ContractRow[]; production: ProductionRow[] };
  governance: GovernanceRow[];
  trade_discrepancies: TradeDiscrepancy[];
}

/** web/public/data/real/parliament/<ISO3>.json */
export interface RealParliamentFile {
  dataset: "REAL";
  iso3: string;
  generated_on: string;
  documents: ParliamentDoc[];
  freshness: Freshness;
  /** present once the text workflow has classified records (Phase 3) */
  stance_series?: StanceRow[];
  text_model?: TextModelStatus;
}

/** web/public/data/real/media/<ISO3>.json */
export interface RealMediaFile {
  dataset: "REAL";
  iso3: string;
  generated_on: string;
  articles: Article[];
  outlets: Record<string, { name: string; orientation: string | null; reliability: Reliability; paywall: string | null }>;
  freshness: Freshness;
  /** present once the text workflow has classified headlines (Phase 3) */
  volume?: MediaVolumeRow[];
  volume_basis?: "feed_totals" | "kept_headlines";
  narratives?: NarrativeRow[];
  text_model?: TextModelStatus;
}

export interface ParliamentDoc {
  id: string;
  date: string;
  chamber: string;
  type: string;
  title_original: string;
  language: string;
  title_en: string | null;
  translation?: TranslationRef | null;
  stance_us: number | null;
  stance_cn: number | null;
  classification?: "not_yet_classified" | "sample" | "coded";
  classifier?: ClassifierRef | null;
  date_precision?: "day" | "month" | "year" | "seen";
  summary?: string | null;
  status?: string | null;
  author?: string | null;
  mentions?: { us: boolean; cn: boolean };
  topic_minerals: string[];
  vote: { yes: number | null; no: number | null; abstain: number | null; result?: string | null; chamber?: string; date?: string; members_recorded?: number | null; n_votes?: number; url?: string | null } | null;
  url: string;
  source: SourceRef;
}

export interface StanceRow {
  year: number;
  /** null when no record applied to that actor in the year */
  stance_us_mean: number | null;
  stance_cn_mean: number | null;
  n_docs: number;
}

export interface MediaVolumeRow {
  year: number;
  articles_us: number;
  articles_cn: number;
  total_articles: number;
  tone_us: number | null;
  tone_cn: number | null;
}

export interface NarrativeRow {
  year: number;
  label: string;
  share: number;
}

export interface Article {
  id: string;
  date: string;
  outlet: string;
  headline_original: string;
  language: string;
  headline_en: string | null;
  translation?: TranslationRef | null;
  url: string;
  stance_us: number | null;
  stance_cn: number | null;
  tone: number | null;
  classification?: "not_yet_classified" | "sample" | "coded";
  classifier?: ClassifierRef | null;
  date_precision?: "day" | "month" | "year" | "seen";
  outlet_source_id?: string;
  orientation?: string | null;
  reliability?: Reliability;
  mentions?: { us: boolean; cn: boolean };
  via?: "rss" | "gdelt";
  also_reported_by?: string[];
  source?: SourceRef;
  topic_minerals: string[];
}

export interface ComponentRow {
  year: number;
  actor: Actor;
  components: { name: string; normalized_value: number; weight: number }[];
}

export interface SayDoRow {
  year: number;
  actor: Actor;
  rhetoric: number;
  action: number;
  gap: number;
}

export interface Flag {
  id: string;
  year: number;
  type: string;
  evidence_level: "documented" | "strongly_indicated" | "speculative";
  description: string;
  evidence: SourceRef[];
}

export interface ForecastRow {
  target: string;
  actor: Actor;
  year: number;
  point: number;
  p05: number;
  p25: number;
  p75: number;
  p95: number;
  model: string;
}

export interface Scenario {
  id: string;
  name: string;
  assumptions: string;
  description: string;
}

export interface CountryData {
  dataset: string;
  iso3: string;
  name: string;
  note: string;
  eiti_member: boolean;
  language: string;
  freshness: Meta["freshness"] & { governance?: Freshness };
  layers?: Record<"actions" | "governance" | "parliament" | "media" | "analysis" | "forecast", LayerSource>;
  /** why a legislature has no structured records (BOL, GUY, SUR, VEN), from the exporter */
  parliament_note?: string | null;
  /** status of the text classifier behind stance, tone and narratives (Phase 3); null while they are sample */
  text_model?: TextModelStatus | null;
  media_volume_basis?: "feed_totals" | "kept_headlines";
  actions: { events: ActionEvent[]; trade: TradeRow[]; contracts?: ContractRow[]; production?: ProductionRow[] };
  governance?: GovernanceRow[];
  trade_discrepancies?: TradeDiscrepancy[];
  parliament: { documents: ParliamentDoc[]; stance_series: StanceRow[] };
  media: { volume: MediaVolumeRow[]; narratives: NarrativeRow[]; articles: Article[] };
  analysis: {
    components: ComponentRow[];
    say_do_gap: SayDoRow[];
    flags: Flag[];
    key_events: { year: number; title: string; actor: Actor }[];
  };
  forecast: { series: ForecastRow[]; scenarios: Scenario[] };
}

export interface Project {
  id: string;
  name: string;
  iso3: string;
  mineral: string;
  type: "mine" | "plant" | "port";
  lat: number;
  lon: number;
  operator_origin: "CN" | "US" | "other";
  stage: string;
  start_year: number;
  note: string;
}

export interface MineralShareRow {
  year: number;
  mineral: string;
  share_cn: number;
  share_us: number;
  share_other: number;
}

export interface RegionData {
  dataset: string;
  projects: Project[];
  mineral_shares: MineralShareRow[];
}

export interface SourceEntry {
  id: string;
  name: string;
  url: string;
  api_url?: string;
  category: string;
  scope: string;
  countries?: string[];
  reliability: Reliability;
  orientation?: string;
  paywall?: string;
  license: string;
  access: string;
  auth?: string;
  update_frequency: string;
  refresh_schedule: string;
  coverage_from: number;
  coverage_to: number;
  language: string;
  status: "live" | "moved" | "dead" | "uncertain";
  verified_on?: string;
  verified_method?: string;
  python_package?: string;
  notes?: string;
  liveness?: { checked_at: string; status: number | null; ok: boolean; error: string | null; api_status: number | null; api_ok: boolean | null } | null;
}

export interface SourcesFile {
  generated_on: string;
  sources: SourceEntry[];
}
