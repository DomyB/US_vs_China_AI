import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { COUNTRY_COUNT } from "../constants";
import { describe, expect, it } from "vitest";
import { fmtMusd, fmtShare } from "@/lib/format";
import { absentPartnerMinerals, chapterEvidence, coverageWall, financeLedger, loanThenFlat, mineralBoard, regionalTrade, seriesFromFlows, swapsByYear, tradeReceipt, undocumentedByCountry } from "@/lib/story";
import type { FlowsFile, InsightsFile, RealMeta, RegionData, StoryFile } from "@/lib/types";

// Parity test: the headline numbers the story prints are recomputed here from the committed export, so a chapter can
// never carry a figure the evidence room does not.
const REAL = resolve(__dirname, "../../../public/data/real");
const read = <T,>(f: string): T => JSON.parse(readFileSync(resolve(REAL, f), "utf8")) as T;
const flows = read<FlowsFile>("flows.json");
const insights = read<InsightsFile>("insights.json");
const region = read<RegionData>("region.json");
const meta = read<RealMeta>("meta.json");
const story = read<StoryFile>("story.json");

describe("story numbers reproduce from the export", () => {
  it("regional trade shares carry reporter counts and absent partner cells", () => {
    const rows = regionalTrade(flows);
    const y2024 = rows.find((r) => r.year === 2024)!;
    expect(rows[0].year).toBeLessThanOrEqual(2008);
    expect(y2024.reporters).toBeGreaterThanOrEqual(9);
    expect(y2024.share_cn).toBeGreaterThan(0.3);
    expect(y2024.share_cn + y2024.share_us).toBeLessThan(1);
    expect(rows.every((r) => Math.abs(r.US + r.CN + r.ROW - r.total) < 1e-6)).toBe(true);
  });

  it("counts the reporters with no partner row per actor, so a share over the others is never read as a share over all", () => {
    const rows = regionalTrade(flows);
    for (const r of rows) {
      const all = flows.trade.filter((t) => t.mineral === "all" && t.year === r.year);
      expect(r.reporters).toBe(all.length);
      expect(r.cn_absent).toBe(all.filter((t) => t.exports_musd.CN === null).length);
      expect(r.us_absent).toBe(all.filter((t) => t.exports_musd.US === null).length);
      // the combined count is at least the larger of the two and at most their sum
      expect(r.partners_absent).toBeGreaterThanOrEqual(Math.max(r.cn_absent, r.us_absent));
      expect(r.partners_absent).toBeLessThanOrEqual(r.cn_absent + r.us_absent);
    }
    // the first year's China share rests on the reporters with a China row (a lower bound the chapter says so about)
    const first = rows[0];
    const withRow = flows.trade.filter((t) => t.mineral === "all" && t.year === first.year && t.exports_musd.CN !== null);
    expect(first.CN).toBeCloseTo(withRow.reduce((s, t) => s + (t.exports_musd.CN ?? 0), 0), 6);
  });

  it("the two ledgers are kept apart and agree with the insights ratios", () => {
    const l = financeLedger(flows);
    expect(l.CN.documented_musd).toBeGreaterThan(l.US.documented_musd * 10);
    expect(l.CN.events).toBe(l.CN.with_amount + l.CN.undocumented_n + l.CN.swap_n + l.CN.no_amount_n);
    expect(l.CN.swap_musd).toBeGreaterThan(100_000); // the PBoC–BCRA drawdowns are above US$100 bn
    expect(l.US.swap_musd).toBeGreaterThanOrEqual(0); // 0 once the export after 2026-10-13 lands: the release of that evening read DFC's two debt-for-nature swaps (Belize, El Salvador) as swap lines; the filter now leaves them out
    const window = financeLedger(flows, { since: 2015 });
    const cn15 = window.CN.by_year.filter((y) => y.year <= 2021).reduce((s, y) => s + y.documented_musd, 0);
    expect(Math.round(cn15)).toBe(Math.round(insights.region.talk_vs_money.finance.CN.musd));
  });

  it("swaps, lower-confidence amounts and receipts come from the same rows", () => {
    const swaps = swapsByYear(flows, "ARG");
    expect(swaps.length).toBeGreaterThan(5);
    expect(swaps.reduce((s, y) => s + y.musd, 0)).toBeGreaterThan(100_000);
    const undocumented = undocumentedByCountry(flows);
    expect(undocumented[0].musd).toBeGreaterThan(undocumented[undocumented.length - 1].musd);
    const lithium = tradeReceipt(flows, "ARG", "lithium")!;
    expect(lithium.CN).not.toBeNull();
    expect(lithium.share_cn!).toBeGreaterThan(0.9);
    const silver = tradeReceipt(flows, "ARG", "silver")!;
    expect(silver.partners_absent).toBe(silver.US === null || silver.CN === null);
    expect(tradeReceipt(flows, "ARG", "gold")).toBeNull(); // gold is not a core mineral in flows.json; the story reads it from the insights contrast
    // an absent partner cell is a null share, never 0: the row exists (ROW only) but the China and US cells are missing
    const sur = tradeReceipt(flows, "SUR", "all")!;
    expect(sur.year).toBe(flows.meta.last_year.trade);
    expect(sur.CN).toBeNull();
    expect(sur.share_cn).toBeNull();
    expect(sur.partners_absent).toBe(true);
  });

  it("the mineral board prints the world total of every bar and the flagged loans sort by share of GDP", () => {
    const board = mineralBoard(region.mineral_shares);
    expect(board.length).toBeGreaterThan(5);
    expect(board.every((b) => typeof b.world_musd === "number")).toBe(true);
    expect(board[0].share_cn).toBeGreaterThanOrEqual(board[board.length - 1].share_cn);
    const loans = loanThenFlat(insights);
    expect(loans.length).toBeGreaterThan(5);
    expect((loans[0].score ?? 0) >= (loans[1].score ?? 0)).toBe(true);
    expect(coverageWall(meta, flows).rows.length).toBe(COUNTRY_COUNT);
  });

  it("the coverage wall derives each finance cell from that origin's rows, so a missing record is hatched, not held", () => {
    const wall = coverageWall(meta, flows);
    for (const r of wall.rows) {
      const has = (origin: "US" | "CN") => flows.finance.some((f) => f.iso3 === r.iso3 && f.origin === origin);
      expect(r.cells["finance CN"].ok).toBe(has("CN"));
      expect(r.cells["finance US"].ok).toBe(has("US"));
    }
    const ven = wall.rows.find((r) => r.iso3 === "VEN")!;
    expect(ven.cells["finance CN"].ok).toBe(true);
    expect(ven.cells["finance US"].ok).toBe(false);
    expect(ven.cells["finance US"].note).toMatch(/^no /);
    const arg = wall.rows.find((r) => r.iso3 === "ARG")!;
    expect(arg.cells["finance US"].note).toContain(String(flows.meta.last_year.finance_US));
    expect(arg.cells["finance CN"].note).toContain(String(flows.meta.last_year.finance_CN));
  });

  it("shares and amounts never print a missing or a small value as zero", () => {
    expect(fmtShare(null)).toBe("absent");
    expect(fmtShare(undefined)).toBe("absent");
    expect(fmtShare(0)).toBe("0%");
    expect(fmtShare(0.0021)).toBe("0.2%");
    expect(fmtShare(0.0002)).toBe("under 0.1%");
    expect(fmtShare(0.2323)).toBe("23%");
    expect(fmtMusd(0.065)).toBe("US$65 k");
    expect(fmtMusd(0.27)).toBe("US$270 k");
    expect(fmtMusd(0)).toBe("US$0 m");
    expect(fmtMusd(5.912)).toBe("US$6 m");
    expect(fmtMusd(2771.975)).toBe("US$2.8 bn");
    expect(fmtMusd(null)).toBe("—");
  });

  it("the coverage wall prints a column the export did not write as not in the release, never as a count of zero or an invented reason", () => {
    const stripped: RealMeta = { ...meta, coverage: Object.fromEntries(Object.entries(meta.coverage).map(([iso3, c]) => [iso3, { ...c, statements: undefined, media_articles: undefined, forecast_available: undefined, analysis_available: undefined, parliament_available: undefined }])) };
    for (const r of coverageWall(stripped, flows).rows) {
      for (const col of ["statements", "media", "forecast", "analysis", "parliament"] as const) {
        expect(r.cells[col].ok).toBe(false);
        expect(r.cells[col].note).toBe("not in this release");
      }
    }
    // a real zero stays a zero, and a flag the export set false gets no reason the export did not give
    const wall = coverageWall(meta, flows);
    const ury = wall.rows.find((r) => r.iso3 === "URY")!;
    expect(ury.cells.statements.note).toBe(`${meta.coverage.URY.statements} coded statements`);
    // whichever country the export left without a forecast (the set changes with each data release)
    const noForecast = Object.entries(meta.coverage).find(([, c]) => c.forecast_available === false)?.[0];
    if (noForecast) {
      const row = wall.rows.find((r) => r.iso3 === noForecast)!;
      expect(row.cells.forecast.ok).toBe(false);
      expect(row.cells.forecast.note).not.toMatch(/too few|fewer than/);
    }
    expect(wall.rows.find((r) => r.iso3 === "ARG")!.cells.forecast.ok).toBe(true);
  });

  it("the chapter meters take their years and counts from the export and drop a clause whose input is absent", () => {
    const t = { coverage_80: 0.683, n_tests: 240 };
    const full = chapterEvidence({ lastYear: flows.meta.last_year, fewestStatements: 1, forecast: t, events: { draft: 19, total: 19 } });
    expect(full.map((c) => c.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(full[0].basis).toContain(`ends in ${flows.meta.last_year.finance_CN}`);
    expect(full[4].basis).toContain("as few as 1 coded executive statement for a country");
    expect(full[6].basis).toContain("under-covers (68% of 240 backtests)");
    expect(full[7].basis).toContain("19 of 19 dated events draft");
    const bare = chapterEvidence({ lastYear: { finance_CN: null, finance_US: null, trade: null }, fewestStatements: null, forecast: null, events: null });
    expect(bare.map((c) => c.level)).toEqual(full.map((c) => c.level));
    expect(bare[0].basis).not.toMatch(/\d{4}/);
    expect(bare[4].basis).toBe("unvalidated stance coding");
    expect(bare[6].basis).toBe("parity is arithmetic; no forecast in this release");
    expect(bare[7].basis).toBe("strong on money and trade; thin words");
    expect(chapterEvidence({ ...{ lastYear: flows.meta.last_year, fewestStatements: null, events: null }, forecast: { coverage_80: 0.83, n_tests: 240 } })[6].basis).toContain("covers as nominal (83% of 240 backtests)");
  });

  it("Chile's per-mineral series recomputed from flows.json match the story export, so the chapters survive a missing story.json", () => {
    for (const mineral of ["lithium", "copper"]) {
      const fromFlows = seriesFromFlows(flows, "CHL", mineral);
      const exported = story.series.CHL[mineral];
      expect(fromFlows.length).toBe(exported.length);
      for (const [i, row] of exported.entries()) {
        expect(fromFlows[i].year).toBe(row.year);
        expect(fromFlows[i].exports_wld_musd).toBeCloseTo(row.exports_wld_musd!, 2);
        if (row.share_cn_x === null) expect(fromFlows[i].share_cn_x).toBeNull();
        else expect(fromFlows[i].share_cn_x).toBeCloseTo(row.share_cn_x, 4);
      }
    }
    expect(seriesFromFlows(flows, "ARG", "gold")).toEqual([]);
  });

  it("a mineral with no partner row inside the total is named beside the share, and the US years after the window come from the same rows", () => {
    const arg = insights.countries.find((c) => c.iso3 === "ARG")!;
    const absent = absentPartnerMinerals(arg.trade)!;
    expect(absent.year).toBe(arg.trade!.year);
    expect(absent.minerals).toContain("gold");
    const gold = arg.trade!.minerals.find((m) => m.mineral === "gold")!;
    expect(absent.musd).toBeCloseTo(gold.total_musd!, 3);
    expect(absent.share_of_total!).toBeGreaterThan(0.5);
    expect(absentPartnerMinerals(null)).toBeNull();
    expect(absentPartnerMinerals({ ...arg.trade!, minerals: [] })!.musd).toBe(0);
    // the insights window stops before the US record ends; the rows after it are not nothing
    const from = arg.finance.windows.US_after[1] + 1;
    expect(flows.meta.last_year.finance_US).toBeGreaterThanOrEqual(from);
    const after = financeLedger(flows, { iso3: "ARG", since: from }).US;
    expect(after.events).toBeGreaterThan(0);
    expect(after.first_year).toBeGreaterThanOrEqual(from);
    expect(after.last_year).toBeLessThanOrEqual(flows.meta.last_year.finance_US!);
  });
});
