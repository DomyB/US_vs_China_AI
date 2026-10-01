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

export type LayerSource = "real" | "sample" | "none";

export interface CountryCoverage {
  trade_years: number[];
  mirror_years: number[];
  events: number;
  contracts: number;
  governance: number;
  production: number;
  actions: boolean;
  governance_available: boolean;
}

export interface RealMeta {
  dataset: "REAL";
  generated_on: string;
  generated_at: string;
  sources_ok: string[];
  ingest_runs: { source_id: string; status: string; finished_at: string; rows: string; error: string | null }[];
  tables: Record<string, number>;
  layers: Record<string, "real" | "sample">;
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

export interface ParliamentDoc {
  id: string;
  date: string;
  chamber: string;
  type: string;
  title_original: string;
  language: string;
  title_en: string;
  stance_us: number;
  stance_cn: number;
  topic_minerals: string[];
  vote: { yes: number; no: number; abstain: number } | null;
  url: string;
  source: SourceRef;
}

export interface StanceRow {
  year: number;
  stance_us_mean: number;
  stance_cn_mean: number;
  n_docs: number;
}

export interface MediaVolumeRow {
  year: number;
  articles_us: number;
  articles_cn: number;
  total_articles: number;
  tone_us: number;
  tone_cn: number;
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
  headline_en: string;
  url: string;
  stance_us: number;
  stance_cn: number;
  tone: number;
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
