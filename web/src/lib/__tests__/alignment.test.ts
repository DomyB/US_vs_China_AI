import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { correlation, correlationByYear, firstYear, latestFullYear, leanPoints, meanLeans, movers, pearson, quadrant, sideWord, trajectories, withBoth, yearSplit } from "../alignment";
import type { IndexFile, IndexRow } from "../types";

const row = (iso3: string, year: number, actor: "CN" | "US", index: IndexRow["index"], value: number | null): IndexRow =>
  ({ iso3, year, actor, mineral: "all", value: value as number, lower: null, upper: null, index }) as IndexRow;

const rows: IndexRow[] = [
  // Chile 2000: economic lean −2, political +56
  row("CHL", 2000, "CN", "economic_ties", 4), row("CHL", 2000, "US", "economic_ties", 6),
  row("CHL", 2000, "CN", "political_alignment", 90), row("CHL", 2000, "US", "political_alignment", 34),
  row("CHL", 2000, "CN", "composite", 25), row("CHL", 2000, "US", "composite", 13),
  // Chile 2024: economic +29, political +41
  row("CHL", 2024, "CN", "economic_ties", 40), row("CHL", 2024, "US", "economic_ties", 11),
  row("CHL", 2024, "CN", "political_alignment", 75), row("CHL", 2024, "US", "political_alignment", 34),
  // Argentina 2024: economic +11, political −33
  row("ARG", 2024, "CN", "economic_ties", 20), row("ARG", 2024, "US", "economic_ties", 9),
  row("ARG", 2024, "CN", "political_alignment", 32), row("ARG", 2024, "US", "political_alignment", 65),
  // Uruguay 2024: economic −33, political +34
  row("URY", 2024, "CN", "economic_ties", 5), row("URY", 2024, "US", "economic_ties", 38),
  row("URY", 2024, "CN", "political_alignment", 70), row("URY", 2024, "US", "political_alignment", 36),
  // Paraguay 2024: only one actor on the political side → no political lean
  row("PRY", 2024, "CN", "economic_ties", 3), row("PRY", 2024, "US", "economic_ties", 15),
  row("PRY", 2024, "CN", "political_alignment", 50),
  // a per-mineral row and a held composite are ignored
  { ...row("CHL", 2024, "CN", "composite", 70), mineral: "lithium" },
  row("CHL", 2025, "US", "composite", null),
];

describe("lean points", () => {
  it("reads China minus US per index from the all-minerals rows, null where an actor is missing", () => {
    const pts = leanPoints(rows);
    const chl24 = pts.find((p) => p.iso3 === "CHL" && p.year === 2024)!;
    expect(chl24).toMatchObject({ name: "Chile", economic: 29, political: 41, composite: null });
    const pry = pts.find((p) => p.iso3 === "PRY")!;
    expect(pry.economic).toBe(-12);
    expect(pry.political).toBeNull();
    expect(pts.find((p) => p.year === 2025)).toBeUndefined();
    expect(withBoth(pts).map((p) => p.iso3 + p.year)).toEqual(["ARG2024", "CHL2000", "CHL2024", "URY2024"]);
  });
  it("treats rows without an index field as composite", () => {
    const old = [{ ...row("BOL", 2010, "CN", undefined, 30) }, { ...row("BOL", 2010, "US", undefined, 20) }];
    expect(leanPoints(old)[0]).toMatchObject({ composite: 10, economic: null, political: null });
  });
});

describe("correlation", () => {
  it("is Pearson's r, null below three pairs or without variance", () => {
    expect(pearson([[1, 2], [2, 4], [3, 6]])).toBeCloseTo(1, 6);
    expect(pearson([[1, 6], [2, 4], [3, 2]])).toBeCloseTo(-1, 6);
    expect(pearson([[1, 1], [2, 2]])).toBeNull();
    expect(pearson([[1, 1], [1, 2], [1, 3]])).toBeNull();
    const c = correlation(withBoth(leanPoints(rows)));
    expect(c).toMatchObject({ n: 4, countries: 3, from: 2000, to: 2024 });
    expect(c.r).not.toBeNull();
    const by = correlationByYear(withBoth(leanPoints(rows)));
    expect(by.map((b) => [b.year, b.n])).toEqual([[2000, 1], [2024, 3]]);
    expect(by[0].r).toBeNull();
  });
});

describe("quadrants, splits and movers", () => {
  it("places a country by the sign of each lean with a dead band", () => {
    expect(quadrant(29, 41)).toBe("both_china");
    expect(quadrant(-20, -10)).toBe("both_us");
    expect(quadrant(11, -33)).toBe("sell_china_vote_us");
    expect(quadrant(-33, 34)).toBe("vote_china_sell_us");
    expect(quadrant(2, 50)).toBe("mixed");
    expect(quadrant(2, -50, 1)).toBe("sell_china_vote_us");
    expect(sideWord(11, "economic")).toBe("sells to China");
    expect(sideWord(-33, "political")).toBe("votes with the United States");
    expect(sideWord(3, "political")).toBe("votes in between");
  });
  it("splits a year and lists each quadrant's countries", () => {
    const s = yearSplit(withBoth(leanPoints(rows)), 2024);
    expect(s).toMatchObject({ year: 2024, n: 3, same: 1, opposite: 2, mixed: 0 });
    expect(s.byQuadrant.sell_china_vote_us.map((p) => p.name)).toEqual(["Argentina"]);
    expect(s.byQuadrant.vote_china_sell_us.map((p) => p.name)).toEqual(["Uruguay"]);
  });
  it("measures how far the two leans moved apart between two years", () => {
    const m = movers(withBoth(leanPoints(rows)), 2000, 2024);
    expect(m).toHaveLength(1);
    expect(m[0]).toMatchObject({ iso3: "CHL", dEconomic: 31, dPolitical: -15, divergence: -46, quadrantFrom: "mixed", quadrantTo: "both_china" });
  });
  it("averages each year's leans over the countries that have them", () => {
    const m = meanLeans(leanPoints(rows));
    expect(m.map((x) => x.year)).toEqual([2000, 2024]);
    expect(m[1]).toMatchObject({ nEconomic: 4, nPolitical: 3 });
    expect(m[1].economic).toBeCloseTo((29 + 11 - 33 - 12) / 4, 6);
    expect(m[1].political).toBeCloseTo((41 - 33 + 34) / 3, 6);
  });
  it("builds trajectories and finds the first and the latest full year", () => {
    const t = trajectories(leanPoints(rows));
    expect(t.map((x) => x.name)).toEqual(["Argentina", "Chile", "Paraguay", "Uruguay"]);
    expect(t[1].series.map((p) => p.year)).toEqual([2000, 2024]);
    const both = withBoth(leanPoints(rows));
    expect(firstYear(both)).toBe(2000);
    expect(latestFullYear(both, 3)).toBe(2024);
    expect(latestFullYear(both, 4)).toBeNull();
  });
});

describe("the committed export", () => {
  it("carries both sub-indices for every country in the latest full year, and the correlation is weak", () => {
    const file = JSON.parse(readFileSync(resolve(__dirname, "../../../public/data/real/index.json"), "utf8")) as IndexFile;
    const both = withBoth(leanPoints(file.rows));
    const latest = latestFullYear(both);
    expect(latest).not.toBeNull();
    expect(yearSplit(both, latest!).n).toBeGreaterThanOrEqual(10);
    const c = correlation(both);
    expect(c.n).toBeGreaterThan(200);
    expect(Math.abs(c.r!)).toBeLessThan(0.5);
  });
});
