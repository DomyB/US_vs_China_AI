import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { eventsByYear, govCells, stageOf, synthRows, tradeLean, verdictKind, type DenialData, type DenialR4, type DenialSynth } from "../denial";

const DIR = path.resolve(__dirname, "../../../public/data/companion/denial");
const data = JSON.parse(readFileSync(path.join(DIR, "data.json"), "utf8")) as DenialData;
const r4 = JSON.parse(readFileSync(path.join(DIR, "r4.json"), "utf8")) as DenialR4;
const synth = JSON.parse(readFileSync(path.join(DIR, "synth.json"), "utf8")) as DenialSynth;

describe("the companion project's files are read as supplied", () => {
  it("carries the counts its own page states", () => {
    expect(data.docs).toHaveLength(31);
    expect(data.claims).toHaveLength(951);
    expect(data.timeline).toHaveLength(1076);
    expect(data.props).toHaveLength(29);
    expect(data.mechs).toHaveLength(17);
    expect(data.countries).toHaveLength(20);
    expect(Object.keys(r4.govs)).toHaveLength(20);
    expect(data.claims.every((c) => c.c.length > 0)).toBe(true); // every claim carries a citation
  });
  it("reads the verdict vocabulary and the stage rule the way the project does", () => {
    expect(verdictKind("supports")).toBe("holds");
    expect(verdictKind("supports (2008–2016), qualifies (after)")).toBe("holds");
    expect(verdictKind("qualifies (Chinese retreat)")).toBe("qualifies");
    expect(verdictKind("challenges (until 2025)")).toBe("fails");
    expect(stageOf({ stage: "operating since 2016" })).toBe("operating");
    expect(stageOf({ stage: "completed (lending ceased)" })).toBe("operating");
    expect(stageOf({ stage: "approved" })).toBe("signed");
    expect(stageOf({ stage: "cancelled (provisional)" })).toBe("cancelled");
    expect(stageOf({ stage: "something else" })).toBe("announced");
    expect(data.projects.map(stageOf).filter((s) => s === "operating").length).toBe(19);
  });
  it("counts events, places governments and derives the trade lean without rescoring", () => {
    const all = eventsByYear(data.timeline);
    expect(all.reduce((s, r) => s + r.n, 0)).toBe(1076);
    expect(eventsByYear(data.timeline, { co: "PAN", ty: "agreement" }).every((r) => r.ty === "agreement")).toBe(true);
    const cells = govCells(r4.govs);
    const milei = cells.find((c) => c.iso === "ARG" && c.year === 2024);
    expect(milei?.name).toBe("Javier Milei");
    expect(milei?.net).toBe(2);
    expect(cells.filter((c) => c.iso === "ARG").length).toBeLessThanOrEqual(26);
    const lean = tradeLean(r4.tr);
    const mex = lean.find((l) => l.iso === "MEX" && l.year === 2001)!;
    expect(mex.lean).toBeCloseTo(761.3 / (761.3 + 131334.7), 6);
    expect(lean.every((l) => l.lean >= 0 && l.lean <= 1)).toBe(true);
    const rows = synthRows(synth);
    expect(rows[0].between && Math.abs(rows[0].between[0])).toBeGreaterThanOrEqual(Math.abs(rows[rows.length - 1].between?.[0] ?? 0));
    expect(rows.find((r) => r.pair === "lean|ores")?.within).toEqual([0.35, 0.0, 411]);
  });
});
