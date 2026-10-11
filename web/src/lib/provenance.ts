import type { EvidenceLevel, RealMeta } from "@/lib/types";

/** The three layers every exhibit belongs to; the names and glyphs are the ones the ribbons and the drawer print. */
export type ProvLayer = "facts" | "model" | "interpretation";

export const LAYER_NAME: Record<ProvLayer, string> = { facts: "Facts", model: "Model output", interpretation: "Interpretation" };
export const LAYER_GLYPH: Record<ProvLayer, string> = { facts: "■", model: "◆", interpretation: "◇" };
export const LAYER_DEFINITION: Record<ProvLayer, string> = {
  facts: "Records as the sources report them; every figure keeps its source and the source its reliability rating.",
  model: "Computed by a published method; the method, its version and its validation status are named here.",
  interpretation: "A reading of the records. It can be wrong, and it says how.",
};

/** What an exhibit rests on: the drawer prints every field that is present and nothing it has to invent. */
export interface Provenance {
  /** the exhibit's title */
  title: string;
  layer: ProvLayer;
  /** warehouse tables, as the pipeline names them (trade_flow, finance_event, statement, …) */
  tables?: string[];
  /** row and indicator ids as the exports name them */
  ids?: string[];
  /** source ids from the registry (web/public/data/sources.json) */
  sources?: string[];
  /** last year each input covers, label → year (null = none) */
  lastYear?: Record<string, number | null>;
  model?: { name: string; version?: string; status?: string; validation?: string; backtest?: string };
  /** a record status the exhibit carries ("draft event, not yet reviewed", "framework, no drawn amount") */
  status?: string;
  evidence?: { level: EvidenceLevel; basis: string };
  /** why it could be wrong */
  caveat?: string;
  /** insights finding id or rule id; enables "Argue with this reading" */
  findingId?: string;
  explore?: { href: string; label?: string };
  /** glossary term ids (lib/glossary.ts) the exhibit uses */
  glossary?: string[];
  /** id of the exhibit element, for "Copy link" */
  anchor?: string;
}

/** Where each table is explained on the methods page. */
export const TABLE_ANCHORS: Record<string, string> = {
  trade_flow: "flows",
  finance_event: "flows",
  contract: "flows",
  price: "flows",
  statement: "statements",
  document: "text",
  policy_document: "text",
  media_volume: "text",
  doc_classification: "text",
  vote: "index",
  vote_member: "index",
  governance: "index",
  index: "index",
  influence_index: "index",
  index_component: "index",
  production: "concentration",
  concentration: "concentration",
  forecast: "forecasting",
  flag: "flags",
  say_do: "flags",
  event: "events",
  event_effect: "events",
  regression: "events",
  network: "networks",
  insights: "insights",
  finding: "insights",
  interpretation: "writing",
  coverage: "missing",
};

export function tableHref(table: string): string {
  const anchor = TABLE_ANCHORS[table];
  return anchor ? `/methodology#${anchor}` : "/methodology";
}

/** Human labels for the pipeline's last_year keys (meta.quant_model.last_year). */
export const LAST_YEAR_LABEL: Record<string, string> = {
  trade: "Trade (UN Comtrade)",
  finance_CN: "Chinese finance (AidData)",
  finance_US: "US finance (DFC and EXIM)",
  stance: "Legislative stance (text model)",
  unga: "UN General Assembly votes",
  debt_CN: "Debt to China (World Bank IDS)",
  gdp: "GDP (World Bank WDI)",
};

/** The last year of each input the index uses, from the real metadata; only the keys asked for, in that order. */
export function lastYearsFrom(meta: RealMeta | null | undefined, keys?: string[]): Record<string, number | null> | undefined {
  const ly = meta?.quant_model?.last_year as Record<string, number | null> | undefined;
  if (!ly) return undefined;
  const out: Record<string, number | null> = {};
  for (const k of keys ?? Object.keys(ly)) {
    if (k in ly) out[LAST_YEAR_LABEL[k] ?? k] = ly[k];
  }
  return Object.keys(out).length ? out : undefined;
}

