import { COUNTRY_COUNT } from "@/lib/constants";
import { describe, expect, it } from "vitest";
import { carriedBy, defaultIndexYear, hasSubIndices, laggingSources, lastIndexedYears, leadLookup, leadSentence, leadSummary, missingIndexNote, noIndexReason, parseIndexName, rowIndex, rowsForIndex } from "@/lib/indexView";
import type { IndexRow } from "@/lib/types";

const composite = (iso3: string, year: number, actor: "US" | "CN", value: number, lead?: Partial<IndexRow>): IndexRow => ({ iso3, year, actor, mineral: "all", value, lower: value - 5, upper: value + 5, n_components: 4, index: "composite", components_available: ["trade_export_share", "trade_import_share", "finance_flow", "diplomatic_alignment"], ...lead });
const sub = (iso3: string, year: number, actor: "US" | "CN", index: "economic_ties" | "political_alignment", value: number): IndexRow => ({ iso3, year, actor, mineral: "all", value, lower: null, upper: null, n_components: 2, index, components_available: [] });

const lead2000 = { lead: "diplomatic_alignment", lead_gap: 56.3, lead_cn: 89.95, lead_us: 33.66 };
const rows: IndexRow[] = [
  composite("CHL", 2000, "CN", 24.8, lead2000),
  composite("CHL", 2000, "US", 11.9, lead2000),
  composite("ARG", 2000, "CN", 21.8, { lead: "diplomatic_alignment", lead_gap: 50, lead_cn: 86, lead_us: 36 }),
  composite("ARG", 2000, "US", 10, { lead: "diplomatic_alignment", lead_gap: 50, lead_cn: 86, lead_us: 36 }),
  composite("BOL", 2000, "CN", 19.2, { lead: "trade_export_share", lead_gap: -30, lead_cn: 2, lead_us: 32 }),
  composite("BOL", 2000, "US", 33.5, { lead: "trade_export_share", lead_gap: -30, lead_cn: 2, lead_us: 32 }),
  composite("CHL", 2024, "CN", 42, { lead: "trade_export_share", lead_gap: 40, lead_cn: 51, lead_us: 11 }),
  composite("CHL", 2024, "US", 12, { lead: "trade_export_share", lead_gap: 40, lead_cn: 51, lead_us: 11 }),
  composite("ARG", 2024, "CN", 30),
  composite("ARG", 2024, "US", 41),
  composite("BOL", 2024, "CN", 20),
  composite("BOL", 2024, "US", 35),
  composite("BRA", 2025, "CN", 36, { lead: "trade_export_share", lead_gap: 40, lead_cn: 50, lead_us: 10 }),
  composite("BRA", 2025, "US", 22, { lead: "trade_export_share", lead_gap: 40, lead_cn: 50, lead_us: 10 }),
  composite("CHL", 2025, "US", 13),
  composite("VEN", 2000, "CN", 15),
  composite("VEN", 2000, "US", 20),
  { iso3: "CHL", year: 2024, actor: "CN", mineral: "copper", value: 40, lower: 35, upper: 45, n_components: 3, index: "composite" },
  sub("CHL", 2000, "CN", "economic_ties", 3.0),
  sub("CHL", 2000, "US", "economic_ties", 4.7),
  sub("ARG", 2000, "CN", "economic_ties", 0.2),
  sub("ARG", 2000, "US", "economic_ties", 0.6),
  sub("CHL", 2000, "CN", "political_alignment", 90),
  sub("CHL", 2000, "US", "political_alignment", 33.7),
];
const lastYear = { trade: 2025, gdp: 2025, unga: 2024, debt_CN: 2024, stance: 2026, finance_US: 2026, finance_CN: 2021 };
/** an older file: composite rows only, none of the new fields */
const oldRows: IndexRow[] = [
  { iso3: "ARG", year: 2020, actor: "US", mineral: "all", value: 40, lower: 35, upper: 45 },
  { iso3: "ARG", year: 2020, actor: "CN", mineral: "all", value: 55, lower: 50, upper: 60 },
];

