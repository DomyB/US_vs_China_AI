import { describe, expect, it } from "vitest";
import { buildIndexLookup, clearDataCache, indexKey, loadInsights, mapValue } from "@/lib/data";
import type { IndexRow } from "@/lib/types";

const rows: IndexRow[] = [
  { iso3: "ARG", year: 2020, actor: "US", mineral: "all", value: 40, lower: 35, upper: 45 },
  { iso3: "ARG", year: 2020, actor: "CN", mineral: "all", value: 55, lower: 50, upper: 60 },
  { iso3: "ARG", year: 2020, actor: "US", mineral: "lithium", value: 30, lower: 25, upper: 35 },
];

describe("index lookup", () => {
  const lookup = buildIndexLookup(rows);
  it("keys rows by country, year, actor and mineral", () => {
    expect(lookup.get(indexKey("ARG", 2020, "US", "all"))?.value).toBe(40);
  });
  it("returns the single-actor value in actor mode", () => {
    expect(mapValue(lookup, "ARG", 2020, "US", "all")).toBe(40);
    expect(mapValue(lookup, "ARG", 2020, "CN", "all")).toBe(55);
  });
  it("returns China minus US in both mode", () => {
    expect(mapValue(lookup, "ARG", 2020, "both", "all")).toBe(15);
  });
  it("returns null when either side is missing instead of estimating", () => {
    expect(mapValue(lookup, "ARG", 2020, "both", "lithium")).toBeNull();
    expect(mapValue(lookup, "BRA", 2020, "US", "all")).toBeNull();
  });
});

describe("loadInsights", () => {
  it("returns null when the real file is absent instead of a sample", async () => {
    const orig = globalThis.fetch;
    globalThis.fetch = (async () => ({ ok: false, status: 404, json: async () => ({}) })) as unknown as typeof fetch;
    try {
      clearDataCache();
      expect(await loadInsights()).toBeNull();
    } finally {
      globalThis.fetch = orig;
    }
  });

  it("asks the server once per page load, revalidating rather than forcing the cache, and does not memoise a failure", async () => {
    const orig = globalThis.fetch;
    const calls: { path: string; init: RequestInit | undefined }[] = [];
    let status = 500;
    globalThis.fetch = (async (path: string, init?: RequestInit) => {
      calls.push({ path, init });
      return { ok: status === 200, status, json: async () => ({ countries: [{ iso3: "CHL" }], findings: [] }) };
    }) as unknown as typeof fetch;
    try {
      clearDataCache();
      expect(await loadInsights()).toBeNull();
      status = 200;
      expect((await loadInsights())?.countries).toHaveLength(1);
      await loadInsights();
      expect(calls.map((c) => c.path)).toEqual(["/data/real/insights.json", "/data/real/insights.json"]);
      expect(calls.every((c) => c.init?.cache === undefined)).toBe(true);
    } finally {
      globalThis.fetch = orig;
      clearDataCache();
    }
  });
});