/** The GitHub issue a reader opens to argue with a reading: the finding id in the title, the exhibit and page in the body. */
export function argueHref(p: Pick<Provenance, "title" | "findingId">, pageUrl: string): string {
  const title = `Reading: ${p.findingId ?? p.title}`;
  const body = `Exhibit: ${p.title}\nPage: ${pageUrl}\n\nWhat I think is wrong:\n`;
  return `https://github.com/DomyB/US_vs_China_AI/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
}

export type ProvKind = "trade" | "finance" | "production" | "contracts" | "index" | "concentration" | "governance" | "interpretation" | "forecast_index" | "forecast_share" | "scenarios" | "stance" | "records" | "statements" | "press";

export interface ProvContext {
  iso3?: string;
  year?: number;
  title?: string;
  meta?: RealMeta | null;
  model?: Provenance["model"];
  status?: string;
  ids?: string[];
  findingId?: string;
}

const KINDS: Record<ProvKind, Omit<Provenance, "title"> & { title: string; lastYearKeys?: string[] }> = {
  trade: { title: "Mineral exports by destination", layer: "facts", tables: ["trade_flow"], sources: ["un_comtrade"], lastYearKeys: ["trade"], glossary: ["export_share", "partners_absent", "reliability_rating"] },
  finance: { title: "Deals, loans, investments and agreements", layer: "facts", tables: ["finance_event"], sources: ["aiddata_gcdf", "dfc_projects", "exim_authorizations"], lastYearKeys: ["finance_CN", "finance_US"], glossary: ["documented", "lower_confidence", "swap_drawdown", "status"] },
  production: { title: "Production and reserves", layer: "facts", tables: ["production"], sources: ["usgs_mcs", "bgs_wms"], glossary: ["reliability_rating"] },
  contracts: { title: "Published contracts", layer: "facts", tables: ["contract"], sources: ["resourcecontracts"], glossary: ["reliability_rating"] },
  index: { title: "Composite influence index", layer: "model", tables: ["index", "index_component"], sources: ["un_comtrade", "aiddata_gcdf", "dfc_projects", "exim_authorizations", "wb_ids", "wb_wdi", "unga_votes"], lastYearKeys: ["trade", "finance_CN", "finance_US", "debt_CN", "unga", "stance"], glossary: ["influence_index", "economic_ties", "political_alignment", "net_lean", "winsorised", "dirichlet_draws"] },
  concentration: { title: "Export concentration", layer: "facts", tables: ["concentration", "trade_flow"], sources: ["un_comtrade"], lastYearKeys: ["trade"], glossary: ["export_share", "rca"] },
  governance: { title: "Governance and alignment indicators", layer: "facts", tables: ["governance"], sources: ["wb_wgi", "wb_wdi", "vdem", "idb_dpi", "unga_votes"], lastYearKeys: ["unga", "gdp"], glossary: ["reliability_rating"] },
  interpretation: { title: "Interpretation", layer: "interpretation", tables: ["interpretation"], glossary: ["evidence_level"] },
  forecast_index: { title: "Composite influence index to 2030", layer: "model", tables: ["forecast", "index"], sources: ["un_comtrade", "aiddata_gcdf", "dfc_projects", "exim_authorizations", "wb_ids", "wb_wdi", "unga_votes"], lastYearKeys: ["trade", "finance_CN", "finance_US"], glossary: ["crps", "coverage_80", "influence_index"] },
  forecast_share: { title: "Share of mineral exports to each actor, to 2030", layer: "model", tables: ["forecast", "trade_flow"], sources: ["un_comtrade"], lastYearKeys: ["trade"], glossary: ["crps", "coverage_80", "export_share"] },
  scenarios: { title: "Scenarios", layer: "model", tables: ["forecast"], sources: ["un_comtrade"], glossary: ["crps"], caveat: "Scenarios are Monte Carlo paths of the published model with a stated yearly shift: what-ifs, not forecasts." },
  stance: { title: "Legislative stance over time", layer: "model", tables: ["document", "doc_classification"], glossary: ["zero_shot", "evidence_level"], lastYearKeys: ["stance"] },
  records: { title: "Legislative records", layer: "facts", tables: ["document", "vote"], glossary: ["reliability_rating"] },
  statements: { title: "Coded political statements", layer: "facts", tables: ["statement"], sources: ["manual_statements"], glossary: ["reliability_rating", "hedging_balance"], status: "the dataset's own coding; inter-coder agreement not yet measured" },
  press: { title: "Press coverage", layer: "facts", tables: ["media_volume", "document"], sources: ["mediacloud", "gdelt"], glossary: ["zero_shot", "reliability_rating"], caveat: "Counts are of what each source indexes, not of all press: Media Cloud counts its per-country collection by month, GDELT its half-month windows, a feed the items it carried on the fetch day. The windows differ by source and the series are not added together." },
};

/** The provenance of one of the recurring exhibits (case-file tabs, the Lab), from the data the caller has at hand. */
export function provenanceFor(kind: ProvKind, ctx: ProvContext = {}): Provenance {
  const k = KINDS[kind];
  const { lastYearKeys, ...base } = k;
  const title = ctx.title ?? (ctx.year && ["trade", "finance", "production", "concentration", "governance", "records"].includes(kind) ? `${k.title} in ${ctx.year}` : k.title);
  const ids = ctx.ids ?? (ctx.iso3 ? k.tables?.map((t) => `${t}:${ctx.iso3}${ctx.year ? `:${ctx.year}` : ""}`) : undefined);
  return {
    ...base,
    title,
    ids,
    lastYear: lastYearKeys ? lastYearsFrom(ctx.meta, lastYearKeys) : undefined,
    model: ctx.model ?? base.model,
    status: ctx.status ?? base.status,
    findingId: ctx.findingId,
    explore: kind === "trade" && ctx.iso3 ? { href: `/explore?view=trade&country=${ctx.iso3}${ctx.year ? `&year=${ctx.year}` : ""}`, label: "Open the trade arcs" }
      : kind === "finance" && ctx.iso3 ? { href: `/explore?view=money&country=${ctx.iso3}${ctx.year ? `&year=${ctx.year}` : ""}`, label: "Open the money arcs" }
      : kind === "index" && ctx.iso3 ? { href: `/explore?view=index&country=${ctx.iso3}${ctx.year ? `&year=${ctx.year}` : ""}`, label: "Open the map" }
      : kind.startsWith("forecast") || kind === "scenarios" ? { href: `/lab${ctx.iso3 ? `?country=${ctx.iso3}` : ""}`, label: "Move the levers in the Lab" }
      : undefined,
  };
}

/** One forecast target's backtest summary and fitting windows, as meta.json's `quant_model.forecast.targets` carries them. */
interface ForecastTargetMeta {
  label?: string;
  crps?: number;
  crps_naive?: number;
  coverage_80?: number;
  n_tests?: number;
  origins?: string;
  windows?: Record<string, { years?: [number, number]; n_obs?: number }>;
}

/**
 * How long the forecast's series are, from the fitting windows the export carries: the longest series over every target
 * and country, with its first and last year, and the backtest origins. Null when the metadata has no windows, so a caveat
 * never types a length the export did not give.
 */
export function forecastSeriesSpan(meta: RealMeta | null | undefined): { maxObs: number; from: number; to: number; origins: string | null } | null {
  const targets = (meta?.quant_model as { forecast?: { targets?: Record<string, ForecastTargetMeta> } } | undefined)?.forecast?.targets;
  if (!targets) return null;
  let maxObs = 0;
  let from = Infinity;
  let to = -Infinity;
  let origins: string | null = null;
  for (const t of Object.values(targets)) {
    origins ??= t.origins ?? null;
    for (const w of Object.values(t.windows ?? {})) {
      if (typeof w.n_obs === "number") maxObs = Math.max(maxObs, w.n_obs);
      if (w.years) {
        from = Math.min(from, w.years[0]);
        to = Math.max(to, w.years[1]);
      }
    }
  }
  if (maxObs === 0 || !Number.isFinite(from) || !Number.isFinite(to)) return null;
  return { maxObs, from, to, origins };
}

/** The provenance of each Lab block, by block id. Every length, year or count in a caveat comes from the metadata or is left out. */
export function labProvenance(id: string, meta?: RealMeta | null): Provenance | undefined {
  const fc = (meta?.quant_model as { forecast?: { targets?: Record<string, ForecastTargetMeta> } } | undefined)?.forecast?.targets;
  const share = fc?.["export_share:CN"];
  const backtest = share ? `share to China: ${share.label ?? "published model"}, CRPS ${share.crps} vs ${share.crps_naive} for persistence, 80% band covered ${Math.round((share.coverage_80 ?? 0) * 100)}% of ${share.n_tests} backtests` : undefined;
  const span = forecastSeriesSpan(meta);
  const horizonCaveat = `A five-year horizon on ${span ? `at most ${span.maxObs} annual observations (${span.from}–${span.to})` : "short annual series"}: the bands are wide and the share forecasts under-cover in the backtests.`;
  // where the Chinese finance record ends, from the run's own last years (never a typed year)
  const cnEnds = (meta?.quant_model?.last_year as Record<string, number | null> | undefined)?.finance_CN ?? null;
  const cnEndsClause = cnEnds !== null ? `the Chinese record ends in ${cnEnds}` : "the Chinese record ends with its source";
  const blocks: Record<string, Provenance> = {
    board: { title: "Where will the minerals go in 2030?", layer: "model", tables: ["forecast", "trade_flow"], sources: ["un_comtrade"], lastYear: lastYearsFrom(meta, ["trade"]), model: { name: "published forecast per country and target", backtest }, caveat: horizonCaveat, glossary: ["crps", "coverage_80", "export_share"], explore: { href: "/#c7", label: "Read chapter 7" } },
    studio: { title: "Scenario studio", layer: "model", tables: ["forecast", "trade_flow", "finance_event", "index"], sources: ["un_comtrade", "aiddata_gcdf", "dfc_projects", "exim_authorizations", "wb_pink_sheet"], model: { name: "arithmetic on published numbers, in the browser", validation: "a what-if, never stored, never a forecast" }, caveat: "Every lever is a stated shift of a published path; the index what-if applies the published formula to the reader's numbers.", glossary: ["parity", "influence_index", "implied_volume"] },
    words: { title: "Words and money", layer: "facts", tables: ["statement", "trade_flow"], sources: ["manual_statements", "un_comtrade"], lastYear: lastYearsFrom(meta, ["trade", "stance"]), status: "the statements dataset's own coding; inter-coder agreement not yet measured", glossary: ["hedging_balance", "say_do_gap", "export_share"], explore: { href: "/#c5", label: "Read chapter 5" } },
    ledger: { title: "Who talks, who pays", layer: "facts", tables: ["statement", "finance_event"], sources: ["manual_statements", "aiddata_gcdf", "dfc_projects", "exim_authorizations"], lastYear: lastYearsFrom(meta, ["finance_CN", "finance_US"]), caveat: `The money ratio runs on the years both finance records cover, because ${cnEndsClause}; the US record runs on.`, findingId: "who_talks_who_pays", glossary: ["documented", "reliability_rating"], explore: { href: "/#c1", label: "Read chapter 1" } },
    minerals: { title: "Talk and trade by mineral", layer: "facts", tables: ["statement", "trade_flow"], sources: ["manual_statements", "un_comtrade"], lastYear: lastYearsFrom(meta, ["trade"]), glossary: ["export_share", "partners_absent"], explore: { href: "/#c2", label: "Read chapter 2" } },
    parity: { title: "What it would take", layer: "facts", tables: ["trade_flow"], sources: ["un_comtrade"], lastYear: lastYearsFrom(meta, ["trade"]), status: "arithmetic at constant totals", caveat: "Redirected exports need buyers, smelters, ships and contracts the arithmetic ignores.", glossary: ["parity"], explore: { href: "/#c7", label: "Read chapter 7" } },
    shocks: { title: "After the shock", layer: "model", tables: ["event", "event_effect", "trade_flow"], sources: ["un_comtrade"], model: { name: "event windows: two years after against two years before, with a placebo over the other years", status: "every event is a draft until the project owner reviews it" }, caveat: "Associations on annual data for twelve countries; no causal language.", glossary: ["placebo_p", "diff_in_diff", "draft_event"], explore: { href: "/#c4", label: "Read chapter 4" } },
    // the panel's size and span are the regression rows' own (InsightsView overrides this caveat with them); the default names no number
    panel: { title: "What the panel says", layer: "model", tables: ["regression", "trade_flow", "finance_event", "governance"], sources: ["un_comtrade", "aiddata_gcdf", "dfc_projects", "exim_authorizations", "wb_wdi", "vdem", "unga_votes"], model: { name: "two-way fixed-effects panel, country and year effects, wild-cluster bootstrap" }, caveat: "A small country panel on annual data: an association, not a cause.", glossary: ["wild_cluster_p", "winsorised"], explore: { href: "/#c4", label: "Read chapter 4" } },
    attention: { title: "Attention and money", layer: "facts", tables: ["policy_document", "statement", "finance_event"], sources: ["congress_gov", "federal_register", "manual_statements", "dfc_projects", "exim_authorizations", "aiddata_gcdf"], lastYear: lastYearsFrom(meta, ["finance_CN", "finance_US"]), caveat: `A bill is not a dollar; ${cnEndsClause}.`, glossary: ["documented"], explore: { href: "/#c1", label: "Read chapter 1" } },
    findings: { title: "Findings", layer: "interpretation", tables: ["finding", "insights"], findingId: "findings", caveat: "Template sentences that fire only when their inputs exist; read the evidence meter before quoting a headline.", glossary: ["evidence_level"] },
    reading: { title: "Reading and outlook", layer: "interpretation", tables: ["interpretation"], findingId: "insights.md", status: "AI-drafted from the indicators until the project owner reviews it", glossary: ["evidence_level"] },
  };
  return blocks[id];
}