describe("index rows by index", () => {
  it("reads the index name from the URL with composite as the default", () => {
    expect(parseIndexName("economic_ties")).toBe("economic_ties");
    expect(parseIndexName("political_alignment")).toBe("political_alignment");
    expect(parseIndexName("influence")).toBe("composite");
    expect(parseIndexName(null)).toBe("composite");
  });
  it("treats rows without an index field as composite and finds the sub-indices only when present", () => {
    expect(rowIndex(oldRows[0])).toBe("composite");
    expect(hasSubIndices(oldRows)).toBe(false);
    expect(hasSubIndices(rows)).toBe(true);
    expect(rowsForIndex(oldRows, "composite")).toHaveLength(2);
    expect(rowsForIndex(oldRows, "economic_ties")).toHaveLength(0);
    expect(rowsForIndex(rows, "economic_ties").map((r) => r.value)).toEqual([3.0, 4.7, 0.2, 0.6]);
    expect(rowsForIndex(rows, "composite").every((r) => r.index === "composite")).toBe(true);
  });
  it("reports the last indexed year per actor and the year most countries are last indexed in", () => {
    expect(lastIndexedYears(rows)).toEqual({ CN: 2025, US: 2025 });
    // 2000 has four countries with both actors, 2024 three (Venezuela gone) and 2025 one: the latest year with at least
    // three quarters of the most is 2024, not 2000 (the most) and not 2025 (one country)
    expect(defaultIndexYear(rows, 2019)).toBe(2024);
    expect(defaultIndexYear([], 2019)).toBe(2019);
    expect(defaultIndexYear(oldRows, 2019)).toBe(2020);
  });
});

describe("what carries the lean", () => {
  it("keys the lead by country and year and words it with both actors' values", () => {
    const leads = leadLookup(rows);
    expect(leads.get("CHL|2000")).toEqual(lead2000);
    expect(leads.has("ARG|2024")).toBe(false); // no lead on that row
    expect(leadLookup(oldRows).size).toBe(0);
    expect(carriedBy(leads.get("CHL|2000"))).toBe("carried by UN voting agreement (CN 90 vs US 34)");
    expect(carriedBy(undefined)).toBeNull();
  });
  it("summarises the year from the rows: the leading component, how many countries, the sub-index means", () => {
    const s = leadSummary(rows, 2000)!;
    expect(s.component).toBe("diplomatic_alignment");
    expect(s.n).toBe(2);
    expect(s.total).toBe(4);
    expect(s.meanGap).toBeCloseTo(53.15, 2);
    expect(s.economic_ties).toEqual({ CN: 1.6, US: 2.65 });
    expect(s.political_alignment).toEqual({ CN: 90, US: 33.7 });
    expect(leadSentence(s)).toBe("In 2000 UN voting agreement carries the lean in 2 of 4 countries (the widest gap between the actors, China ahead by 53 points on average); economic ties are near zero for both (2 vs 3 on the 0–100 scale), political alignment 90 vs 34. Switch the index to see each.");
  });
  it("says when the United States is ahead and omits the sub-index clauses an older file cannot give", () => {
    const s = leadSummary(rows, 2024)!;
    expect(s.component).toBe("trade_export_share");
    expect(s.n).toBe(1);
    expect(s.total).toBe(3);
    expect(s.economic_ties).toBeNull();
    expect(leadSentence(s)).toBe("In 2024 the export share carries the lean in 1 of 3 countries (the widest gap between the actors, China ahead by 40 points on average).");
    expect(leadSentence({ ...s, meanGap: -12 })).toContain("the United States ahead by 12 points");
    expect(leadSentence(leadSummary(rows, 2025)!)).toBe("In 2025 the export share carries the lean in 1 of 1 country (the widest gap between the actors, China ahead by 40 points on average).");
    expect(leadSummary(oldRows, 2020)).toBeNull();
    expect(leadSummary(rows, 1999)).toBeNull();
  });
});

