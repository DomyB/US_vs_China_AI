import { describe, expect, it } from "vitest";
import { EMPTY_FILTERS, facet, filterStatements } from "@/components/statements/blocs";
import type { StatementRecord } from "@/lib/types";

const rec = (over: Partial<StatementRecord> & { id: string }): StatementRecord => ({
  date: "2025-01-10", date_precision: "day", year: 2025, country: "PER",
  speaker: { name: "Dina Boluarte", role: "President", type: "head_of_state", bloc: "LatAm executive", country: "PER", party: null },
  channel: "speech", event_context: null, minerals: ["copper"], themes: ["foreign_investment"], counterparts: ["CHN"],
  stance: { cn: "positive", us: "not_mentioned", cn_score: 1, us_score: null },
  related_entities: "Chancay", summary_en: "Opened the Chancay port.", quote_original: "El puerto de Chancay", quote_en: "The port of Chancay", language: "es",
  source: { name: "Gestión", url: "https://x", type: "news_media", verification: "secondary_reported", reliability: "independent_academic", confidence: "strongly_indicated" },
  notes: null,
  ...over,
});
const records = [
  rec({ id: "a" }),
  rec({ id: "b", year: 2024, date: "2024-03-01", speaker: { name: "Marco Rubio", role: "Secretary of State", type: "us_central_gov", bloc: "United States", country: "USA", party: null }, stance: { cn: "negative", us: "positive", cn_score: -1, us_score: 1 }, minerals: ["lithium"], themes: ["geopolitics_security"] }),
  rec({ id: "c", speaker: { name: "Congreso", role: null, type: "legislature_body", bloc: "LatAm legislature", country: "PER", party: null }, stance: { cn: "not_mentioned", us: "not_mentioned", cn_score: null, us_score: null }, channel: "bill_or_law" }),
];

describe("statement filters", () => {
  it("filters by bloc, mineral, theme, channel and year", () => {
    expect(filterStatements(records, { ...EMPTY_FILTERS, bloc: "United States" }).map((r) => r.id)).toEqual(["b"]);
    expect(filterStatements(records, { ...EMPTY_FILTERS, mineral: "copper" }).map((r) => r.id)).toEqual(["a", "c"]);
    expect(filterStatements(records, { ...EMPTY_FILTERS, theme: "geopolitics_security" }).map((r) => r.id)).toEqual(["b"]);
    expect(filterStatements(records, { ...EMPTY_FILTERS, channel: "bill_or_law" }).map((r) => r.id)).toEqual(["c"]);
    expect(filterStatements(records, { ...EMPTY_FILTERS, year: 2024 }).map((r) => r.id)).toEqual(["b"]);
  });
  it("filters by stance taken toward an actor", () => {
    expect(filterStatements(records, { ...EMPTY_FILTERS, stance: "cn_any" }).map((r) => r.id)).toEqual(["a", "b"]);
    expect(filterStatements(records, { ...EMPTY_FILTERS, stance: "cn_negative" }).map((r) => r.id)).toEqual(["b"]);
    expect(filterStatements(records, { ...EMPTY_FILTERS, stance: "us_positive" }).map((r) => r.id)).toEqual(["b"]);
    expect(filterStatements(records, { ...EMPTY_FILTERS, stance: "us_negative" })).toEqual([]);
  });
  it("searches speaker, summary, quotes and source", () => {
    expect(filterStatements(records, { ...EMPTY_FILTERS, q: "chancay" }).map((r) => r.id)).toEqual(["a", "b", "c"]);
    expect(filterStatements(records, { ...EMPTY_FILTERS, q: "rubio" }).map((r) => r.id)).toEqual(["b"]);
    expect(filterStatements(records, { ...EMPTY_FILTERS, q: "gestión" })).toHaveLength(3);
  });
  it("facets count distinct values most frequent first", () => {
    expect(facet(records, (r) => r.minerals)).toEqual([{ value: "copper", n: 2 }, { value: "lithium", n: 1 }]);
    expect(facet(records, (r) => [r.speaker.bloc])[0]).toEqual({ value: "LatAm executive", n: 1 });
  });
});
