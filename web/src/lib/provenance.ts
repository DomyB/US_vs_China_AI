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
  index: { title: "Influence index", layer: "model", tables: ["index", "index_component"], sources: ["un_comtrade", "aiddata_gcdf", "dfc_projects", "wb_ids", "wb_wdi", "unga_votes"], lastYearKeys: ["trade", "finance_CN", "finance_US", "debt_CN", "unga", "stance"], glossary: ["influence_index", "net_lean", "winsorised", "dirichlet_draws"] },
  concentration: { title: "Export concentration", layer: "facts", tables: ["concentration", "trade_flow"], sources: ["un_comtrade"], lastYearKeys: ["trade"], glossary: ["export_share", "rca"] },
  governance: { title: "Governance and alignment indicators", layer: "facts", tables: ["governance"], sources: ["wb_wgi", "wb_wdi", "vdem", "idb_dpi", "unga_votes"], lastYearKeys: ["unga", "gdp"], glossary: ["reliability_rating"] },
  interpretation: { title: "Interpretation", layer: "interpretation", tables: ["interpretation"], glossary: ["evidence_level"] },
  forecast_index: { title: "Influence index to 2030", layer: "model", tables: ["forecast", "index"], sources: ["un_comtrade", "aiddata_gcdf", "dfc_projects", "wb_ids", "wb_wdi", "unga_votes"], lastYearKeys: ["trade", "finance_CN", "finance_US"], glossary: ["crps", "coverage_80", "influence_index"] },
  forecast_share: { title: "Share of mineral exports to each actor, to 2030", layer: "model", tables: ["forecast", "trade_flow"], sources: ["un_comtrade"], lastYearKeys: ["trade"], glossary: ["crps", "coverage_80", "export_share"] },
  scenarios: { title: "Scenarios", layer: "model", tables: ["forecast"], sources: ["un_comtrade"], glossary: ["crps"], caveat: "Scenarios are Monte Carlo paths of the published model with a stated yearly shift: what-ifs, not forecasts." },
  stance: { title: "Legislative stance over time", layer: "model", tables: ["document", "doc_classification"], glossary: ["zero_shot", "evidence_level"], lastYearKeys: ["stance"] },
  records: { title: "Legislative records", layer: "facts", tables: ["document", "vote"], glossary: ["reliability_rating"] },
  statements: { title: "Coded political statements", layer: "facts", tables: ["statement"], sources: ["manual_statements"], glossary: ["reliability_rating", "hedging_balance"], status: "the dataset's own coding; inter-coder agreement not yet measured" },
  press: { title: "Press coverage", layer: "facts", tables: ["media_volume", "document"], sources: ["gdelt"], glossary: ["zero_shot"] },
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
