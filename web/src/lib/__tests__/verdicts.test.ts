import { describe, expect, it } from "vitest";
import { tally, verdicts } from "../verdicts";

describe("who is winning, measure by measure", () => {
  it("names the actor each measure favours from the latest year and counts the open ones", () => {
    const vs = verdicts({
      trade: [{ year: 2024, CN: 60, US: 10, WLD: 100, n: 5, n_cn: 4, n_us: 5, share_cn: 0.6, share_us: 0.1 }],
      finance: [{ year: 2015, CN: { amount: 1000, swap: 0, n: 2, countries: 2 }, US: { amount: 100, swap: 0, n: 1, countries: 1 } }],
      votes: [{ year: 2024, CN: 0.7, US: 0.4, n: 10 }],
      lean: [{ year: 2024, net: -3, CN: 20, US: 23, n: 8, lean_cn: 3, lean_us: 5 }],
      investment: [{ year: 2023, CN: 1000, HK: 500, US: 20000, CN_derived: null, US_derived: null, n_cn: 3, n_us: 3 }],
    }, { trade: 2024, finance_CN: 2021 }, 2026);
    expect(vs.map((v) => [v.id, v.favours])).toEqual([["trade", "CN"], ["finance", "CN"], ["investment", "US"], ["votes", "CN"], ["index", "US"]]);
    expect(vs[0].statement).toContain("60%");
    expect(tally(vs)).toEqual({ CN: 3, US: 2, open: 0 });
    const none = verdicts({ trade: [], finance: [], votes: [], lean: [], investment: [] }, { trade: null, finance_CN: null }, 2026);
    expect(none.map((v) => v.favours)).toEqual(["unknown", "unknown"]);
  });
});
