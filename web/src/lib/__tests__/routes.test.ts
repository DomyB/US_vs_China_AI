import { describe, expect, it } from "vitest";
import { destinationsFor, economyName, indirectByYear, indirectFor, latestRouteYear, originsFor, type RoutesFile } from "../routes";

const file: RoutesFile = {
  dataset: "REAL", generated_on: "2026-10-13", layer: "facts", value_type: "reconciled", source_id: "cepii_baci",
  years: [2019, 2020], minerals: ["all", "copper"], buyers: ["USA", "CHN"], intermediaries: ["CAN"],
  origins: [
    { buyer: "USA", year: 2020, mineral: "copper", origin: "CAN", musd: 900, in_scope: false },
    { buyer: "USA", year: 2020, mineral: "copper", origin: "CHL", musd: 500, in_scope: true },
    { buyer: "USA", year: 2020, mineral: "copper", origin: "PER", musd: 100, in_scope: true },
    { buyer: "USA", year: 2020, mineral: "copper", origin: "ROW", musd: 70, in_scope: false },
    { buyer: "USA", year: 2020, mineral: "copper", origin: "WLD", musd: 1570, in_scope: false },
    { buyer: "USA", year: 2019, mineral: "copper", origin: "CHL", musd: 400, in_scope: true },
    { buyer: "USA", year: 2019, mineral: "copper", origin: "WLD", musd: 1000, in_scope: false },
    { buyer: "CHN", year: 2020, mineral: "copper", origin: "CHL", musd: 1000, in_scope: true },
  ],
  destinations: [
    { year: 2020, mineral: "copper", dest: "CHN", musd: 1400, n: 2, buyer: true, in_scope: false },
    { year: 2020, mineral: "copper", dest: "CAN", musd: 800, n: 2, buyer: false, in_scope: false },
    { year: 2020, mineral: "copper", dest: "ROW", musd: 300, n: 2, buyer: false, in_scope: false },
    { year: 2020, mineral: "copper", dest: "WLD", musd: 2500, n: 2, buyer: false, in_scope: false },
  ],
  country_destinations: [],
  via: [
    { iso3: "CAN", mineral: "copper", year: 2020, from_region_musd: 800, imports_wld_musd: 850, to_US_musd: 900, to_CN_musd: null, exports_wld_musd: 1000, from: { CHL: 800 } },
    { iso3: "CAN", mineral: "copper", year: 2019, from_region_musd: 300, imports_wld_musd: null, to_US_musd: 200, to_CN_musd: null, exports_wld_musd: null, from: { CHL: 300 } },
    { iso3: "DEU", mineral: "copper", year: 2020, from_region_musd: 50, imports_wld_musd: 500, to_US_musd: null, to_CN_musd: 10, exports_wld_musd: 100, from: { CHL: 50 } },
  ],
  note: "",
};

describe("routes", () => {
  it("ranks origins and destinations and keeps the rest of the world and the world apart", () => {
    expect(latestRouteYear(file, "USA", "copper")).toBe(2020);
    expect(latestRouteYear(file, "CHN", "copper")).toBeNull(); // no world total for China
    const o = originsFor(file, "USA", "copper", 2020);
    expect(o.named.map((r) => r.origin)).toEqual(["CAN", "CHL", "PER"]);
    expect(o.rest?.musd).toBe(70);
    expect(o.world?.musd).toBe(1570);
    const d = destinationsFor(file, "copper", 2020);
    expect(d.named.map((r) => r.dest)).toEqual(["CHN", "CAN"]);
    expect(d.world?.n).toBe(2);
    expect(economyName("CAN")).toBe("Canada");
    expect(economyName("XKX")).toBe("XKX");
  });
  it("bounds the indirect route by the smaller leg and sums the direct origins", () => {
    const i = indirectFor(file, "USA", "copper", 2020);
    expect(i.direct).toBe(600);
    expect(i.world).toBe(1570);
    expect(i.legs.map((l) => l.iso3)).toEqual(["CAN", "DEU"]);
    const can = i.legs[0];
    expect(can.bound).toBe(800); // took 800, sold 900: at most 800 could have passed through
    expect(can.region_share).toBeCloseTo(800 / 850, 6);
    expect(i.legs[1].bound).toBeNull(); // Germany sold nothing to the United States in these codes
    expect(i.bound_total).toBe(800);
    // for China the same German leg has a second leg, and the direct figure is Chile's sale
    const c = indirectFor(file, "CHN", "copper", 2020);
    expect(c.direct).toBe(1000);
    expect(c.world).toBeNull();
    expect(c.legs.find((l) => l.iso3 === "DEU")?.bound).toBe(10);
    const s = indirectByYear(file, "USA", "copper");
    expect(s.map((y) => [y.year, y.direct, y.bound_total])).toEqual([[2019, 400, 200], [2020, 600, 800]]);
  });
});
