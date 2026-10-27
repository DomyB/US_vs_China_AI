import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { IN_SCOPE } from "../constants";
import { tradeByYear } from "../overview";
import type { StageRecords } from "../stage";
import { attentionFinding, capitalFinding, hedgeFinding, hongkongFinding, leadsFinding, lendingFinding, mineralsFinding, panelFinding, pricesFinding, sharesFinding, summaryCards, talkFinding, threeFinding, turnsFinding, type SummaryInputs } from "../summary";
import type { FlowFinanceRow, FlowTradeRow, FlowsFile, IndexFile, IndexRow, InsightRegion, InsightRegression, InsightsFile, InvestmentFile, MineralShareRow, RegionData } from "../types";

// ---- fixtures, in the style of contested.test.ts: a few countries, a few years, every absent cell a null ----
const t = (iso3: string, year: number, CN: number | null, US: number | null, WLD: number | null): FlowTradeRow => ({ iso3, year, mineral: "all", exports_musd: { CN, US, ROW: null, WLD }, source_id: "un_comtrade" });
const SMALL = ["GTM", "HND", "SLV", "NIC", "CRI", "PAN"]; // six more reporters, so the latest year has China cells for ten countries
const trade: FlowTradeRow[] = [];
for (let y = 2007; y <= 2016; y++) {
  trade.push(t("CHL", y, y < 2011 ? 20 : 40, 10, 100)); // China's share doubles after the 2010 turn
  trade.push(t("PER", y, 30, 10, 100)); // flat
  trade.push(t("BRA", y, 10, 5, 100)); // flat, the third exporter
  trade.push(t("MEX", y, 1, 50, 100)); // sells to the United States
  for (const iso of SMALL) trade.push(t(iso, y, 0, 0, 0)); // reported, and nothing sold: a cell, not an absence
}
trade.push(t("ARG", 2012, null, null, 100)); // an absent partner cell is not a zero
const scope = ["CHL", "PER", "BRA", "MEX", "ARG", ...SMALL];

const fin = (iso3: string, year: number, origin: "US" | "CN", amount_musd: number): FlowFinanceRow => ({ iso3, year, origin, amount_musd, n_events: 1, n_with_amount: 1, n_undocumented: 0, undocumented_musd: 0, n_swap: 0, swap_musd: 0, source_ids: [origin === "CN" ? "aiddata_gcdf" : "dfc_projects"] });
const finance: FlowFinanceRow[] = [fin("CHL", 2010, "CN", 100), fin("PER", 2010, "CN", 50), fin("CHL", 2015, "CN", 10), fin("CHL", 2015, "US", 5), fin("BRA", 2016, "US", 7)];

const terms: StageRecords["TERMS"] = { CHL: [[2006, "Bachelet", "L"], [2010, "Piñera", "R"], [2014, "Bachelet", "L"]], PER: [[2006, "García", "C"]] };

const regressions: InsightRegression[] = [
  { spec: "x", outcome: "export_share_cn", actor: "CN", term: "finance_flow_lag1", coef: 0.005, se: 0.01, p_cluster: 0.7, p_wild: 0.69, jk_min: 0, jk_max: 0.02, n_obs: 364, n_countries: 19, years: "2002–2021", r2_within: 0.03 },
  { spec: "x", outcome: "export_share_cn", actor: "CN", term: "diplomatic_alignment", coef: -0.01, se: 0.02, p_cluster: 0.5, p_wild: 0.41, jk_min: -0.03, jk_max: 0.01, n_obs: 364, n_countries: 19, years: "2002–2021", r2_within: 0.03 },
  { spec: "y", outcome: "export_share_us", actor: "US", term: "finance_flow_lag1", coef: 0.2, se: 0.01, p_cluster: 0.01, p_wild: 0.01, jk_min: 0.1, jk_max: 0.3, n_obs: 364, n_countries: 19, years: "2002–2021", r2_within: 0.1 },
];

