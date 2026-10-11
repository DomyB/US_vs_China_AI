import { describe, expect, it } from "vitest";
import { parseTab } from "@/components/panel/CountryPanel";
import { releaseLine } from "@/components/panel/Interpretation";
import { mergeRealLayers, tradeByYear } from "@/lib/data";
import type { CountryCoverage, CountryData, RealCountryData, RealMediaFile, RealParliamentFile, TradeRow } from "@/lib/types";

const sample = () =>
  ({
    name: "Brazil",
    freshness: {},
    actions: { events: [], trade: [] },
    parliament: { documents: [{ id: "s1", date: "2020-01-01", stance_us: 1, stance_cn: -1 }], stance_series: [{ year: 2020, stance_us_mean: 0.4, stance_cn_mean: -0.2, n_docs: 3 }] },
    media: { volume: [{ year: 2020 }], narratives: [{ year: 2020, label: "x", share: 1 }], articles: [{ id: "a1" }] },
  }) as unknown as CountryData;

const cov: CountryCoverage = {
  trade_years: [], mirror_years: [], events: 0, contracts: 0, governance: 0, production: 0, actions: false, governance_available: false,
  parliament_available: true, parliament_documents: 1, parliament_votes: 1, parliament_from: 2024, parliament_note: null,
  media_available: true, media_articles: 1, media_from: 2026, concessions: 0,
};
const parliament = { dataset: "REAL", iso3: "BRA", generated_on: "2026-10-02", documents: [{ id: "r1", date: "2024-07-04", stance_us: null, stance_cn: null, title_en: null, topic_minerals: [], vote: null }], freshness: { last_updated: "2026-10-02", source_ids: ["bra_camara_api"], schedule: "monthly" } } as unknown as RealParliamentFile;
const media = { dataset: "REAL", iso3: "BRA", generated_on: "2026-10-02", articles: [{ id: "n1", date: "2026-10-01", tone: null }], outlets: {}, freshness: { last_updated: "2026-10-02", source_ids: ["bra_folha"], schedule: "weekly" } } as unknown as RealMediaFile;

