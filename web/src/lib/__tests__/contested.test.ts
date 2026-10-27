import { describe, expect, it } from "vitest";
import { attentionVsMoney, capitalVsOre, CLAIMS, claimHref, claimNumber, lendingVsOre, MAIN_CLAIMS, mineralSplit, MORE_CLAIMS, panelNull, pearson, pressureCases, turnSummary, turnsVsOre, votesVsOre } from "../contested";
import type { ComponentRow } from "../geometry";
import type { FlowFinanceRow, FlowTradeRow, InvestmentFile, MineralShareRow } from "../types";

const t = (iso3: string, year: number, CN: number | null, WLD: number | null): FlowTradeRow => ({ iso3, year, mineral: "all", exports_musd: { CN, US: 0, ROW: null, WLD }, source_id: "un_comtrade" });
const trade: FlowTradeRow[] = [];
for (let y = 2007; y <= 2016; y++) {
  trade.push(t("CHL", y, y < 2011 ? 20 : 40, 100)); // the share doubles after the 2010 turn
  trade.push(t("PER", y, 30, 100)); // flat: the region's own move is what Chile adds
}
trade.push(t("ARG", 2012, null, 100)); // an absent China cell is not a zero

describe("against the grain: the two pages of claims", () => {
  it("splits the claims into seven main and eleven further, with unique ids", () => {
    expect(MAIN_CLAIMS).toHaveLength(7);
    expect(MORE_CLAIMS).toHaveLength(11);
    expect(MAIN_CLAIMS.length + MORE_CLAIMS.length).toBe(CLAIMS.length);
    expect(new Set(CLAIMS.map((c) => c.id)).size).toBe(CLAIMS.length);
    expect(CLAIMS.every((c) => c.headline && c.stake)).toBe(true);
  });
  it("sends each claim to its own page and numbers it the same everywhere", () => {
    expect(claimHref("turns")).toBe("/contested#turns");
    expect(claimHref("hongkong")).toBe("/contested/more#hongkong");
    expect(claimNumber("turns")).toBe(1);
    expect(claimNumber("panel")).toBe(8);
    expect(MAIN_CLAIMS.map((c) => claimNumber(c.id))).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(MORE_CLAIMS.every((c) => claimNumber(c.id) > MAIN_CLAIMS.length)).toBe(true);
  });
});