const bloc = (name: string, n: number, cn: Record<string, number>, us: Record<string, number>) => ({ bloc: name, n, stance: { cn: { positive: 0, neutral: 0, mixed: 0, negative: 0, not_mentioned: 0, ...cn }, us: { positive: 0, neutral: 0, mixed: 0, negative: 0, not_mentioned: 0, ...us } } });
const years = [2007, 2008, 2009, 2010, 2011, 2012, 2013, 2014, 2015, 2016];
const region = {
  talk_vs_money: {
    n_statements: 300,
    by_bloc: [bloc("LatAm executive", 200, { positive: 13, neutral: 19, mixed: 5, negative: 3, not_mentioned: 160 }, { positive: 31, neutral: 14, mixed: 4, negative: 7, not_mentioned: 144 }), bloc("United States", 70, { neutral: 3, mixed: 1, negative: 42, not_mentioned: 24 }, { positive: 66, not_mentioned: 4 }), bloc("China", 30, { positive: 28, not_mentioned: 2 }, { negative: 10, not_mentioned: 20 })],
    finance: { CN: { years: [2015, 2021], musd: 77083.23, mineral_tagged_musd: 0 }, US: { years: [2015, 2021], musd: 7127.8, mineral_tagged_musd: 0 }, US_after: { years: [2022, 2024], musd: 4494.39, mineral_tagged_musd: 0 } },
    ratios: { statements_us_over_cn: 1.79, money_cn_over_us_2015_21: 10.8 },
    by_year: [],
    note: "",
  },
  hedgers: [],
  event_echoes: [],
  event_titles: {},
  regressions: { rows: regressions, regressor_sd: {}, note: "" },
  prices: { copper: { source_id: "wb_pink_sheet", series: "Copper", unit: "$/mt", span: [2000, 2026], latest: { year: 2016, avg: 4900, n_obs: 12 }, min_10y: { year: 2009, avg: 5100, n_obs: 12 }, max_10y: { year: 2011, avg: 8800, n_obs: 12 }, annual: years.map((y) => ({ year: y, avg: { 2007: 7100, 2008: 7000, 2009: 5100, 2010: 7500, 2011: 8800, 2012: 7900, 2013: 7300, 2014: 6900, 2015: 5500, 2016: 4900 }[y]!, n_obs: 12 })) } },
  attention: [{ year: 2010, policy_docs: 20, policy_by_source: {}, statements: 0, us_statements: 0, dfc_musd: null, cn_musd: 150 }, { year: 2015, policy_docs: 27, policy_by_source: {}, statements: 0, us_statements: 0, dfc_musd: 499, cn_musd: 10 }, { year: 2021, policy_docs: 62, policy_by_source: {}, statements: 0, us_statements: 0, dfc_musd: 1731, cn_musd: 4 }, { year: 2022, policy_docs: 70, policy_by_source: {}, statements: 0, us_statements: 0, dfc_musd: 1269, cn_musd: null }],
  scenarios: [],
  scales: {},
  index_rules: { weight: 0, min_components: 0, winsor: [0, 0], components: [], formula: "" },
} as unknown as InsightRegion;

const investment = {
  region: [
    { year: 2023, counterpart: "USA", basis: "reported", musd: 500000, n: 12, countries: [] },
    { year: 2024, counterpart: "USA", basis: "reported", musd: 540000, n: 12, countries: [] },
    { year: 2023, counterpart: "CHN", basis: "reported", musd: 9000, n: 12, countries: [] },
    { year: 2023, counterpart: "HKG", basis: "reported", musd: 4000, n: 6, countries: [] },
    { year: 2024, counterpart: "CHN", basis: "derived", musd: 99000, n: 1, countries: [] },
  ],
  positions: [
    { iso3: "BRA", counterpart: "CHN", year: 2024, direction: "inward", basis: "reported", musd: -2000 },
    { iso3: "BRA", counterpart: "HKG", year: 2024, direction: "inward", basis: "reported", musd: 3974 },
    { iso3: "CHL", counterpart: "CHN", year: 2024, direction: "inward", basis: "reported", musd: 958 },
    { iso3: "CHL", counterpart: "HKG", year: 2023, direction: "inward", basis: "reported", musd: 100 },
  ],
} as unknown as InvestmentFile;

const shares: MineralShareRow[] = [{ year: 2016, mineral: "lithium", share_cn: 0.7, share_us: 0.03, share_other: 0.27 }, { year: 2016, mineral: "silver", share_cn: 0.15, share_us: 0.61, share_other: 0.24 }, { year: 2016, mineral: "copper", share_cn: 0.5, share_us: 0.1, share_other: 0.4 }, { year: 2015, mineral: "copper", share_cn: 0.1, share_us: 0.6, share_other: 0.3 }];