describe("why a country has no index", () => {
  it("names the trade record's end beyond its last year", () => {
    expect(noIndexReason({ year: 2026, mineral: "all", indexName: "composite", missing: ["US", "CN"], lastYear, defaultYear: 2024 })).toBe("no composite influence index for 2026: no trade reported for 2026 yet (UN Comtrade runs to 2025)");
  });
  it("names the sources that end before the year once the year lies beyond the last broadly indexed one", () => {
    expect(laggingSources(lastYear, 2025, "CN")).toEqual(["UN voting to 2024", "debt owed to China to 2024", "Chinese finance to 2021"]);
    expect(laggingSources(lastYear, 2025, "US")).toEqual(["UN voting to 2024"]);
    expect(laggingSources(lastYear, 2024, "US")).toEqual([]);
    expect(laggingSources(null, 2025, "CN")).toEqual([]);
    expect(laggingSources(lastYear, 2025, "CN", "political_alignment")).toEqual(["UN voting to 2024"]);
    expect(laggingSources(lastYear, 2025, "CN", "economic_ties")).toEqual(["debt owed to China to 2024", "Chinese finance to 2021"]);
    expect(noIndexReason({ year: 2025, mineral: "all", indexName: "composite", missing: ["CN"], lastYear, defaultYear: 2024 })).toBe("no China composite influence index for 2025: UN voting to 2024, debt owed to China to 2024, Chinese finance to 2021 (the index is not published where a component it rested on the year before has no data yet, or with fewer than 3 components)");
  });
  it("does not blame the sources for a country-specific gap inside the indexed years", () => {
    expect(noIndexReason({ year: 2024, mineral: "all", indexName: "composite", missing: ["US", "CN"], lastYear, defaultYear: 2024 })).toBe("no US composite influence index for 2024: fewer than 3 components (the case file's Analysis tab says which); no China composite influence index for 2024: fewer than 3 components (the case file's Analysis tab says which)");
  });
  it("keeps the mineral and the sub-index cases honest", () => {
    expect(noIndexReason({ year: 2024, mineral: "copper", indexName: "composite", missing: ["US"], lastYear, defaultYear: 2024 })).toBe("no composite influence index for copper in 2024: no reported trade in the mineral that year, or fewer than 3 components");
    expect(noIndexReason({ year: 2024, mineral: "copper", indexName: "economic_ties", missing: ["US"], lastYear, defaultYear: 2024 })).toBe("no economic ties sub-index for copper: the sub-indices are computed for all minerals together");
    expect(noIndexReason({ year: 2025, mineral: "all", indexName: "political_alignment", missing: ["CN"], lastYear, defaultYear: 2024 })).toBe("no China political alignment sub-index for 2025: UN voting to 2024 (no component available)");
    expect(noIndexReason({ year: 2024, mineral: "all", indexName: "composite", missing: ["CN"], lastYear: null, defaultYear: null })).toContain("fewer than 3 components (the case file's Analysis tab says which)");
  });
});

describe("the ranking's note", () => {
  it("is empty when every country has an index", () => {
    expect(missingIndexNote({ year: 2024, mineral: "all", indexName: "composite", missingAny: 0, missingCN: 0, missingUS: 0, lastYear, defaultYear: 2024 })).toBeNull();
  });
  it("explains 2025 by the sources that end before it and names the last broadly indexed year", () => {
    expect(missingIndexNote({ year: 2025, mineral: "all", indexName: "composite", missingAny: 11, missingCN: 11, missingUS: 2, lastYear, defaultYear: 2024 })).toBe(
      `11 of ${COUNTRY_COUNT} countries have no composite influence index in 2025: the China index is missing for 11 (UN voting to 2024, debt owed to China to 2024, Chinese finance to 2021); the US index is missing for 2 (UN voting to 2024). The index is not published where a component it rested on the year before has no data yet, or with fewer than 3 components. The last year with both indices for most countries is 2024.`,
    );
  });
  it("explains 2026 by the trade record and a mineral filter by the mineral", () => {
    expect(missingIndexNote({ year: 2026, mineral: "all", indexName: "composite", missingAny: 12, missingCN: 12, missingUS: 12, lastYear, defaultYear: 2024 })).toBe(`12 of ${COUNTRY_COUNT} countries have no composite influence index in 2026: no trade reported for 2026 yet (UN Comtrade runs to 2025).`);
    expect(missingIndexNote({ year: 2024, mineral: "lithium", indexName: "composite", missingAny: 7, missingCN: 7, missingUS: 5, lastYear, defaultYear: 2024 })).toBe(`7 of ${COUNTRY_COUNT} countries have no composite influence index in 2024: no reported trade in the mineral that year, or fewer than 3 components.`);
    expect(missingIndexNote({ year: 2024, mineral: "lithium", indexName: "economic_ties", missingAny: 12, missingCN: 12, missingUS: 12, lastYear, defaultYear: 2024 })).toBe(`12 of ${COUNTRY_COUNT} countries have no economic ties sub-index in 2024: the sub-indices are computed for all minerals together.`);
  });
  it("points at the case file for a gap inside the indexed years", () => {
    expect(missingIndexNote({ year: 2024, mineral: "all", indexName: "composite", missingAny: 1, missingCN: 1, missingUS: 1, lastYear, defaultYear: 2024 })).toBe(`1 of ${COUNTRY_COUNT} countries have no composite influence index in 2024: fewer than 3 components (each case file's Analysis tab says which).`);
  });
});
