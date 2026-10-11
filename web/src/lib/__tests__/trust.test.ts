import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { GLOSSARY, GLOSSARY_BY_ID, glossaryHref } from "../glossary";
import { LAYER_GLYPH, TABLE_ANCHORS, argueHref, forecastSeriesSpan, labProvenance, lastYearsFrom, provenanceFor, tableHref, type ProvKind } from "../provenance";
import type { RealMeta } from "../types";

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
  it("defines every term a ribbon or a Lab block links to, and points each term at a place that exists", () => {
    const kinds: ProvKind[] = ["trade", "finance", "production", "contracts", "index", "concentration", "governance", "interpretation", "forecast_index", "forecast_share", "scenarios", "stance", "records", "statements", "press"];
    for (const k of kinds) for (const g of provenanceFor(k).glossary ?? []) expect(GLOSSARY_BY_ID[g], `${k} → ${g}`).toBeDefined();
    for (const id of ["board", "studio", "words", "ledger", "minerals", "parity", "shocks", "panel", "attention", "findings", "reading"]) {
      for (const g of labProvenance(id)?.glossary ?? []) expect(GLOSSARY_BY_ID[g], `${id} → ${g}`).toBeDefined();
    }
    // no entry points at a view the site does not have (there is no tercile view; implied volume lives in the Lab's price lever)
    expect(GLOSSARY_BY_ID.tercile).toBeUndefined();
    expect(GLOSSARY_BY_ID.implied_volume.where).toContain("Lab");
    expect(GLOSSARY_BY_ID.net_lean.definition).toContain("−60 to +60");
    expect(GLOSSARY_BY_ID.net_lean.definition).not.toContain("±100");
  });
});

describe("lab caveats", () => {
  it("take their lengths and years from the metadata and name none without it", () => {
    const meta = { quant_model: { last_year: { finance_CN: 2021 }, forecast: { targets: { "export_share:CN": { origins: "2007–2024", windows: { ARG: { years: [2000, 2025], n_obs: 26 }, PER: { years: [2000, 2024], n_obs: 25 } } } } } } } as unknown as RealMeta;
    expect(forecastSeriesSpan(meta)).toEqual({ maxObs: 26, from: 2000, to: 2025, origins: "2007–2024" });
    expect(forecastSeriesSpan(null)).toBeNull();
    expect(forecastSeriesSpan({ quant_model: { forecast: { targets: {} } } } as unknown as RealMeta)).toBeNull();
    expect(labProvenance("board", meta)?.caveat).toContain("at most 26 annual observations (2000–2025)");
    expect(labProvenance("ledger", meta)?.caveat).toContain("ends in 2021");
    expect(labProvenance("attention", meta)?.caveat).toContain("ends in 2021");
    // without metadata no caveat types a length, a year or a count
    for (const id of ["board", "ledger", "attention", "panel"]) expect(labProvenance(id, null)?.caveat ?? "").not.toMatch(/\d/);
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

describe("registry", () => {
  it("is imported statically by no client module (only the server reader reads the file)", () => {
    const root = path.join(__dirname, "../..");
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = path.join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(name) && /from\s+["'][^"']*sources\.json["']/.test(readFileSync(p, "utf8")) && !name.endsWith("sources.server.ts")) hits.push(path.relative(root, p));
      }
    };
    walk(root);
    expect(hits).toEqual([]);
  });
});
