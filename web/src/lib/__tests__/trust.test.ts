import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { GLOSSARY, GLOSSARY_BY_ID, glossaryHref } from "../glossary";
import { LAYER_GLYPH, TABLE_ANCHORS, argueHref, lastYearsFrom, tableHref } from "../provenance";

const methodology = readFileSync(path.join(__dirname, "../../app/methodology/page.tsx"), "utf8");
const ids = new Set(Array.from(methodology.matchAll(/id="([a-z0-9-]+)"/g)).map((m) => m[1]));

describe("glossary", () => {
  it("has unique ids, a definition and a place for every term", () => {
    expect(new Set(GLOSSARY.map((g) => g.id)).size).toBe(GLOSSARY.length);
    for (const g of GLOSSARY) {
      expect(g.definition.length).toBeGreaterThan(40);
      expect(g.where.length).toBeGreaterThan(3);
      expect(GLOSSARY_BY_ID[g.id]).toBe(g);
    }
    expect(glossaryHref("crps")).toBe("/methodology#glossary-crps");
  });
  it("is rendered on the methods page with one anchor per term", () => {
    expect(ids.has("glossary")).toBe(true);
    expect(methodology).toContain("glossary-${g.id}");
  });
});

describe("provenance", () => {
  it("links every table to an existing methods anchor", () => {
    for (const [table, anchor] of Object.entries(TABLE_ANCHORS)) {
      expect(ids.has(anchor), `${table} → #${anchor}`).toBe(true);
    }
    expect(tableHref("trade_flow")).toBe("/methodology#flows");
    expect(tableHref("something_new")).toBe("/methodology");
  });
  it("maps the last years with readable labels and builds the issue link", () => {
    const meta = { quant_model: { last_year: { trade: 2025, finance_CN: 2021, finance_US: 2026 } } } as unknown as Parameters<typeof lastYearsFrom>[0];
    expect(lastYearsFrom(meta, ["finance_CN", "trade"])).toEqual({ "Chinese finance (AidData)": 2021, "Trade (UN Comtrade)": 2025 });
    expect(lastYearsFrom(null)).toBeUndefined();
    const href = argueHref({ title: "The ledger balance", findingId: "who_talks_who_pays" }, "https://example.org/#c1");
    expect(href.startsWith("https://github.com/DomyB/US_vs_China_AI/issues/new?title=Reading%3A%20who_talks_who_pays")).toBe(true);
    expect(decodeURIComponent(href)).toContain("Exhibit: The ledger balance");
    expect(LAYER_GLYPH.model).toBe("◆");
  });
});