const ir = (iso3: string, year: number, actor: "CN" | "US", lead: string | null): IndexRow => ({ iso3, year, actor, mineral: "all", value: 30, lower: 20, upper: 40, index: "composite", lead, lead_gap: 10, lead_cn: 50, lead_us: 40 });
const indexRows: IndexRow[] = [ir("CHL", 2016, "CN", "trade_export_share"), ir("CHL", 2016, "US", "trade_export_share"), ir("PER", 2016, "CN", "diplomatic_alignment"), ir("PER", 2016, "US", "diplomatic_alignment"), ir("BRA", 2016, "CN", "diplomatic_alignment"), ir("BRA", 2016, "US", "diplomatic_alignment"), ir("MEX", 2015, "CN", "finance_flow"), ir("MEX", 2015, "US", "finance_flow"), ir("ARG", 2016, "CN", null), ir("ARG", 2016, "US", null)];

const inputs: SummaryInputs = { trade: tradeByYear(trade, new Set(scope)), lastTradeYear: 2016, tradeRows: trade, financeRows: finance, region, investment, shares, terms, regressions, indexRows, scope };

describe("the executive summary's numbers on a fixture", () => {
  it("shares: the first and the latest year with both buyers, China's share and the US pair", () => {
    const f = sharesFinding(inputs);
    // 2007: China 61 of 400, the United States 75; 2016: China 81 of 400
    expect(f.number).toBe("15% → 20%");
    expect(f.years).toBe("2007–2016");
    expect(f.detail).toContain("19% to 19%");
    expect(f.kind).toBe("facts");
    expect(f.href).toBe("/story#c0-trade");
  });
  it("prices and the three exporters come from the contested functions", () => {
    const p = pricesFinding(inputs);
    expect(p.number).toMatch(/^r = -?\d\.\d\d$/);
    expect(p.href).toBe("/contested#prices");
    const c = threeFinding(inputs);
    // 2016: Chile 40, Peru 30, Brazil 10, Mexico 1 of 81
    expect(c.number).toBe("99%");
    expect(c.detail).toContain("Chile 49%");
    expect(c.years).toBe("2016");
  });
  it("money: the commitments window, the lending peak and the attention peaks", () => {
    const talk = talkFinding(inputs);
    expect(talk.number).toBe("US$77.1 bn vs US$7.1 bn");
    expect(talk.detail).toContain("1.8 US statements for every Chinese one");
    const lend = lendingFinding(inputs);
    expect(lend.number).toBe("US$150 m → US$10 m");
    expect(lend.years).toBe("2010–2015");
    expect(lend.detail).toContain("China took 15%"); // 2010: CHL 20 + PER 30 + BRA 10 + MEX 1 = 61 of 400
    const att = attentionFinding(inputs);
    expect(att.number).toBe("2010 → 2021");
    expect(att.years).toBe("2010–2021");
  });
  it("capital and the Hong Kong channel read the positions", () => {
    const cap = capitalFinding(inputs);
    expect(cap.number).toBe("US$500.0 bn vs US$9.0 bn");
    expect(cap.years).toBe("2023");
    expect(cap.detail).toContain("Hong Kong SAR held US$4.0 bn");
    const hk = hongkongFinding(inputs);
    expect(hk.number).toBe("US$4.1 bn vs US$958 m"); // a negative mainland position adds nothing
    expect(hk.detail).toContain("1 of 2 countries");
    expect(hk.href).toBe("/contested/more#hongkong");
  });
  it("minerals: China leads n of m in the latest year", () => {
    const m = mineralsFinding(inputs);
    expect(m.number).toBe("2 of 3");
    expect(m.years).toBe("2016");
    expect(m.detail).toContain("silver 61% vs 15%");
  });
  it("politics: the turns, the panel, the hedgers and the index leads", () => {
    const turns = turnsFinding(inputs);
    expect(turns.number).toBe("1 of 1 · 0 of 1");
    expect(turns.detail).toContain("prototype coding");
    expect(turns.sources).toEqual(["un_comtrade"]);
    const panel = panelFinding(inputs);
    expect(panel.number).toBe("0 of 2"); // the US-share row is not the China panel
    expect(panel.kind).toBe("model");
    expect(panel.href).toBe("/contested/more#panel");
    const hedge = hedgeFinding(inputs);
    expect(hedge.number).toBe("72%"); // min(160, 144) of 200
    const leads = leadsFinding(inputs);
    expect(leads.number).toBe("2 of 3"); // 2016: PER and BRA by votes, CHL by trade; ARG has no lead, MEX is 2015
    expect(leads.kind).toBe("model");
    expect(leads.href).toBe("/explore");
  });
});