describe("against the grain: tests on the record", () => {
  it("measures each change of orientation three years each side, net of the region", () => {
    const terms = { CHL: [[2006, "Bachelet", "L"], [2010, "Piñera", "R"], [2014, "Bachelet", "L"]] as [number, string, "L" | "C" | "R"][], PER: [[2006, "García", "C"]] as [number, string, "L" | "C" | "R"][] };
    const turns = turnsVsOre(terms, trade, ["CHL", "PER", "ARG"]);
    expect(turns).toHaveLength(2);
    const p = turns[0];
    expect(p).toMatchObject({ iso3: "CHL", year: 2010, direction: "right" });
    expect(p.before).toBeCloseTo(0.2, 6);
    expect(p.after).toBeCloseTo(0.4, 6);
    expect(p.change).toBeCloseTo(0.2, 6);
    // the region (Chile + Peru) moved from 25% to 35%, so the net change is the 20 points less the region's 10
    expect(p.net).toBeCloseTo(0.1, 6);
    expect(turns[1]).toMatchObject({ iso3: "CHL", year: 2014, direction: "left" });
    expect(turns[1].change).toBeCloseTo(0, 6); // 2015–2017 has rows for 2015 and 2016 only: two of three is enough, and the share did not move
    const s = turnSummary(turns);
    expect(s.right).toMatchObject({ n: 1, up: 1 });
  });
  it("sums commitments by year and finds the peak", () => {
    const fin: FlowFinanceRow[] = [
      { iso3: "CHL", year: 2015, origin: "CN", amount_musd: 100, n_events: 1, n_with_amount: 1, n_undocumented: 0, undocumented_musd: 0, n_swap: 0, swap_musd: 0, source_ids: ["aiddata_gcdf"] },
      { iso3: "PER", year: 2015, origin: "CN", amount_musd: 50, n_events: 1, n_with_amount: 1, n_undocumented: 0, undocumented_musd: 0, n_swap: 0, swap_musd: 0, source_ids: ["aiddata_gcdf"] },
      { iso3: "CHL", year: 2016, origin: "CN", amount_musd: 10, n_events: 1, n_with_amount: 1, n_undocumented: 0, undocumented_musd: 0, n_swap: 0, swap_musd: 0, source_ids: ["aiddata_gcdf"] },
      { iso3: "CHL", year: 2016, origin: "US", amount_musd: 5, n_events: 1, n_with_amount: 1, n_undocumented: 0, undocumented_musd: 0, n_swap: 0, swap_musd: 0, source_ids: ["dfc"] },
    ] as FlowFinanceRow[];
    const r = lendingVsOre(fin, trade, ["CHL", "PER"]);
    expect(r.peak).toMatchObject({ year: 2015, CN: 150 });
    expect(r.lastCN).toMatchObject({ year: 2016, CN: 10, US: 5 });
    expect(r.rows[0].share_cn).toBeCloseTo(0.35, 6);
  });
  it("reads the latest year both counterparts report positions", () => {
    const inv = { region: [
      { year: 2023, counterpart: "USA", basis: "reported", musd: 500, n: 12, countries: [] },
      { year: 2024, counterpart: "USA", basis: "reported", musd: 540, n: 12, countries: [] },
      { year: 2023, counterpart: "CHN", basis: "reported", musd: 9, n: 12, countries: [] },
      { year: 2024, counterpart: "CHN", basis: "derived", musd: 99, n: 1, countries: [] },
    ] } as unknown as InvestmentFile;
    expect(capitalVsOre(inv)).toMatchObject({ year: 2023, USA: { musd: 500 }, CHN: { musd: 9 }, HKG: null });
  });
  it("splits the minerals by who buys more and reads the panel's silence", () => {
    const rows: MineralShareRow[] = [{ year: 2025, mineral: "lithium", share_cn: 0.7, share_us: 0.03, share_other: 0.27 }, { year: 2025, mineral: "silver", share_cn: 0.15, share_us: 0.61, share_other: 0.24 }, { year: 2024, mineral: "copper", share_cn: 0.5, share_us: 0.1, share_other: 0.4 }];
    const m = mineralSplit(rows);
    expect(m.year).toBe(2025);
    expect(m.chinaLed.map((r) => r.mineral)).toEqual(["lithium"]);
    expect(m.usLed.map((r) => r.mineral)).toEqual(["silver"]);
    const p = panelNull([{ spec: "x", outcome: "export_share_cn", actor: "CN", term: "finance_flow_lag1", coef: 0.005, se: 0.01, p_cluster: 0.7, p_wild: 0.69, jk_min: 0, jk_max: 0.02, n_obs: 364, n_countries: 19, years: "2002–2021", r2_within: 0.03 }]);
    expect(p.significant).toHaveLength(0);
    expect(p.n_obs).toBe(364);
  });
  it("pairs each country's latest vote alignment with its export share and counts the odd corner", () => {
    const c = (iso: string, y: number, k: string, norm: number): ComponentRow => ({ c: iso, y, a: "CN", k, raw: null, norm, ok: true, note: null });
    const v = votesVsOre([c("CRI", 2024, "trade_export_share", 0), c("CRI", 2024, "diplomatic_alignment", 75), c("CHL", 2024, "trade_export_share", 51), c("CHL", 2024, "diplomatic_alignment", 75), c("CHL", 2023, "trade_export_share", 40), c("CHL", 2023, "diplomatic_alignment", 70), c("BOL", 2024, "trade_export_share", 25), c("BOL", 2024, "diplomatic_alignment", 94)]);
    expect(v.rows.map((r) => r.iso3)).toEqual(["CHL", "BOL", "CRI"]);
    expect(v.rows[0].year).toBe(2024);
    expect(v.lowTradeHighVotes.map((r) => r.iso3)).toEqual(["CRI"]);
    expect(v.votesMin).toBe(75);
    expect(pearson([1, 2, 3], [2, 4, 6])).toBeCloseTo(1, 6);
    expect(pearson([1, 2], [2, 4])).toBeNull();
  });
  it("reads attention against money and the companion's cases", () => {
    const a = attentionVsMoney([{ year: 2015, policy_docs: 27, policy_by_source: {}, statements: 0, us_statements: 0, dfc_musd: 499, cn_musd: 29884 }, { year: 2021, policy_docs: 62, policy_by_source: {}, statements: 0, us_statements: 0, dfc_musd: 1731, cn_musd: 3859 }, { year: 2022, policy_docs: 70, policy_by_source: {}, statements: 0, us_statements: 0, dfc_musd: 1269, cn_musd: null }]);
    expect(a.years).toBe(2);
    expect(a.peakMoney?.year).toBe(2015);
    expect(a.peakDocs?.year).toBe(2021);
    const cases = pressureCases([{ name: "a", iso: "ARG", years: "2020", outcome: "Cancelled", cause: "documented", alt: "no" }, { name: "b", iso: "CHL", years: "2021", outcome: "No observable change", cause: "plausible", alt: "partial" }]);
    expect(cases).toMatchObject({ n: 2, removed: 1, unchanged: 1, documented: 1, altPartial: 1, altFull: 0 });
  });
});

