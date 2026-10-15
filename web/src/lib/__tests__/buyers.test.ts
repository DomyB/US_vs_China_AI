import { describe, expect, it } from "vitest";
import { BIV, BIV_NAMES, bin, bivFill, buyerCells, buyerYears } from "../buyers";
import type { FlowTradeRow } from "../types";

const row = (iso3: string, year: number, mineral: string, CN: number | null, US: number | null, WLD: number | null): FlowTradeRow => ({ iso3, year, mineral, exports_musd: { CN, US, WLD, ROW: null }, source_id: "un_comtrade" });

describe("who buys: shares of each country's own reported exports", () => {
  const rows = [row("CHL", 2023, "all", 500, 100, 1000), row("PER", 2023, "all", 300, null, 900), row("ARG", 2023, "all", 10, 20, 0.5), row("CHL", 2023, "copper", 400, 50, 800), row("BRA", 2022, "all", 100, 100, 400)];
  it("keeps only countries with both partner cells and a world total of at least US$1 million", () => {
    const cells = buyerCells(rows, 2023, "all", ["CHL", "PER", "ARG", "BRA"]);
    expect([...cells.keys()]).toEqual(["CHL"]);
    expect(cells.get("CHL")).toMatchObject({ cn: 0.5, us: 0.1, wld: 1000 });
    expect(buyerCells(rows, 2023, "copper", ["CHL"]).get("CHL")?.cn).toBe(0.5);
    expect(buyerCells(rows, 2023, "all", ["BRA"]).size).toBe(0); // scope and year both apply
  });
  it("bins at 15% and 40% and reads the grid with the US share down and China's across", () => {
    expect([bin(0), bin(0.149), bin(0.15), bin(0.399), bin(0.4), bin(1)]).toEqual([0, 0, 1, 1, 2, 2]);
    expect(bivFill(0.5, 0.1)).toBe(BIV[0][2]); // high China, low US: the vermilion corner
    expect(bivFill(0.1, 0.5)).toBe(BIV[2][0]); // low China, high US: the blue corner
    expect(BIV_NAMES[0][2]).toBe("High China, low US");
    expect(new Set(BIV.flat()).size).toBe(9);
  });
  it("lists the years with enough reporting countries", () => {
    expect(buyerYears(rows, "all", ["CHL", "PER", "ARG", "BRA"], 1)).toEqual([2022, 2023]);
    expect(buyerYears(rows, "all", ["CHL", "PER", "ARG", "BRA"], 2)).toEqual([]);
  });
});