describe("mergeRealLayers", () => {
  it("replaces only the record lists for parliament and media and marks them facts_only", () => {
    const out = mergeRealLayers(sample(), cov, null, parliament, media);
    expect(out.layers?.parliament).toBe("facts_only");
    expect(out.layers?.media).toBe("facts_only");
    expect(out.parliament.documents[0].id).toBe("r1");
    expect(out.parliament.stance_series[0].n_docs).toBe(3); // stance series stays sample
    expect(out.media.articles[0].id).toBe("n1");
    expect(out.media.narratives[0].label).toBe("x");
    expect(out.layers?.actions).toBe("sample");
    expect(out.freshness.parliament?.source_ids).toEqual(["bra_camara_api"]);
  });
  it("keeps everything sample and carries the note when a legislature has no structured records", () => {
    const out = mergeRealLayers(sample(), { ...cov, parliament_available: false, media_available: false, parliament_note: "PDF only" }, null, null, null);
    expect(out.layers?.parliament).toBe("sample");
    expect(out.parliament.documents[0].id).toBe("s1");
    expect(out.parliament_note).toBe("PDF only");
  });
  it("marks a layer real and replaces its series when the real file carries model outputs", () => {
    const status = { method: "zero_shot", model: "nli", codebook_version: "v1", run_id: "r", validated: false, kappa_stance_pooled: null, alpha_stance_pooled: null, macro_f1_held_out: null, beats_baseline: null, n_coded: 0, n_total: 2, n_classified: 2, label: "zero-shot baseline, not yet validated" } as const;
    const parlReal = { ...parliament, stance_series: [{ year: 2024, stance_us_mean: null, stance_cn_mean: 1, n_docs: 1 }], text_model: status } as unknown as RealParliamentFile;
    const mediaReal = { ...media, volume: [{ year: 2026, articles_us: 0, articles_cn: 1, total_articles: 40, tone_us: null, tone_cn: -0.3 }], volume_basis: "feed_totals", narratives: [], text_model: status } as unknown as RealMediaFile;
    const out = mergeRealLayers(sample(), cov, null, parlReal, mediaReal);
    expect(out.layers?.parliament).toBe("real");
    expect(out.layers?.media).toBe("real");
    expect(out.parliament.stance_series).toEqual([{ year: 2024, stance_us_mean: null, stance_cn_mean: 1, n_docs: 1 }]);
    expect(out.media.volume[0].total_articles).toBe(40);
    expect(out.media.narratives).toEqual([]);
    expect(out.media_volume_basis).toBe("feed_totals");
    expect(out.text_model?.method).toBe("zero_shot");
  });
  it("carries the monthly history and the yearly counts as facts while the media layer stays facts_only", () => {
    const history = [{ period: "2012-05", source_id: "mediacloud", items_total: 500, items_mining: 30, items_cn: 5, items_us: 8 }];
    const mediaCounted = { ...media, volume: [{ year: 2026, articles_us: 0, articles_cn: 1, total_articles: 40, tone_us: null, tone_cn: null }], volume_basis: "feed_totals", history, media_sources: ["bra_folha", "mediacloud"], history_from: "2012-05" } as unknown as RealMediaFile;
    const out = mergeRealLayers(sample(), cov, null, parliament, mediaCounted);
    expect(out.layers?.media).toBe("facts_only"); // no narratives: nothing is coded yet
    expect(out.media.volume[0].total_articles).toBe(40);
    expect(out.media_volume_basis).toBe("feed_totals");
    expect(out.media.history).toEqual(history);
    expect(out.media.media_sources).toEqual(["bra_folha", "mediacloud"]);
    expect(out.media.history_from).toBe("2012-05");
    expect(out.media.narratives[0].label).toBe("x"); // narratives stay sample
    expect(out.text_model).toBeNull();
    const older = mergeRealLayers(sample(), cov, null, parliament, media); // a file exported before the history view
    expect(older.media.history).toEqual([]);
    expect(older.media.history_from).toBeNull();
    expect(older.media.volume[0]).toEqual({ year: 2020 });
  });
  it("keeps facts_only when only one layer carries model outputs", () => {
    const parlReal = { ...parliament, stance_series: [], text_model: { method: "zero_shot", validated: false } } as unknown as RealParliamentFile;
    const out = mergeRealLayers(sample(), cov, null, parlReal, media);
    expect(out.layers?.parliament).toBe("real");
    expect(out.layers?.media).toBe("facts_only");
    expect(out.media.narratives[0].label).toBe("x");
  });
  it("replaces the analysis block and marks the layer real when the real country file carries one", () => {
    const quant = { status: "computed", method_version: "2026.10", weights_version: "2026.10.eq", run_id: "q", inputs_release: "data-v1", created_at: "2026-10-09T00:00:00+00:00", draws: 500, rank_stability: 0.7, text_model_label: "zero-shot baseline, not yet validated", last_year: {}, unattributed_finance_events: 1, label: "computed" } as const;
    const real = {
      dataset: "REAL", iso3: "BRA", name: "Brazil", generated_on: "2026-10-09",
      freshness: { actions: { last_updated: "2026-10-09", source_ids: ["un_comtrade"], schedule: "monthly" }, governance: { last_updated: "2026-10-09", source_ids: [], schedule: "annual" }, analysis: { last_updated: "2026-10-09", source_ids: ["un_comtrade", "aiddata_gcdf"], schedule: "monthly" } },
      actions: { events: [], trade: [], contracts: [], production: [] }, governance: [], trade_discrepancies: [],
      analysis: { index: [{ year: 2023, actor: "CN", index_name: "influence", value: 32.3, lower: 26.2, upper: 54.4, n_components: 5, components_available: ["trade_export_share"] }], components: [{ year: 2023, actor: "CN", components: [{ name: "trade_export_share", normalized_value: 50, weight: 0.1667, available: true, note: null, source_ids: ["un_comtrade"] }] }], say_do_gap: [], flags: [], concentration: [], network: { nodes: [], edges: [], n_nodes_total: 0, n_edges_total: 0, unattributed_events: 0 }, quant_model: quant },
    } as unknown as RealCountryData;
    const s = sample();
    s.analysis = { components: [{ year: 2023, actor: "US", components: [] }], say_do_gap: [], flags: [{ id: "f" }], key_events: [] } as unknown as CountryData["analysis"];
    const out = mergeRealLayers(s, { ...cov, actions: true }, real, null, null);
    expect(out.layers?.analysis).toBe("real");
    expect(out.analysis.index?.[0].value).toBe(32.3);
    expect(out.analysis.flags).toEqual([]);
    expect(out.analysis.quant_model?.status).toBe("computed");
    expect(out.freshness.analysis?.source_ids).toEqual(["un_comtrade", "aiddata_gcdf"]);
  });
  it("replaces the forecast block and marks the layer real when the real country file carries one", () => {
    const real = {
      dataset: "REAL", freshness: { actions: { last_updated: "x", source_ids: [], schedule: "m" }, forecast: { last_updated: "2026-10-09", source_ids: ["un_comtrade"], schedule: "monthly" } },
      actions: { events: [], trade: [], contracts: [], production: [] }, governance: [], trade_discrepancies: [],
      forecast: { series: [{ target: "export_share", actor: "CN", year: 2026, point: 0.48, p05: 0.43, p25: 0.45, p75: 0.52, p95: 0.62, model: "drift", scenario_id: "baseline", last_observed_year: 2025 }], scenarios: [{ id: "baseline", name: "Baseline", assumptions: "a", description: "d" }], model_status: { "export_share:CN": { countries: ["CHL"], model: "drift", beats_naive: true } }, horizon_year: 2030, n_sims: 2000, models: { drift: "random walk with drift" }, label: "Computed" },
    } as unknown as RealCountryData;
    const s = sample();
    s.forecast = { series: [{ target: "influence_index", actor: "US", year: 2026, point: 1, p05: 0, p25: 0, p75: 2, p95: 3, model: "SAMPLE" }], scenarios: [] };
    const out = mergeRealLayers(s, { ...cov, actions: true }, real, null, null);
    expect(out.layers?.forecast).toBe("real");
    expect(out.forecast.series[0].model).toBe("drift");
    expect(out.forecast.model_status?.["export_share:CN"].beats_naive).toBe(true);
    expect(out.freshness.forecast?.source_ids).toEqual(["un_comtrade"]);
  });
  it("attaches the interpretation block and names the layer by whether the owner's text exists", () => {
    const gen = [{ section: "trade", title: "Trade", sentences: [{ text: "In 2025, 48% went to China.", ids: ["concentration:share_cn_x:all:2025"] }], indicators: ["concentration:share_cn_x:all:2025"], changed_since_previous: true, previous_date: null }];
    const base = { dataset: "REAL", freshness: { actions: { last_updated: "x", source_ids: [], schedule: "m" } }, actions: { events: [], trade: [], contracts: [], production: [] }, governance: [], trade_discrepancies: [] };
    const generatedOnly = { ...base, interpretation: { generated: gen, human: null, template_version: "2026.10", generated_on: "2026-10-09", label: "l" } } as unknown as RealCountryData;
    const out1 = mergeRealLayers(sample(), { ...cov, actions: true }, generatedOnly, null, null);
    expect(out1.layers?.interpretation).toBe("generated");
    expect(out1.interpretation?.generated[0].sentences[0].ids).toEqual(["concentration:share_cn_x:all:2025"]);
    const withHuman = { ...base, interpretation: { generated: gen, human: { title: "t", author: "owner", date: "2026-10-10", reviewed: true, text_md: "My reading." }, template_version: "2026.10", generated_on: "2026-10-09", label: "l" } } as unknown as RealCountryData;
    const out2 = mergeRealLayers(sample(), { ...cov, actions: true }, withHuman, null, null);
    expect(out2.layers?.interpretation).toBe("generated+human");
    expect(out2.interpretation?.human?.text_md).toBe("My reading.");
    const none = mergeRealLayers(sample(), { ...cov, actions: true }, base as unknown as RealCountryData, null, null);
    expect(none.layers?.interpretation).toBe("sample");
  });
  it("keeps the analysis sample when the real country file has no analysis block", () => {
    const real = { dataset: "REAL", freshness: { actions: { last_updated: "x", source_ids: [], schedule: "m" } }, actions: { events: [], trade: [], contracts: [], production: [] }, governance: [], trade_discrepancies: [] } as unknown as RealCountryData;
    const s = sample();
    s.analysis = { components: [], say_do_gap: [], flags: [{ id: "f" }], key_events: [] } as unknown as CountryData["analysis"];
    const out = mergeRealLayers(s, { ...cov, actions: true }, real, null, null);
    expect(out.layers?.analysis).toBe("sample");
    expect(out.analysis.flags[0].id).toBe("f");
  });
  it("returns the sample untouched without coverage", () => {
    const out = mergeRealLayers(sample(), undefined, null, null, null);
    expect(out.layers?.parliament).toBe("sample");
    expect(out.parliament_note).toBeUndefined();
    expect(out.text_model).toBeUndefined();
  });
  it("carries the statements block when the real file has one and says none otherwise", () => {
    const stm = { records: [], n: 0, n_domestic: 0, stance_by_year: [], by_bloc: [], coding: "dataset codebook", dataset_source: { id: "manual_statements", name: "x", url: "u", reliability: "analysis" as const } };
    const real = { actions: { events: [], trade: [], contracts: [], production: [] }, freshness: { actions: { last_updated: "d", source_ids: [], schedule: "m" }, governance: { last_updated: "d", source_ids: [], schedule: "a" } }, governance: [], trade_discrepancies: [], statements: stm } as unknown as RealCountryData;
    const out = mergeRealLayers(sample(), cov, real, null, null);
    expect(out.layers?.statements).toBe("real");
    expect(out.statements?.dataset_source.id).toBe("manual_statements");
    const none = mergeRealLayers(sample(), cov, null, null, null);
    expect(none.layers?.statements).toBe("none");
    expect(none.statements).toBeNull();
  });
});

