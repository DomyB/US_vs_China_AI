import { describe, expect, it } from "vitest";
import { accuracy, classWeights, confusion, contributions, crossEntropy, featureName, initHead, macroF1, predict, rng, softmax, step, train, type ClassifierFile } from "../classifier";

function toy(): ClassifierFile {
  const next = rng(7);
  const examples = Array.from({ length: 60 }, (_, i) => {
    const y = [-1, 0, 1][i % 3];
    const x = [y + (next() - 0.5) * 0.4, -y + (next() - 0.5) * 0.4, next() - 0.5, 0, 1, 0, 1];
    return { id: `d${i}`, a: "CN" as const, y, y5: y, conf: null, split: i % 4 === 0 ? ("held_out" as const) : ("train" as const), c: "CHL", t: "bill", d: "2024-01-01", l: "es", h: `t${i}`, e: null, x };
  });
  return { dataset: "REAL", generated_on: "2026-10-13", layer: "model", label_source: "zero_shot", classes: [-1, 0, 1], n: 60, n_train: 45, n_held_out: 15, by_class: [], features: { dim: 7, layout: "", embedding_model: null }, method: { name: "", lr: 0.5, iters: 400, C: 1, init: "", lam: "" }, head: null, examples };
}

describe("the classifier head", () => {
  it("is deterministic and starts near zero", () => {
    expect(rng(1)()).toBe(rng(1)());
    const h = initHead(5, 3, 42);
    expect(h.w).toHaveLength(5);
    expect(Math.max(...h.w.flat().map(Math.abs))).toBeLessThan(0.05);
    expect(h.b).toEqual([0, 0, 0]);
    const p = softmax([1, 2, 3]);
    expect(p.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);
    expect(crossEntropy([0.5, 0.5], 0)).toBeCloseTo(Math.log(2), 9);
    expect(classWeights([0, 0, 0, 1], 2)).toEqual([4 / 6, 4 / 6, 4 / 6, 4 / 2]);
    expect(featureName(0, 388)).toBe("embedding dimension 1");
    expect(featureName(385, 388)).toBe("actor is China");
  });
  it("lowers the loss with one step and learns a separable toy set", () => {
    const file = toy();
    const tr = file.examples.filter((e) => e.split === "train");
    const xs = tr.map((e) => e.x);
    const ys = tr.map((e) => file.classes.indexOf(e.y));
    const w = classWeights(ys, 3);
    const head = initHead(7, 3, 1);
    const first = step(xs, ys, w, head, 0.5, 1 / 45);
    const second = step(xs, ys, w, head, 0.5, 1 / 45);
    expect(second.loss).toBeLessThan(first.loss);
    const t = train(file, { iters: 200, lr: 0.5, C: 1, seed: 1, every: 50 });
    expect(t.history[0].iter).toBe(0);
    expect(t.history[t.history.length - 1].iter).toBe(200);
    expect(t.history[t.history.length - 1].train!).toBeGreaterThan(0.9);
    expect(t.history[t.history.length - 1].heldOut!).toBeGreaterThan(0.8);
    const ho = file.examples.filter((e) => e.split === "held_out");
    expect(accuracy(ho.map((e) => e.x), ho.map((e) => file.classes.indexOf(e.y)), t.head)!).toBeGreaterThan(0.8);
    expect(macroF1(xs, ys, t.head, 3)!).toBeGreaterThan(0.9);
    const m = confusion(xs, ys, t.head, 3);
    expect(m.flat().reduce((a, b) => a + b, 0)).toBe(45);
    const p = predict(tr[0].x, t.head);
    const e = tr.find((r) => r.y === 1)!; // a record away from the origin: its informative inputs decide, not the constant flags
    const top = contributions(e.x, t.head, file.classes.indexOf(e.y), 7);
    expect(top).toHaveLength(5); // the two zero inputs contribute nothing and are left out
    const by = new Map(top.map((c) => [c.j, Math.abs(c.value)]));
    expect(Math.max(by.get(0)!, by.get(1)!)).toBeGreaterThan(by.get(2)!); // an informative dimension outweighs the noise dimension
    expect(p.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);
  });
});
