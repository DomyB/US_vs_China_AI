import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { CountryData, IndexFile, Meta, SourcesFile } from "@/lib/types";

const DATA = path.resolve(__dirname, "../../../public/data");
const read = <T,>(p: string) => JSON.parse(readFileSync(path.join(DATA, p), "utf-8")) as T;

describe("sample dataset contract", () => {
  const meta = read<Meta>("sample/meta.json");
  const index = read<IndexFile>("sample/index.json");
  const sources = read<SourcesFile>("sources.json");
  const sourceIds = new Set(sources.sources.map((s) => s.id));

  it("is labelled as sample data everywhere", () => {
    expect(meta.dataset).toBe("SAMPLE DATA");
    expect(index.dataset).toBe("SAMPLE DATA");
  });
  it("covers 2008 to 2026 for 12 countries and both actors", () => {
    expect(meta.years[0]).toBe(2008);
    expect(meta.years[meta.years.length - 1]).toBe(2026);
    expect(meta.countries.filter((c) => c.in_scope)).toHaveLength(12);
    const isos = new Set(index.rows.map((r) => r.iso3));
    expect(isos.size).toBe(12);
    expect(new Set(index.rows.map((r) => r.actor))).toEqual(new Set(["US", "CN"]));
  });
  it("keeps index values and bands inside 0 to 100", () => {
    for (const r of index.rows) {
      expect(r.lower).toBeLessThanOrEqual(r.value);
      expect(r.value).toBeLessThanOrEqual(r.upper);
      expect(r.lower).toBeGreaterThanOrEqual(0);
      expect(r.upper).toBeLessThanOrEqual(100);
    }
  });
  it("links every sourced row to a registry entry", () => {
    const files = readdirSync(path.join(DATA, "sample/country"));
    expect(files).toHaveLength(12);
    for (const f of files) {
      const c = read<CountryData>(`sample/country/${f}`);
      expect(c.dataset).toBe("SAMPLE DATA");
      for (const e of c.actions.events) expect(sourceIds.has(e.source.id)).toBe(true);
      for (const t of c.actions.trade) expect(t.source && sourceIds.has(t.source.id)).toBe(true);
      for (const fl of c.analysis.flags) for (const ev of fl.evidence) expect(sourceIds.has(ev.id)).toBe(true);
      for (const d of c.parliament.documents) expect(d.title_original.length).toBeGreaterThan(0);
    }
  });
  it("freshness entries reference known sources", () => {
    for (const f of Object.values(meta.freshness)) for (const id of f.source_ids) expect(sourceIds.has(id)).toBe(true);
  });
});
