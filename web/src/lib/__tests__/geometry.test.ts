import { describe, expect, it } from "vitest";
import { composite, cosine, defaultExample, distance, nearestPoints, normalise, points, projectDirection, smallPca, symmetricEigen, words, type ComponentsFile, type WordsFile } from "../geometry";

describe("words and vectors", () => {
  it("splits a title into words and measures cosine similarity", () => {
    expect(words("Producción de cobre en Chile cae 7,7 % entre enero y agosto.")).toEqual(["Producción", "de", "cobre", "en", "Chile", "cae", "7,7", "entre", "enero", "y", "agosto"]);
    expect(cosine([1, 0], [1, 0])).toBeCloseTo(1, 9);
    expect(cosine([1, 0], [0, 1])).toBeCloseTo(0, 9);
    expect(cosine([1, 0], [0, 0])).toBeNull();
    expect(cosine([1], [1, 2])).toBeNull();
  });
  it("picks the translated featured record of the largest narrative as the first example", () => {
    const file = {
      topics: [{ id: 0, label: "a", keywords: [], n: 5, example: "x" }, { id: 1, label: "b", keywords: [], n: 50, example: "y" }, { id: 2, label: "c", keywords: [], n: 80, example: "z" }],
      featured: [{ id: "x", topic: 0, vector: [], near: [], far: [] }, { id: "y", topic: 1, vector: [], near: [], far: [] }, { id: "z", topic: 2, vector: [], near: [], far: [] }],
      docs: [{ id: "x", t: "news", e: "X" }, { id: "y", t: "news", e: "Y" }, { id: "z", t: "bill", e: "Z" }],
    } as unknown as WordsFile;
    expect(defaultExample(file)).toBe("y");
    expect(defaultExample({ ...file, featured: [], docs: [{ id: "q" }] } as unknown as WordsFile)).toBe("q");
  });
});

const file: ComponentsFile = {
  dataset: "REAL", generated_on: "2026-10-13", layer: "model", note: "",
  scales: { trade_export_share: { lo: 0, hi: 0.7, n: 10 } },
  components: [
    { c: "CHL", y: 2024, a: "CN", k: "trade_export_share", raw: 0.505, norm: 72.1, ok: true, note: null },
    { c: "CHL", y: 2024, a: "CN", k: "trade_import_share", raw: 0.0027, norm: 0.3, ok: true, note: null },
    { c: "CHL", y: 2024, a: "CN", k: "finance_flow", raw: null, norm: null, ok: false, note: "source coverage ends 2021" },
    { c: "CHL", y: 2024, a: "CN", k: "diplomatic_alignment", raw: 0.75, norm: 74.7, ok: true, note: null },
    { c: "CHL", y: 2024, a: "US", k: "trade_export_share", raw: 0.115, norm: 16.3, ok: true, note: null },
    { c: "CHL", y: 2024, a: "US", k: "trade_import_share", raw: 0.03, norm: 3.2, ok: true, note: null },
    { c: "CHL", y: 2024, a: "US", k: "finance_flow", raw: 0.00003, norm: 0.04, ok: true, note: null },
    { c: "CHL", y: 2024, a: "US", k: "diplomatic_alignment", raw: 0.43, norm: 32.6, ok: true, note: null },
    { c: "PER", y: 2024, a: "CN", k: "trade_export_share", raw: 0.5, norm: 70.0, ok: true, note: null },
    { c: "PER", y: 2024, a: "CN", k: "trade_import_share", raw: 0.003, norm: 0.4, ok: true, note: null },
    { c: "PER", y: 2024, a: "CN", k: "diplomatic_alignment", raw: 0.76, norm: 76.0, ok: true, note: null },
    { c: "ARG", y: 2024, a: "CN", k: "trade_export_share", raw: 0.19, norm: 27.0, ok: true, note: null },
    { c: "ARG", y: 2024, a: "CN", k: "trade_import_share", raw: 0.012, norm: 1.4, ok: true, note: null },
    { c: "ARG", y: 2024, a: "CN", k: "diplomatic_alignment", raw: 0.43, norm: 32.0, ok: true, note: null },
    { c: "ARG", y: 2024, a: "CN", k: "debt_stock", raw: 0.008, norm: 8.6, ok: true, note: null },
  ],
  index: [{ c: "CHL", y: 2024, a: "CN", i: "influence", v: 49.03, n: 3 }, { c: "CHL", y: 2024, a: "CN", i: "economic_ties", v: 36.2, n: 2 }],
};

describe("the index as geometry", () => {
  it("builds one point per country-year-actor and reproduces the composite's arithmetic", () => {
    const pts = points(file);
    expect(pts.map((p) => `${p.c}${p.a}`)).toEqual(["ARGCN", "CHLCN", "CHLUS", "PERCN"]);
    const chl = pts.find((p) => p.c === "CHL" && p.a === "CN")!;
    expect(chl.composite).toBe(49.03);
    expect(chl.v.finance_flow).toBeNull();
    expect(chl.notes.finance_flow).toBe("source coverage ends 2021");
    const c = composite(chl);
    expect(c.used).toEqual(["trade_export_share", "trade_import_share", "diplomatic_alignment"]);
    expect(c.value).toBeCloseTo((72.1 + 0.3 + 74.7) / 3, 6);
    expect(composite(pts.find((p) => p.c === "PER")!, 4).value).toBeNull();
    expect(normalise(0.35, file.scales.trade_export_share)).toBeCloseTo(50, 6);
    expect(normalise(0.9, file.scales.trade_export_share)).toBe(100);
    expect(normalise(0.5, undefined)).toBeNull();
  });
  it("measures distances over shared components and ranks the neighbours", () => {
    const pts = points(file);
    const chl = pts.find((p) => p.c === "CHL" && p.a === "CN")!;
    const per = pts.find((p) => p.c === "PER")!;
    const arg = pts.find((p) => p.c === "ARG")!;
    const dp = distance(chl, per);
    expect(dp.shared).toEqual(["trade_export_share", "trade_import_share", "diplomatic_alignment"]);
    expect(dp.d).toBeCloseTo(Math.sqrt(((72.1 - 70) ** 2 + (0.3 - 0.4) ** 2 + (74.7 - 76) ** 2) / 3), 6);
    expect(distance(chl, arg).d!).toBeGreaterThan(dp.d!);
    expect(nearestPoints(pts, chl, 2).map((n) => n.p.c)).toEqual(["PER", "ARG"]);
    expect(nearestPoints(pts, chl, 5, false).some((n) => n.p.a === "US")).toBe(true);
    expect(distance(chl, { ...per, v: { trade_export_share: 1 } }).d).toBeNull();
  });
  it("finds the principal axes of a small cloud", () => {
    const { values, vectors } = symmetricEigen([[2, 0], [0, 1]]);
    expect(values[0]).toBeCloseTo(2, 9);
    expect(Math.abs(vectors[0][0])).toBeCloseTo(1, 9);
    const rows = Array.from({ length: 40 }, (_, i) => [i, 2 * i + (i % 2 ? 0.5 : -0.5), 10]);
    const pca = smallPca(rows)!;
    expect(pca.explained[0]).toBeGreaterThan(0.99);
    expect(pca.coords).toHaveLength(40);
    expect(pca.coords[39][0]).toBeGreaterThan(pca.coords[0][0]); // the sign is stable: the axis points along its largest loading
    const dir = projectDirection(pca, [1, 1, 1]);
    expect(Math.abs(dir[0])).toBeGreaterThan(Math.abs(dir[1]));
    expect(smallPca([[1, 2]])).toBeNull();
  });
});