describe("a missing input is a missing number, never a zero", () => {
  it("each finding prints its absent sentence when its rows are missing", () => {
    const none: SummaryInputs = { ...inputs, trade: [], tradeRows: null, financeRows: null, region: null, investment: null, shares: [], terms: null, regressions: [], indexRows: null };
    for (const f of [sharesFinding, pricesFinding, threeFinding, talkFinding, lendingFinding, attentionFinding, capitalFinding, hongkongFinding, mineralsFinding, turnsFinding, panelFinding, hedgeFinding, leadsFinding]) {
      const r = f(none);
      expect(r.number).toBeNull();
      expect(r.absent).toBeTruthy();
      expect(r.detail).toBe(r.absent);
      expect(r.absent).not.toMatch(/\b0\b/);
    }
  });
  it("one nulled input empties only the findings that read it", () => {
    const noInv = summaryCards({ ...inputs, investment: null });
    expect(noInv[2].lead.number).toBeNull();
    expect(noInv[2].lead.absent).toContain("investment file");
    expect(noInv[2].more[0].number).toBeNull();
    expect(noInv[0].lead.number).toBe("15% → 20%");
    const noTerms = summaryCards({ ...inputs, terms: null });
    expect(noTerms[4].lead.number).toBeNull();
    expect(noTerms[4].more[0].number).toBe("0 of 2");
    const sampleShares = summaryCards({ ...inputs, shares: [] });
    expect(sampleShares[3].lead.number).toBeNull();
    expect(sampleShares[3].lead.absent).toBe("No mineral shares in this release.");
  });
  it("five cards in a fixed order, each lead followed by its further findings", () => {
    const cards = summaryCards(inputs);
    expect(cards.map((c) => c.id)).toEqual(["shares", "money", "capital", "minerals", "politics"]);
    expect(cards.map((c) => c.lead.id)).toEqual(["shares", "talk", "capital", "minerals", "turns"]);
    expect(cards.map((c) => c.more.map((f) => f.id))).toEqual([["prices", "three"], ["lending", "attention"], ["hongkong"], [], ["panel", "hedge", "leads"]]);
    expect(cards.every((c) => c.title.length > 0)).toBe(true);
  });
});

// ---- parity: the committed export, read the way the home builds its inputs ----
const PUB = resolve(__dirname, "../../../public/data");
const read = <T,>(f: string): T => JSON.parse(readFileSync(resolve(PUB, f), "utf8")) as T;

describe("the executive summary reproduces from the committed export", () => {
  const flows = read<FlowsFile>("real/flows.json");
  const insights = read<InsightsFile>("real/insights.json");
  const investmentFile = read<InvestmentFile>("real/investment.json");
  const regionFile = read<RegionData>("real/region.json");
  const index = read<IndexFile>("real/index.json");
  const rec = read<StageRecords>("companion/prototype/records.json");
  const real: SummaryInputs = {
    trade: tradeByYear(flows.trade, new Set(IN_SCOPE)),
    lastTradeYear: flows.meta.last_year.trade,
    tradeRows: flows.trade,
    financeRows: flows.finance,
    region: insights.region,
    investment: investmentFile,
    shares: regionFile.mineral_shares,
    terms: rec.TERMS,
    regressions: insights.region.regressions.rows,
    indexRows: index.rows,
    scope: IN_SCOPE,
  };
  it("every lead finding carries a number", () => {
    const cards = summaryCards(real);
    expect(cards).toHaveLength(5);
    for (const c of cards) {
      expect(c.lead.number, c.lead.id).not.toBeNull();
      expect(c.lead.absent).toBeUndefined();
      expect(c.lead.detail).not.toBe("");
    }
  });
  it("the further findings carry a number wherever the export holds their rows", () => {
    const cards = summaryCards(real);
    for (const f of cards.flatMap((c) => c.more)) {
      expect(f.number, f.id).not.toBeNull();
      expect(f.href).toMatch(/^\/(contested|explore)/);
    }
  });
  it("the shares finding matches the home's tiles: the first year with both buyers and the trade record's last year", () => {
    const f = sharesFinding(real);
    expect(f.years).toBe(`${real.trade.find((y) => y.n_cn > 0 && y.n_us > 0)!.year}–${flows.meta.last_year.trade}`);
  });
});
