import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { fmtMusd, fmtShare } from "@/lib/format";
import { coverageWall, financeLedger, loanThenFlat, mineralBoard, regionalTrade, swapsByYear, tradeReceipt, undocumentedByCountry } from "@/lib/story";
import type { FlowsFile, InsightsFile, RealMeta, RegionData } from "@/lib/types";

// Parity test: the headline numbers the story prints are recomputed here from the committed export, so a chapter can
// never carry a figure the evidence room does not.
const REAL = resolve(__dirname, "../../../public/data/real");
const read = <T,>(f: string): T => JSON.parse(readFileSync(resolve(REAL, f), "utf8")) as T;
const flows = read<FlowsFile>("flows.json");
const insights = read<InsightsFile>("insights.json");
const region = read<RegionData>("region.json");
const meta = read<RealMeta>("meta.json");

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

  it("the two ledgers are kept apart and agree with the insights ratios", () => {
    const l = financeLedger(flows);
    expect(l.CN.documented_musd).toBeGreaterThan(l.US.documented_musd * 10);
    expect(l.CN.events).toBe(l.CN.with_amount + l.CN.undocumented_n + l.CN.swap_n + l.CN.no_amount_n);
    expect(l.CN.swap_musd).toBeGreaterThan(100_000); // the PBoC–BCRA drawdowns are above US$100 bn
    expect(l.US.swap_musd).toBe(0);
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
    expect(coverageWall(meta, flows).rows.length).toBe(12);
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
});
