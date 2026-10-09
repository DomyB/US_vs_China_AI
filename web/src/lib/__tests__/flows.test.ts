import { describe, expect, it } from "vitest";
import { aggregateFlows, arcPoints, describeFlow, flowBounds, flowsToGeoJSON, hexToRgba, spanYears, widthScale } from "@/components/map/flows";
import { ACTOR_ANCHOR } from "@/lib/constants";
import type { FlowsFile } from "@/lib/types";

const file: FlowsFile = {
  dataset: "TEST",
  generated_on: "2026-10-09",
  meta: { last_year: { finance_CN: 2021, finance_US: 2024, trade: 2025 } },
  finance: [
    { iso3: "PER", year: 2014, origin: "CN", amount_musd: 7000, n_events: 3, n_with_amount: 2, n_undocumented: 0, undocumented_musd: 0, n_swap: 0, swap_musd: 0, source_ids: ["aiddata_gcdf"] },
    { iso3: "PER", year: 2015, origin: "CN", amount_musd: 0, n_events: 2, n_with_amount: 0, n_undocumented: 1, undocumented_musd: 50, n_swap: 0, swap_musd: 0, source_ids: ["aiddata_gcdf"] },
    { iso3: "PER", year: 2015, origin: "US", amount_musd: 120, n_events: 1, n_with_amount: 1, n_undocumented: 0, undocumented_musd: 0, n_swap: 0, swap_musd: 0, source_ids: ["dfc_projects"] },
    { iso3: "ARG", year: 2015, origin: "CN", amount_musd: 0, n_events: 1, n_with_amount: 0, n_undocumented: 0, undocumented_musd: 0, n_swap: 1, swap_musd: 11000, source_ids: ["aiddata_gcdf"] },
  ],
  trade: [
    { iso3: "PER", year: 2015, mineral: "all", exports_musd: { US: 1000, CN: 6000, ROW: 3000 }, source_id: "un_comtrade" },
    { iso3: "PER", year: 2015, mineral: "copper", exports_musd: { US: 400, CN: 4000, ROW: 1600 }, source_id: "un_comtrade" },
    { iso3: "PER", year: 2014, mineral: "all", exports_musd: { US: 900, CN: null, ROW: null }, source_id: "un_comtrade" },
  ],
};
const names = { PER: "Peru", ARG: "Argentina" };
const sourceNames = { aiddata_gcdf: { name: "AidData GCDF" }, dfc_projects: { name: "DFC" }, un_comtrade: { name: "UN Comtrade" } };
const centroids: Record<string, [number, number]> = { PER: [-75.0, -10.0], ARG: [-64.0, -34.0] };

describe("flow windows and aggregation", () => {
  it("builds the year window", () => {
    expect(spanYears(2015, "1")).toEqual([2015, 2015]);
    expect(spanYears(2015, "3")).toEqual([2013, 2015]);
    expect(spanYears(2009, "3")).toEqual([2008, 2009]);
    expect(spanYears(2015, "all")).toEqual([2008, 2015]);
  });
  it("sums money over the window per origin and keeps the no-amount case visible", () => {
    const a = aggregateFlows(file, "money", 2015, "3", "all");
    const perCn = a.find((x) => x.iso3 === "PER" && x.actor === "CN")!;
    expect(perCn.amount).toBe(7000);
    expect(perCn.n).toBe(5);
    expect(perCn.nAmount).toBe(2);
    expect(perCn.nUndocumented).toBe(1);
    const argCn = a.find((x) => x.iso3 === "ARG")!;
    expect(argCn.amount).toBe(0);
    expect(argCn.swap).toBe(11000);
    const d = describeFlow(argCn, "money", names, sourceNames);
    expect(d.title).toBe("China → Argentina");
    expect(d.detail).toContain("no documented commitment with a published amount");
    expect(d.detail).toContain("swap-line drawdowns of US$ 11 bn shown apart");
    expect(d.detail).toContain("AidData GCDF");
  });
  it("sums trade for the chosen mineral and skips missing partners", () => {
    const a = aggregateFlows(file, "trade", 2015, "3", "all");
    expect(a.find((x) => x.actor === "CN")!.amount).toBe(6000);
    expect(a.find((x) => x.actor === "US")!.amount).toBe(1900);
    expect(a.find((x) => x.actor === "US")!.n).toBe(2);
    expect(aggregateFlows(file, "trade", 2015, "1", "copper").find((x) => x.actor === "CN")!.amount).toBe(4000);
    expect(aggregateFlows(file, "index", 2015, "1", "all")).toEqual([]);
  });
  it("scales widths with the square root of the amount, never below one pixel", () => {
    const w = widthScale(10000);
    expect(w(0)).toBe(1);
    expect(w(10000)).toBe(9);
    expect(w(2500)).toBeCloseTo(1.5 + 7.5 * 0.5, 2);
  });
});

describe("arcs", () => {
  it("runs west across the Pacific to Beijing on the neighbouring world copy", () => {
    const pts = arcPoints(centroids.PER, ACTOR_ANCHOR.CN, 48, true);
    expect(pts[0]).toEqual([-75, -10]);
    expect(pts[pts.length - 1][0]).toBeCloseTo(116.4 - 360, 3);
    for (let i = 1; i < pts.length; i++) expect(pts[i][0]).toBeLessThan(pts[i - 1][0]);
    expect(Math.max(...pts.map((p) => p[1]))).toBeGreaterThan(39.9);
  });
  it("keeps the US arc on the main copy", () => {
    const pts = arcPoints(centroids.PER, ACTOR_ANCHOR.US);
    expect(pts[pts.length - 1]).toEqual([-77.04, 38.9]);
    expect(Math.min(...pts.map((p) => p[0]))).toBeGreaterThan(-180);
  });
  it("orients features by flow direction, dims unselected countries and reports bounds", () => {
    const aggs = aggregateFlows(file, "money", 2015, "3", "all");
    const fc = flowsToGeoJSON(aggs, "money", centroids, ACTOR_ANCHOR, new Set(["PER"]), names, sourceNames);
    const perCn = fc.features.find((f) => f.properties.id === "PER-CN")!;
    expect(perCn.geometry.coordinates[0][0]).toBeCloseTo(116.4 - 360, 3); // money starts at the lender
    expect(perCn.properties.dim).toBe(false);
    expect(fc.features.find((f) => f.properties.iso3 === "ARG")!.properties.dim).toBe(true);
    const tr = flowsToGeoJSON(aggregateFlows(file, "trade", 2015, "1", "all"), "trade", centroids, ACTOR_ANCHOR, new Set(), names, sourceNames);
    expect(tr.features[0].geometry.coordinates[0]).toEqual([-75, -10]); // trade starts at the country
    const b = flowBounds(fc)!;
    expect(b[0][0]).toBeCloseTo(116.4 - 360, 3);
    expect(b[1][0]).toBeGreaterThan(-80);
    expect(flowBounds({ type: "FeatureCollection", features: [] })).toBeNull();
  });
  it("converts hex to rgba", () => {
    expect(hexToRgba("#4f8fdc", 0.5)).toBe("rgba(79, 143, 220, 0.5)");
    expect(hexToRgba("#fff", 1)).toBe("rgba(255, 255, 255, 1)");
  });
});
