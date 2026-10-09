import { describe, expect, it } from "vitest";
import { blendPath, echoPath, financeRaw, leversFromParams, leversToParams, normalise, parityGap, recomputeIndex, tradeWhatIf, yearlyAverage } from "@/lib/scenario";
import type { ForecastPoint, InsightComponent, InsightTradeLatest } from "@/lib/types";

const pt = (year: number, v: number): ForecastPoint => ({ year, point: v, p05: v - 0.1, p25: v - 0.05, p75: v + 0.05, p95: v + 0.1 });
const paths = { baseline: [pt(2029, 0.5), pt(2030, 0.5)], china_pull: [pt(2029, 0.58), pt(2030, 0.6)], us_reshoring: [pt(2029, 0.42), pt(2030, 0.4)] };

describe("blendPath", () => {
  it("reproduces the published scenarios at the ends and the baseline in the middle", () => {
    expect(blendPath(paths, 0)).toEqual(paths.baseline);
    expect(blendPath(paths, 1)).toEqual(paths.china_pull);
    expect(blendPath(paths, -1)).toEqual(paths.us_reshoring);
  });
  it("interpolates every quantile linearly", () => {
    const half = blendPath(paths, 0.5);
    expect(half[1].point).toBeCloseTo(0.55);
    expect(half[1].p95).toBeCloseTo(0.65);
    expect(blendPath(paths, -0.25)[1].point).toBeCloseTo(0.475);
  });
  it("falls back to the baseline when a scenario is missing", () => {
    expect(blendPath({ baseline: paths.baseline }, 1)).toEqual(paths.baseline);
    expect(blendPath(undefined, 1)).toEqual([]);
  });
});

describe("echoPath", () => {
  it("adds the family's mean from the chosen year on, clamped to the bounds", () => {
    const e = echoPath(paths.baseline, { mean: 0.6, p25: -0.1, p75: 0.2 }, 2030);
    expect(e).toEqual([{ year: 2030, point: 1, lo: 0.4, hi: 0.7 }]);
    expect(echoPath(paths.baseline, null, 2029)).toEqual([]);
  });
});

const trade: InsightTradeLatest = {
  year: 2025, exports_musd: { US: 100, CN: 900, ROW: 1000 }, total_musd: 2000, share_cn: 0.45, share_us: 0.05, source_id: "un_comtrade",
  minerals: [{ mineral: "copper", exports_musd: { US: 50, CN: 800, ROW: 150 }, total_musd: 1000 }, { mineral: "gold", exports_musd: { US: 50, CN: 100, ROW: 850 }, total_musd: 1000 }],
};

describe("tradeWhatIf", () => {
  it("leaves the shares alone without levers", () => {
    const w = tradeWhatIf(trade, { divertMineral: null, divertPct: 0, divertTo: "US", pricePct: 0 }, "copper");
    expect(w.share_cn).toBeCloseTo(0.45);
    expect(w.moved_musd).toBe(0);
    expect(w.gap_musd).toBe(400);
  });
  it("moves a share of the mineral's exports to China and reports parity", () => {
    const w = tradeWhatIf(trade, { divertMineral: "copper", divertPct: 0.5, divertTo: "US", pricePct: 0 }, null);
    expect(w.moved_musd).toBe(400);
    expect(w.exports).toEqual({ US: 500, CN: 500, ROW: 1000 });
    expect(w.parity).toBe(true);
    expect(w.share_us).toBeCloseTo(0.25);
    const r = tradeWhatIf(trade, { divertMineral: "copper", divertPct: 0.5, divertTo: "ROW", pricePct: 0 }, null);
    expect(r.exports).toEqual({ US: 100, CN: 500, ROW: 1400 });
  });
  it("revalues the priced mineral at constant volumes before the redirect", () => {
    const w = tradeWhatIf(trade, { divertMineral: "copper", divertPct: 0.25, divertTo: "US", pricePct: 50 }, "copper");
    expect(w.price_delta).toEqual({ US: 25, CN: 400, ROW: 75 });
    expect(w.moved_musd).toBe(300); // a quarter of the revalued 1,200 to China
    expect(w.exports.CN).toBe(1000);
    expect(w.total_musd).toBe(2500);
  });
  it("parity gap is half the difference, zero when the United States is ahead", () => {
    expect(parityGap(900, 100)).toBe(400);
    expect(parityGap(100, 900)).toBe(0);
  });
});

describe("recomputeIndex", () => {
  const scales = { trade_export_share: { lo: 0, hi: 1 }, finance_flow: { lo: 0, hi: 0.1 } };
  const comps: InsightComponent[] = [
    { name: "trade_export_share", raw_value: 0.45, normalized_value: 45, available: true, note: null },
    { name: "trade_import_share", raw_value: 0.1, normalized_value: 10, available: true, note: null },
    { name: "finance_flow", raw_value: null, normalized_value: null, available: false, note: "source coverage ends 2021" },
    { name: "diplomatic_alignment", raw_value: 0.7, normalized_value: 65, available: true, note: null },
  ];
  it("reproduces the published value with no overrides", () => {
    const r = recomputeIndex(comps, {}, scales);
    expect(r.value).toBeCloseTo(40);
    expect(r.n).toBe(3);
    expect(r.changed).toEqual([]);
  });
  it("normalises an override with the pipeline's bounds and fills an unavailable component", () => {
    const r = recomputeIndex(comps, { trade_export_share: 0.25, finance_flow: 0.05 }, scales);
    expect(r.value).toBeCloseTo((25 + 10 + 50 + 65) / 4);
    expect(r.changed).toEqual(["trade_export_share", "finance_flow"]);
    expect(r.n).toBe(4);
  });
  it("refuses fewer than three components", () => {
    expect(recomputeIndex(comps.slice(0, 2), {}, scales).value).toBeNull();
    expect(normalise(2, { lo: 0, hi: 1 })).toBe(100);
  });
});

describe("finance helpers", () => {
  it("turns a yearly amount into the three-year-over-GDP raw value", () => {
    expect(financeRaw(1000, 3e11)).toBeCloseTo(0.01);
    expect(financeRaw(1000, null)).toBeNull();
  });
  it("averages over the whole window, missing years as zero", () => {
    expect(yearlyAverage([{ year: 2015, US: null, CN: 700 }, { year: 2017, US: null, CN: 0 }], "CN", 2015, 2021)).toBeCloseTo(100);
  });
});

describe("levers in the URL", () => {
  it("round-trips the levers and drops defaults", () => {
    const l = { country: "PER", pull: -0.5, shock: "CN:export_control", shockYear: 2028, divertMineral: "copper", divertPct: 0.2, divertTo: "US" as const, cnFin: 2, usFin: 1, pricePct: 30 };
    const p = leversToParams(l);
    expect(p.get("usfin")).toBeNull();
    expect(p.get("divert")).toBe("copper:20:US");
    expect(leversFromParams(p, "CHL")).toEqual(l);
    expect(leversFromParams(new URLSearchParams("pull=7&price=-200"), "CHL")).toMatchObject({ country: "CHL", pull: 1, pricePct: -50, shock: null, divertMineral: null });
  });
});