const tradeRow = (year: number, mineral: string, cells: { CN: number | null; US: number | null; ROW: number | null }, mirror?: { CN: number | null; US: number | null }): TradeRow =>
  ({ year, mineral, exports_musd: cells, mirror_musd: mirror, value_type: "reported", source: null }) as TradeRow;

describe("tradeByYear", () => {
  const rows = [
    // 2000: every partner cell absent for China, one of two for the US, both present for the rest of the world
    tradeRow(2000, "lithium", { CN: null, US: null, ROW: 0.5 }),
    tradeRow(2000, "copper", { CN: null, US: 2, ROW: 1.5 }),
    // 2001: every cell present, with a mirror for China only
    tradeRow(2001, "lithium", { CN: 3, US: 4, ROW: 5 }, { CN: 3.3, US: null }),
    tradeRow(2001, "copper", { CN: 1, US: 1, ROW: 1 }, { CN: null, US: null }),
  ];
  const find = (out: ReturnType<typeof tradeByYear>, year: number, partner: string, kind = "reported") => out.find((t) => t.year === year && t.partner === partner && t.kind === kind);

  it("leaves a partner-year null when every selected row has no partner row, never 0", () => {
    const out = tradeByYear(rows, "all");
    expect(find(out, 2000, "CN")).toMatchObject({ value: null, absent: 2, n: 2 });
  });
  it("sums the cells that exist and counts the absent ones on a partial year", () => {
    const out = tradeByYear(rows, "all");
    expect(find(out, 2000, "US")).toMatchObject({ value: 2, absent: 1, n: 2 });
    expect(find(out, 2000, "ROW")).toMatchObject({ value: 2, absent: 0, n: 2 });
    expect(find(out, 2001, "CN")).toMatchObject({ value: 4, absent: 0, n: 2 });
    expect(find(out, 2001, "US")?.value).toBe(5);
  });
  it("lists a mirror value only where some mirror cell exists", () => {
    const out = tradeByYear(rows, "all");
    expect(find(out, 2001, "CN", "mirror")).toMatchObject({ value: 3.3, absent: 1, n: 2 });
    expect(find(out, 2001, "US", "mirror")).toBeUndefined();
    expect(find(out, 2000, "CN", "mirror")).toBeUndefined();
  });
  it("filters to one mineral and keeps the years in order", () => {
    const out = tradeByYear(rows, "lithium");
    expect(out.map((t) => t.year)).toEqual([2000, 2000, 2000, 2001, 2001, 2001, 2001]);
    expect(find(out, 2000, "US")).toMatchObject({ value: null, absent: 1, n: 1 });
    expect(find(out, 2000, "ROW")?.value).toBe(0.5);
  });
  it("reads a reported 0 as 0, apart from an absent cell", () => {
    const out = tradeByYear([tradeRow(2002, "gold", { CN: 0, US: null, ROW: 0 })]);
    expect(find(out, 2002, "CN")).toMatchObject({ value: 0, absent: 0 });
    expect(find(out, 2002, "US")).toMatchObject({ value: null, absent: 1 });
  });
});

describe("parseTab", () => {
  it("opens the Politics tab for its id and for its visible name", () => {
    expect(parseTab("parliament")).toBe("parliament");
    expect(parseTab("politics")).toBe("parliament");
    expect(parseTab("Politics")).toBe("parliament");
  });
  it("falls back to Actions for nothing or an unknown value", () => {
    expect(parseTab(null)).toBe("actions");
    expect(parseTab("")).toBe("actions");
    expect(parseTab("nonsense")).toBe("actions");
    expect(parseTab("forecast")).toBe("forecast");
  });
});

describe("releaseLine", () => {
  it("says nothing when the brief names no data release", () => {
    expect(releaseLine(undefined, "data-v2")).toBeNull();
    expect(releaseLine(null, "data-v2")).toBeNull();
  });
  it("names the release the brief was drafted from, and the current one only when it differs", () => {
    expect(releaseLine("data-v1", "data-v1")).toBe("drafted from data release data-v1");
    expect(releaseLine("data-v1", null)).toBe("drafted from data release data-v1");
    expect(releaseLine("data-v1", "data-v2")).toBe("drafted from data release data-v1 · the current release is data-v2, numbers may have moved");
  });
});
