import { describe, expect, it } from "vitest";
import type { ComponentsFile } from "../geometry";
import { financeByYear, investmentByYear, latestYear, leanByYear, tradeByYear, votesByYear } from "../overview";
import type { IndexRow, InvestmentFile } from "../types";

const scope = new Set(["CHL", "PER", "MEX"]);

describe("the whole picture", () => {
  it("sums trade over the reporting countries and never reads an absent cell as zero", () => {
    const rows = [
      { iso3: "CHL", year: 2020, mineral: "all", exports_musd: { US: 100, CN: 300, ROW: 100, WLD: 500 } },
      { iso3: "PER", year: 2020, mineral: "all", exports_musd: { US: 50, CN: null, ROW: null, WLD: 200 } },
      { iso3: "CHL", year: 2020, mineral: "copper", exports_musd: { US: 90, CN: 290, ROW: 90, WLD: 470 } },
      { iso3: "ARG", year: 2020, mineral: "all", exports_musd: { US: 1, CN: 1, ROW: 1, WLD: 3 } },
      { iso3: "MEX", year: 2021, mineral: "all", exports_musd: { US: 400, CN: 20, ROW: 80, WLD: 500 } },
    ];
    const t = tradeByYear(rows, scope);
    expect(t.map((y) => y.year)).toEqual([2020, 2021]);
    expect(t[0]).toMatchObject({ CN: 300, US: 150, WLD: 700, n: 2, n_cn: 1, n_us: 2 });
    expect(t[0].share_cn).toBeCloseTo(300 / 500, 9); // the share is over the countries that carry both cells
    expect(t[1]).toMatchObject({ CN: 20, US: 400, n: 1, share_cn: 0.04, share_us: 0.8 });
  });
  it("sums finance by origin with swaps apart and counts the countries", () => {
    const f = financeByYear([
      { iso3: "CHL", year: 2019, origin: "CN", amount_musd: 100, n_events: 2, swap_musd: 0, undocumented_musd: 0 },
      { iso3: "PER", year: 2019, origin: "CN", amount_musd: 50, n_events: 1, swap_musd: 500, undocumented_musd: 0 },
      { iso3: "PER", year: 2019, origin: "US", amount_musd: 10, n_events: 1, swap_musd: 0, undocumented_musd: 0 },
      { iso3: "ARG", year: 2019, origin: "CN", amount_musd: 999, n_events: 9, swap_musd: 0, undocumented_musd: 0 },
    ], scope);
    expect(f).toEqual([{ year: 2019, CN: { amount: 150, swap: 500, n: 3, countries: 2 }, US: { amount: 10, swap: 0, n: 1, countries: 1 } }]);
  });
  it("averages votes and the index lean over the countries that carry both actors", () => {
    const comp = { components: [
      { c: "CHL", y: 2020, a: "CN", k: "diplomatic_alignment", raw: 0.8, norm: 80, ok: true, note: null },
      { c: "CHL", y: 2020, a: "US", k: "diplomatic_alignment", raw: 0.4, norm: 40, ok: true, note: null },
      { c: "PER", y: 2020, a: "CN", k: "diplomatic_alignment", raw: 0.6, norm: 60, ok: true, note: null },
      { c: "PER", y: 2020, a: "CN", k: "trade_export_share", raw: 0.5, norm: 50, ok: true, note: null },
    ] } as unknown as ComponentsFile;
    expect(votesByYear(comp, scope)).toEqual([{ year: 2020, CN: 0.8, US: 0.4, n: 1 }]);
    const idx = [
      { iso3: "CHL", year: 2020, actor: "CN", mineral: "all", value: 60, index: "composite" },
      { iso3: "CHL", year: 2020, actor: "US", mineral: "all", value: 20, index: "composite" },
      { iso3: "PER", year: 2020, actor: "CN", mineral: "all", value: 10, index: "composite" },
      { iso3: "PER", year: 2020, actor: "US", mineral: "all", value: 30, index: "composite" },
      { iso3: "MEX", year: 2020, actor: "CN", mineral: "all", value: 50, index: "composite" },
      { iso3: "CHL", year: 2020, actor: "CN", mineral: "all", value: 90, index: "economic_ties" },
    ] as unknown as IndexRow[];
    const l = leanByYear(idx, scope);
    expect(l).toEqual([{ year: 2020, net: 10, CN: 35, US: 25, n: 2, lean_cn: 1, lean_us: 1 }]);
    expect(latestYear([{ year: 2019, n: 5 }, { year: 2020, n: 2 }, { year: 2021, n: 1 }], 2021)).toEqual({ year: 2019, n: 5 });
    expect(latestYear([], 2021)).toBeNull();
  });

  it("reads the inward positions per counterpart and recomputes a narrower scope from the positions", () => {
    const file = {
      positions: [
        { iso3: "CHL", counterpart: "CHN", year: 2023, direction: "inward", basis: "reported", musd: 900 },
        { iso3: "PER", counterpart: "CHN", year: 2023, direction: "inward", basis: "reported", musd: 1000 },
        { iso3: "ARG", counterpart: "CHN", year: 2023, direction: "inward", basis: "reported", musd: 5000 },
        { iso3: "CHL", counterpart: "CHN", year: 2023, direction: "inward", basis: "derived", musd: 1600 },
        { iso3: "CHL", counterpart: "USA", year: 2023, direction: "inward", basis: "reported", musd: 28000 },
      ],
      region: [
        { year: 2023, counterpart: "CHN", basis: "reported", musd: 6900, n: 3, countries: ["ARG", "CHL", "PER"] },
        { year: 2023, counterpart: "CHN", basis: "derived", musd: 1600, n: 1, countries: ["CHL"] },
        { year: 2023, counterpart: "USA", basis: "reported", musd: 28000, n: 1, countries: ["CHL"] },
      ],
    } as unknown as InvestmentFile;
    expect(investmentByYear(file, new Set(["ARG", "CHL", "PER"]))[0]).toMatchObject({ year: 2023, CN: 6900, CN_derived: 1600, US: 28000, n_cn: 3, n_us: 1, HK: null });
    expect(investmentByYear(file, scope)[0]).toMatchObject({ CN: 1900, n_cn: 2 }); // ARG is outside the toy scope: recomputed from the positions
  });
});
