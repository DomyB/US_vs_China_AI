import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { fourNumbers, share, termAt, termSegments, tradeSeries, type StageRecords, type TradePanel } from "../stage";

const DIR = path.resolve(__dirname, "../../../public/data/companion/prototype");
const tr = JSON.parse(readFileSync(path.join(DIR, "trade.json"), "utf8")) as TradePanel;
const rec = JSON.parse(readFileSync(path.join(DIR, "records.json"), "utf8")) as StageRecords;

describe("the team's prototype is read with its own rule", () => {
  it("reproduces the four numbers the prototype states", () => {
    const f = fourNumbers(tr, Object.keys(rec.COUNTRY_NAMES));
    expect((f.cn2001! * 100).toFixed(1)).toBe("5.6");
    expect((f.cn2024! * 100).toFixed(1)).toBe("48.0");
    expect((f.us2001! * 100).toFixed(1)).toBe("19.4");
    expect((f.us2024! * 100).toFixed(1)).toBe("11.2");
    expect(Math.round(f.value2001)).toBe(17);
    expect(Math.round(f.value2024)).toBe(123);
    expect((f.coreCn2024! * 100).toFixed(1)).toBe("43.3");
    expect((f.coreUs2024! * 100).toFixed(1)).toBe("14.4");
  });
  it("splits ores from processed products and keeps a Comtrade year apart", () => {
    const isos = Object.keys(rec.COUNTRY_NAMES);
    const raw = tradeSeries(tr, { isos, stage: "raw" })[2025 - 2001];
    const pro = tradeSeries(tr, { isos, stage: "processed" })[2025 - 2001];
    expect(share(raw, "CHN")!).toBeGreaterThan(0.5);
    expect(share(pro, "USA")!).toBeGreaterThan(0.3);
    expect(raw.comtrade).toBe(true);
    expect(raw.BEN).toBe(0); // a Comtrade year carries China, the US and everyone else only
    const lithium = tradeSeries(tr, { isos: ["CHL"], resource: "lithium" });
    expect(lithium[2024 - 2001].total).toBeGreaterThan(0);
    expect(share(undefined, "CHN")).toBeNull();
  });
  it("carries the record lists as supplied and places the coded terms", () => {
    expect(rec.EVENTS).toHaveLength(72);
    expect(rec.PROJECTS).toHaveLength(34);
    expect(rec.CASES).toHaveLength(16);
    expect(rec.QUOTES).toHaveLength(21);
    expect(Object.keys(rec.COUNTRY_NAMES)).toHaveLength(33);
    expect(termAt(rec.TERMS, "ARG", 2024)).toMatchObject({ name: "Milei", ori: "R" });
    expect(termAt(rec.TERMS, "BRA", 2010)).toMatchObject({ name: "Lula da Silva", ori: "L" });
    expect(termAt(rec.TERMS, "COL", 2010)).toBeNull(); // only the six focus countries are coded
    const segs = termSegments(rec.TERMS);
    expect(segs.filter((s) => s.iso === "CHL")).toHaveLength(7);
    expect(segs.every((s) => s.x2 > s.x1 && s.x1 >= 2001)).toBe(true);
  });
});
