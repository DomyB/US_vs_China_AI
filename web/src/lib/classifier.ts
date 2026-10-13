import { COUNTRY_NAMES } from "./constants";

/**
 * The classifier walkthrough: the pipeline's stance head (`scm/text/train.py`, `fit_logreg`) repeated in the browser
 * on the exported examples. Multinomial logistic regression with balanced class weights, an L2 penalty and
 * full-batch gradient descent: the same formulas, the same hyper-parameters, a different random start (the page
 * cannot reproduce numpy's generator, and says so). Everything here is arithmetic on the shipped rows.
 */

export interface ClassifierExample {
  id: string;
  a: "US" | "CN";
  /** the label the head learns: −1 against, 0 neutral, 1 in favour (the five-point stance collapsed to its sign) */
  y: number;
  y5: number;
  conf: number | null;
  split: "train" | "held_out";
  c: string;
  t: string;
  d: string;
  l: string | null;
  h: string | null;
  e: string | null;
  /** the head's input row: embedding ⊕ actor one-hot ⊕ mention flags */
  x: number[];
}

export interface ClassifierFile {
  dataset: string;
  generated_on: string;
  layer: "model";
  label_source: "zero_shot" | "adjudicated";
  classes: number[];
  n: number;
  n_train: number;
  n_held_out: number;
  by_class: { actor: "US" | "CN"; y: number; n: number }[];
  features: { dim: number; layout: string; embedding_model: string | null };
  method: { name: string; lr: number; iters: number; C: number; init: string; lam: string };
  head: { classes: number[]; coef: number[][]; intercept: number[]; C: number | null; n_train: number | null; cv_macro_f1: unknown; codebook_version: string | null; created_at: string | null } | null;
  examples: ClassifierExample[];
}

export const CLASS_WORD: Record<number, string> = { [-1]: "against", 0: "neutral", 1: "in favour" };

export const countryName = (iso: string) => COUNTRY_NAMES[iso] ?? iso;

