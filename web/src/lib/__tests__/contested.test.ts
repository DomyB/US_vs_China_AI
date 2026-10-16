import { describe, expect, it } from "vitest";
import { attentionVsMoney, capitalVsOre, lendingVsOre, mineralSplit, panelNull, pearson, pressureCases, turnSummary, turnsVsOre, votesVsOre } from "../contested";
import type { ComponentRow } from "../geometry";
import type { FlowFinanceRow, FlowTradeRow, InvestmentFile, MineralShareRow } from "../types";

const t = (iso3: string, year: number, CN: number | null, WLD: number | null): FlowTradeRow => ({ iso3, year, mineral: "all", exports_musd: { CN, US: 0, ROW: null, WLD }, source_id: "un_comtrade" });
const trade: FlowTradeRow[] = [];
for (let y = 2007; y <= 2016; y++) {
  trade.push(t("CHL", y, y < 2011 ? 20 : 40, 100)); // the share doubles after the 2010 turn
  trade.push(t("PER", y, 30, 100)); // flat: the region's own move is what Chile adds
}
trade.push(t("ARG", 2012, null, 100)); // an absent China cell is not a zero

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