import { chinaConcentration, echoFamilies, fanWidth, hongKongChannel, leanFlips, pricesVsValue, warmWordsNoTrade } from "../contested";
import type { EventEcho, IndexRow, InsightCountry, PriceSeries } from "../types";

describe("against the grain: the second set", () => {
  const t2 = (iso3: string, year: number, CN: number | null, WLD: number | null): FlowTradeRow => ({ iso3, year, mineral: "all", exports_musd: { CN, US: 0, ROW: null, WLD }, source_id: "un_comtrade" });
  it("finds who carries the exports to China in the latest year with enough cells", () => {
    const rows = [t2("CHL", 2024, 30, 60), t2("BRA", 2024, 20, 40), t2("PER", 2024, 10, 20), t2("MEX", 2024, 5, 50), t2("ARG", 2024, null, 10), t2("CHL", 2025, 90, 100)];
    const c = chinaConcentration(rows, ["CHL", "BRA", "PER", "MEX", "ARG"], 4)!;
    expect(c.year).toBe(2024); // 2025 has one cell only
    expect(c.top3.map((r) => r.iso3)).toEqual(["CHL", "BRA", "PER"]);
    expect(c.top3Share).toBeCloseTo(60 / 65, 6);
    expect(chinaConcentration(rows, ["CHL"], 4)).toBeNull();
  });
  it("sets the export value against a price series and finds the peak and the trough after it", () => {
    const trade = [2003, 2008, 2011, 2016, 2024].map((y) => t2("CHL", y, 1, { 2003: 20, 2008: 80, 2011: 150, 2016: 90, 2024: 170 }[y]!));
    const prices: Record<string, PriceSeries> = { copper: { source_id: "wb", series: "Copper", unit: "$/mt", span: [2000, 2026], latest: { year: 2024, avg: 9000, n_obs: 12 }, min_10y: { year: 2016, avg: 4000, n_obs: 12 }, max_10y: { year: 2024, avg: 9000, n_obs: 12 }, annual: [2003, 2008, 2011, 2016, 2024].map((y) => ({ year: y, avg: { 2003: 1800, 2008: 7000, 2011: 8800, 2016: 4900, 2024: 9100 }[y]!, n_obs: 12 })) } as PriceSeries };
    const r = pricesVsValue(prices, trade, ["CHL"])!;
    expect(r.peak.year).toBe(2024);
    expect(r.corr!).toBeGreaterThan(0.9);
    expect(r.first.year).toBe(2003);
  });
  it("groups the echoes by family and counts US measures after which the US share fell", () => {
    const e = (family: string, actor: "US" | "CN", mean: number, event_actor = "US"): EventEcho => ({ family, event_actor, event_type: "x", label: family, actor, n: 3, mean, median: mean, p25: mean, p75: mean, events: [], countries: [], all_draft: true, windows: [] } as unknown as EventEcho);
    const f = echoFamilies([e("US:tariff", "US", -0.05), e("US:tariff", "CN", 0.04), e("US:law", "US", 0.01), e("CN:export", "US", -0.01, "CN"), { ...e("US:one", "US", -0.3), n: 1 }]);
    expect(f.rows).toHaveLength(3);
    expect(f.usMeasures).toHaveLength(2);
    expect(f.usLose).toBe(1);
  });
  it("counts sign changes of the net lean per country", () => {
    const r = (iso3: string, year: number, actor: "CN" | "US", value: number): IndexRow => ({ iso3, year, actor, mineral: "all", value, lower: value, upper: value, n_components: 4, index: "composite", components_available: [] } as unknown as IndexRow);
    const rows = [r("CHL", 2020, "CN", 40), r("CHL", 2020, "US", 20), r("CHL", 2021, "CN", 45), r("CHL", 2021, "US", 20), r("PAN", 2020, "CN", 20), r("PAN", 2020, "US", 25), r("PAN", 2021, "CN", 30), r("PAN", 2021, "US", 25), r("PAN", 2022, "CN", 20), r("PAN", 2022, "US", 25)];
    const f = leanFlips(rows);
    expect(f[0]).toMatchObject({ iso3: "PAN", flips: 2, last: -5, lastYear: 2022 });
    expect(f[1]).toMatchObject({ iso3: "CHL", flips: 0, last: 25 });
  });
  it("reads warm words against small trade, the Hong Kong channel and the fan widths", () => {
    const c = (iso3: string, stance: number, share: number, extra: Partial<InsightCountry> = {}): InsightCountry => ({ iso3, name: iso3, trade: null, trade_series: [], finance: {}, gdp_latest: null, components_latest: {}, forecast: null, words: {}, say_do: [], flags: { n: 0, items: [] }, contrasts: [{ id: "words_vs_trade_us", kind: "words_vs_trade", actor: "US", stance, n: 5, share, trade_year: 2025, years: [2024, 2025], label: "", inputs: [], caveat: "" }], ...extra } as unknown as InsightCountry);
    const w = warmWordsNoTrade([c("ARG", 1, 0.002), c("MEX", 0.33, 0.54), c("CHL", 0.2, 0.14)]);
    expect(w.warmNoTrade.map((r) => r.iso3)).toEqual(["ARG"]);
    expect(w.coolTrade.map((r) => r.iso3)).toEqual(["MEX"]);
    const inv = { positions: [
      { iso3: "BRA", counterpart: "CHN", year: 2024, direction: "inward", basis: "reported", musd: -2000 },
      { iso3: "BRA", counterpart: "HKG", year: 2024, direction: "inward", basis: "reported", musd: 3974 },
      { iso3: "CHL", counterpart: "CHN", year: 2024, direction: "inward", basis: "reported", musd: 958 },
      { iso3: "CHL", counterpart: "HKG", year: 2023, direction: "inward", basis: "derived", musd: 5000 },
    ], region: [] } as unknown as InvestmentFile;
    const hk = hongKongChannel(inv);
    expect(hk.hkLarger.map((r) => r.iso3)).toEqual(["BRA"]);
    expect(hk.cnTotal).toBe(958); // a negative position adds nothing
    const fc = c("CHL", 0, 0, { trade_series: [0.1, 0.2, 0.3, 0.4, 0.5].map((s, i) => ({ year: 2020 + i, share_cn: s, share_us: 0.1, total_musd: 1 })), forecast: { paths: { export_share: { CN: { baseline: [{ year: 2030, point: 0.5, p05: 0.1, p25: 0.3, p75: 0.6, p95: 0.9 }] } } }, status: {} } } as unknown as Partial<InsightCountry>);
    const f = fanWidth([fc]);
    expect(f.rows[0]).toMatchObject({ iso3: "CHL", range: 0.4 });
    expect(f.rows[0].width).toBeCloseTo(0.8, 6);
    expect(f.wider).toHaveLength(1);
  });
});