/** A small deterministic generator (mulberry32) so a page reload gives the same start. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A normal draw by Box–Muller from a uniform generator. */
export function normal(next: () => number): number {
  const u = Math.max(next(), 1e-12);
  const v = next();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export interface Head {
  /** W[d][k] */
  w: number[][];
  /** b[k] */
  b: number[];
}

export function initHead(d: number, k: number, seed = 20261013, sd = 0.01): Head {
  const next = rng(seed);
  return { w: Array.from({ length: d }, () => Array.from({ length: k }, () => normal(next) * sd)), b: Array(k).fill(0) };
}

export function logits(x: number[], head: Head): number[] {
  const k = head.b.length;
  const out = head.b.slice();
  for (let j = 0; j < x.length; j++) {
    const xj = x[j];
    if (xj === 0) continue;
    const row = head.w[j];
    for (let c = 0; c < k; c++) out[c] += xj * row[c];
  }
  return out;
}

export function softmax(z: number[]): number[] {
  const m = Math.max(...z);
  const e = z.map((v) => Math.exp(v - m));
  const s = e.reduce((a, b) => a + b, 0);
  return e.map((v) => v / s);
}

export function predict(x: number[], head: Head): number[] {
  return softmax(logits(x, head));
}

/** Cross-entropy of one example: −log p(true class). */
export function crossEntropy(p: number[], yIndex: number): number {
  return -Math.log(Math.max(p[yIndex], 1e-12));
}

/** Balanced class weights as the pipeline uses them: n / (k · count of the example's class). */
export function classWeights(ys: number[], k: number): number[] {
  const counts = Array(k).fill(0) as number[];
  for (const y of ys) counts[y] += 1;
  const n = ys.length;
  return ys.map((y) => n / (k * Math.max(counts[y], 1)));
}

export interface Step {
  loss: number;
  /** mean |gradient| over W, for the walk's narration */
  gradNorm: number;
}

/**
 * One full-batch step of `fit_logreg`: p = softmax(xW + b); g = (p − onehot) · weight / n; W ← W − lr (xᵀg + λW);
 * b ← b − lr Σg. Mutates `head` and returns the loss before the step (weighted mean cross-entropy plus the penalty).
 */
export function step(xs: number[][], ys: number[], weights: number[], head: Head, lr: number, lam: number): Step {
  const n = xs.length;
  const d = head.w.length;
  const k = head.b.length;
  const gw = Array.from({ length: d }, () => Array(k).fill(0) as number[]);
  const gb = Array(k).fill(0) as number[];
  let loss = 0;
  for (let i = 0; i < n; i++) {
    const p = predict(xs[i], head);
    loss += (weights[i] * crossEntropy(p, ys[i])) / n;
    const x = xs[i];
    for (let c = 0; c < k; c++) {
      const g = ((p[c] - (c === ys[i] ? 1 : 0)) * weights[i]) / n;
      if (g === 0) continue;
      gb[c] += g;
      for (let j = 0; j < d; j++) {
        const xj = x[j];
        if (xj !== 0) gw[j][c] += xj * g;
      }
    }
  }
  let pen = 0;
  let gsum = 0;
  for (let j = 0; j < d; j++) {
    for (let c = 0; c < k; c++) {
      pen += (lam / 2) * head.w[j][c] ** 2;
      const g = gw[j][c] + lam * head.w[j][c];
      gsum += Math.abs(g);
      head.w[j][c] -= lr * g;
    }
  }
  for (let c = 0; c < k; c++) head.b[c] -= lr * gb[c];
  return { loss: loss + pen, gradNorm: gsum / (d * k) };
}

export function accuracy(xs: number[][], ys: number[], head: Head): number | null {
  if (xs.length === 0) return null;
  let ok = 0;
  for (let i = 0; i < xs.length; i++) if (argmax(predict(xs[i], head)) === ys[i]) ok += 1;
  return ok / xs.length;
}

export function argmax(p: number[]): number {
  let best = 0;
  for (let i = 1; i < p.length; i++) if (p[i] > p[best]) best = i;
  return best;
}

export interface Training {
  head: Head;
  /** per iteration (index 0 = before the first step): loss, train accuracy, held-out accuracy */
  history: { iter: number; loss: number; train: number | null; heldOut: number | null }[];
  lam: number;
}

/** Repeat the pipeline's loop: `iters` full-batch steps at `lr` with λ = 1 / (C · n); accuracies recorded every `every` steps. */
export function train(file: ClassifierFile, opts: { iters: number; lr: number; C: number; seed?: number; every?: number }): Training {
  const classes = file.classes;
  const tr = file.examples.filter((e) => e.split === "train");
  const ho = file.examples.filter((e) => e.split === "held_out");
  const xs = tr.map((e) => e.x);
  const ys = tr.map((e) => classes.indexOf(e.y));
  const xh = ho.map((e) => e.x);
  const yh = ho.map((e) => classes.indexOf(e.y));
  const weights = classWeights(ys, classes.length);
  const head = initHead(file.features.dim, classes.length, opts.seed);
  const lam = 1 / (opts.C * Math.max(xs.length, 1));
  const every = opts.every ?? 10;
  const history: Training["history"] = [];
  for (let it = 0; it < opts.iters; it++) {
    const record = it % every === 0;
    const s = step(xs, ys, weights, head, opts.lr, lam);
    if (record) history.push({ iter: it, loss: s.loss, train: accuracy(xs, ys, head), heldOut: accuracy(xh, yh, head) });
  }
  history.push({ iter: opts.iters, loss: meanLoss(xs, ys, weights, head, lam), train: accuracy(xs, ys, head), heldOut: accuracy(xh, yh, head) });
  return { head, history, lam };
}

export function meanLoss(xs: number[][], ys: number[], weights: number[], head: Head, lam: number): number {
  const n = xs.length;
  let loss = 0;
  for (let i = 0; i < n; i++) loss += (weights[i] * crossEntropy(predict(xs[i], head), ys[i])) / n;
  let pen = 0;
  for (const row of head.w) for (const v of row) pen += (lam / 2) * v * v;
  return loss + pen;
}

/** The input dimensions that pushed a decision most: x_j · (w_jc − mean_c w_jc), signed, largest first. */
export function contributions(x: number[], head: Head, c: number, top = 8): { j: number; value: number }[] {
  const k = head.b.length;
  const out: { j: number; value: number }[] = [];
  for (let j = 0; j < x.length; j++) {
    if (x[j] === 0) continue;
    const row = head.w[j];
    const mean = row.reduce((a, b) => a + b, 0) / k;
    out.push({ j, value: x[j] * (row[c] - mean) });
  }
  return out.sort((a, b) => Math.abs(b.value) - Math.abs(a.value)).slice(0, top);
}

/** A name for an input dimension: the embedding dimensions are numbered, the four appended flags named. */
export function featureName(j: number, dim: number): string {
  const extra = ["actor is the United States", "actor is China", "the text mentions the United States", "the text mentions China"];
  const base = dim - extra.length;
  return j < base ? `embedding dimension ${j + 1}` : extra[j - base];
}

/** Macro F1 over the classes, the pipeline's selection metric. */
export function macroF1(xs: number[][], ys: number[], head: Head, k: number): number | null {
  if (xs.length === 0) return null;
  const tp = Array(k).fill(0) as number[];
  const fp = Array(k).fill(0) as number[];
  const fn = Array(k).fill(0) as number[];
  for (let i = 0; i < xs.length; i++) {
    const p = argmax(predict(xs[i], head));
    if (p === ys[i]) tp[p] += 1;
    else {
      fp[p] += 1;
      fn[ys[i]] += 1;
    }
  }
  const f1 = Array.from({ length: k }, (_, c) => (tp[c] === 0 ? 0 : (2 * tp[c]) / (2 * tp[c] + fp[c] + fn[c])));
  return f1.reduce((a, b) => a + b, 0) / k;
}

export function confusion(xs: number[][], ys: number[], head: Head, k: number): number[][] {
  const m = Array.from({ length: k }, () => Array(k).fill(0) as number[]);
  for (let i = 0; i < xs.length; i++) m[ys[i]][argmax(predict(xs[i], head))] += 1;
  return m;
}
