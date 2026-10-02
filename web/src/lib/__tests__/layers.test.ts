import { describe, expect, it } from "vitest";
import { mergeRealLayers } from "@/lib/data";
import type { CountryCoverage, CountryData, RealMediaFile, RealParliamentFile } from "@/lib/types";

const sample = () =>
  ({
    name: "Brazil",
    freshness: {},
    actions: { events: [], trade: [] },
    parliament: { documents: [{ id: "s1", date: "2020-01-01", stance_us: 1, stance_cn: -1 }], stance_series: [{ year: 2020, stance_us_mean: 0.4, stance_cn_mean: -0.2, n_docs: 3 }] },
    media: { volume: [{ year: 2020 }], narratives: [{ year: 2020, label: "x", share: 1 }], articles: [{ id: "a1" }] },
  }) as unknown as CountryData;

const cov: CountryCoverage = {
  trade_years: [], mirror_years: [], events: 0, contracts: 0, governance: 0, production: 0, actions: false, governance_available: false,
  parliament_available: true, parliament_documents: 1, parliament_votes: 1, parliament_from: 2024, parliament_note: null,
  media_available: true, media_articles: 1, media_from: 2026, concessions: 0,
};
const parliament = { dataset: "REAL", iso3: "BRA", generated_on: "2026-10-02", documents: [{ id: "r1", date: "2024-07-04", stance_us: null, stance_cn: null, title_en: null, topic_minerals: [], vote: null }], freshness: { last_updated: "2026-10-02", source_ids: ["bra_camara_api"], schedule: "monthly" } } as unknown as RealParliamentFile;
const media = { dataset: "REAL", iso3: "BRA", generated_on: "2026-10-02", articles: [{ id: "n1", date: "2026-10-01", tone: null }], outlets: {}, freshness: { last_updated: "2026-10-02", source_ids: ["bra_folha"], schedule: "weekly" } } as unknown as RealMediaFile;

describe("mergeRealLayers", () => {
  it("replaces only the record lists for parliament and media and marks them facts_only", () => {
    const out = mergeRealLayers(sample(), cov, null, parliament, media);
    expect(out.layers?.parliament).toBe("facts_only");
    expect(out.layers?.media).toBe("facts_only");
    expect(out.parliament.documents[0].id).toBe("r1");
    expect(out.parliament.stance_series[0].n_docs).toBe(3); // stance series stays sample
    expect(out.media.articles[0].id).toBe("n1");
    expect(out.media.narratives[0].label).toBe("x");
    expect(out.layers?.actions).toBe("sample");
    expect(out.freshness.parliament?.source_ids).toEqual(["bra_camara_api"]);
  });
  it("keeps everything sample and carries the note when a legislature has no structured records", () => {
    const out = mergeRealLayers(sample(), { ...cov, parliament_available: false, media_available: false, parliament_note: "PDF only" }, null, null, null);
    expect(out.layers?.parliament).toBe("sample");
    expect(out.parliament.documents[0].id).toBe("s1");
    expect(out.parliament_note).toBe("PDF only");
  });
  it("returns the sample untouched without coverage", () => {
    const out = mergeRealLayers(sample(), undefined, null, null, null);
    expect(out.layers?.parliament).toBe("sample");
    expect(out.parliament_note).toBeUndefined();
  });
});
