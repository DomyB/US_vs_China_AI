import { COUNTRY_NAMES } from "./constants";
import { COMPONENT_LABEL } from "./indexView";

/**
 * The step-by-step pages: the records of the text corpus as points (words.json) and the index's country-years as
 * points (components.json). Everything here is arithmetic on the exported numbers: tokens are whitespace words of
 * a real title, distances are cosine or Euclidean on the exported values, the small principal-component analysis
 * runs on at most six dimensions in the browser. Nothing is imputed: a missing component leaves a row out of a
 * computation that needs it, and the page says so.
 */

// ---------- words.json ----------

export interface WordDoc {
  id: string;
  /** ISO3 */
  c: string;
  /** doc_type: news, bill, … */
  t: string;
  /** date YYYY-MM-DD */
  d: string;
  /** language */
  l: string | null;
  /** outlet source id, chamber or source id */
  o: string | null;
  /** stance toward the United States / China where coded (−2…2), else null */
  su: number | null;
  sc: number | null;
  /** index into `topics`, null when the narrative model did not place the record */
  k: number | null;
  x: number;
  y: number;
  /** ids of the three nearest records in the full embedding space */
  nn: string[];
  /** original title, cut at 160 characters */
  h: string | null;
  /** English title where a translation exists */
  e: string | null;
}

export interface WordsTopic {
  id: number;
  label: string;
  keywords: string[];
  n: number;
  /** the record nearest the narrative's centroid */
  example: string | null;
}

export interface FeaturedDoc {
  id: string;
  topic: number;
  vector: number[];
  near: { id: string; sim: number }[];
  far: { id: string; sim: number }[];
}

export interface WordsFile {
  dataset: string;
  generated_on: string;
  layer: "model";
  model: string | null;
  dim: number;
  n: number;
  n_documents: number;
  by_type: Record<string, number>;
  by_language: Record<string, number>;
  pca: { explained: number[]; method: string };
  neighbours: { k: number; metric: string };
  topics: WordsTopic[];
  featured: FeaturedDoc[];
  docs: WordDoc[];
}

/** Whitespace words with punctuation trimmed, the way a reader splits a title (the model's own tokens are sub-word pieces). */
export function words(text: string): string[] {
  return text
    .split(/\s+/)
    .map((w) => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ""))
    .filter(Boolean);
}

export function cosine(a: number[], b: number[]): number | null {
  if (a.length !== b.length || a.length === 0) return null;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return null;
  return dot / Math.sqrt(na * nb);
}

/** A sensible first example: the featured record of the largest narrative that has an English translation, else any featured, else the first doc. */
export function defaultExample(file: WordsFile): string | null {
  const byId = new Map(file.docs.map((d) => [d.id, d]));
  const withTopic = file.featured
    .map((f) => ({ f, topic: file.topics[f.topic], doc: byId.get(f.id) }))
    .filter((x) => x.doc && x.topic)
    .sort((a, b) => b.topic!.n - a.topic!.n);
  const translated = withTopic.find((x) => x.doc!.e && x.doc!.t === "news");
  return (translated ?? withTopic[0])?.f.id ?? file.docs[0]?.id ?? null;
}

export const TYPE_LABEL: Record<string, string> = { news: "headline", bill: "bill", hearing: "hearing", vote: "vote", speech: "speech", document: "document" };

export function typeLabel(t: string): string {
  return TYPE_LABEL[t] ?? t.replace(/_/g, " ");
}

export const STANCE_WORD: Record<number, string> = { [-2]: "strongly against", [-1]: "against", 0: "neutral", 1: "in favour", 2: "strongly in favour" };

// ---------- components.json ----------

export interface ComponentRow {
  c: string;
  y: number;
  a: "US" | "CN";
  k: string;
  raw: number | null;
  norm: number | null;
  ok: boolean;
  note: string | null;
}

export interface IndexValueRow {
  c: string;
  y: number;
  a: "US" | "CN";
  i: string;
  v: number | null;
  n: number | null;
}

export interface ComponentsFile {
  dataset: string;
  generated_on: string;
  layer: "model";
  scales: Record<string, { lo: number; hi: number; n: number }>;
  components: ComponentRow[];
  index: IndexValueRow[];
  note: string;
}

export const COMPONENT_ORDER = ["trade_export_share", "trade_import_share", "finance_flow", "debt_stock", "diplomatic_alignment", "legislative_stance"] as const;
export type ComponentName = (typeof COMPONENT_ORDER)[number];

/** the four components both actors can have (debt is China-only, stance needs five scored records): the geometry stage runs on these */
export const SHARED_COMPONENTS: readonly ComponentName[] = ["trade_export_share", "trade_import_share", "finance_flow", "diplomatic_alignment"];

export const COMPONENT_UNIT: Record<string, string> = {
  trade_export_share: "share of the country's mineral exports going to the actor",
  trade_import_share: "share of the country's mineral imports coming from the actor",
  finance_flow: "documented official finance over three years, as a share of GDP",
  debt_stock: "debt owed to the actor as a share of GDP",
  diplomatic_alignment: "share of UN General Assembly votes cast with the actor",
  legislative_stance: "mean coded stance of the legislature's records toward the actor (−1 to 1)",
};

export function componentLabel(k: string): string {
  return COMPONENT_LABEL[k] ?? k.replace(/_/g, " ");
}

export interface CountryYearPoint {
  c: string;
  name: string;
  y: number;
  a: "US" | "CN";
  /** normalised value per component, null where unavailable */
  v: Partial<Record<ComponentName, number | null>>;
  raw: Partial<Record<ComponentName, number | null>>;
  notes: Partial<Record<ComponentName, string | null>>;
  /** the published composite (null when held back or absent) */
  composite: number | null;
  n_components: number | null;
}

/** One point per (country, year, actor) from the component rows, with the published composite attached. */
export function points(file: ComponentsFile): CountryYearPoint[] {
  const map = new Map<string, CountryYearPoint>();
  for (const r of file.components) {
    const key = `${r.c}|${r.y}|${r.a}`;
    let p = map.get(key);
    if (!p) {
      p = { c: r.c, name: COUNTRY_NAMES[r.c] ?? r.c, y: r.y, a: r.a, v: {}, raw: {}, notes: {}, composite: null, n_components: null };
      map.set(key, p);
    }
    const k = r.k as ComponentName;
    p.v[k] = r.ok ? r.norm : null;
    p.raw[k] = r.ok ? r.raw : null;
    p.notes[k] = r.note;
  }
  for (const r of file.index) {
    if (r.i !== "influence") continue;
    const p = map.get(`${r.c}|${r.y}|${r.a}`);
    if (p) {
      p.composite = r.v;
      p.n_components = r.n;
    }
  }
  return Array.from(map.values()).sort((a, b) => a.c.localeCompare(b.c) || a.y - b.y || a.a.localeCompare(b.a));
}

/** Winsorised min–max to 0–100, the index's own normalisation; null outside the known bounds set. */
export function normalise(raw: number, scale: { lo: number; hi: number } | undefined): number | null {
  if (!scale || scale.hi === scale.lo) return null;
  const clipped = Math.min(Math.max(raw, scale.lo), scale.hi);
  return ((clipped - scale.lo) / (scale.hi - scale.lo)) * 100;
}

/** The equal-weight mean over the available components: the composite's own formula (at least `min` components). */
export function composite(p: CountryYearPoint, min = 3): { value: number | null; used: ComponentName[] } {
  const used = COMPONENT_ORDER.filter((k) => p.v[k] != null);
  if (used.length < min) return { value: null, used };
  return { value: used.reduce((s, k) => s + (p.v[k] as number), 0) / used.length, used };
}

/** Euclidean distance over the components both points have, divided by the square root of their count (so a pair
 *  sharing fewer components is not nearer by construction); null with fewer than `min` shared components. */
export function distance(a: CountryYearPoint, b: CountryYearPoint, min = 3): { d: number | null; shared: ComponentName[] } {
  const shared = COMPONENT_ORDER.filter((k) => a.v[k] != null && b.v[k] != null);
  if (shared.length < min) return { d: null, shared };
  const s = shared.reduce((acc, k) => acc + ((a.v[k] as number) - (b.v[k] as number)) ** 2, 0);
  return { d: Math.sqrt(s / shared.length), shared };
}

export function nearestPoints(all: CountryYearPoint[], target: CountryYearPoint, k = 8, sameActor = true): { p: CountryYearPoint; d: number; shared: ComponentName[] }[] {
  const out: { p: CountryYearPoint; d: number; shared: ComponentName[] }[] = [];
  for (const p of all) {
    if (p === target || (sameActor && p.a !== target.a)) continue;
    const { d, shared } = distance(target, p);
    if (d != null) out.push({ p, d, shared });
  }
  return out.sort((x, y) => x.d - y.d).slice(0, k);
}

/** Eigen-decomposition of a small symmetric matrix by cyclic Jacobi rotations: eigenvalues descending with their vectors. */
export function symmetricEigen(m: number[][], sweeps = 60): { values: number[]; vectors: number[][] } {
  const n = m.length;
  const a = m.map((r) => r.slice());
  const v: number[][] = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
  for (let sweep = 0; sweep < sweeps; sweep++) {
    let off = 0;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += a[i][j] ** 2;
    if (off < 1e-18) break;
    for (let p = 0; p < n; p++) {
      for (let q = p + 1; q < n; q++) {
        if (Math.abs(a[p][q]) < 1e-15) continue;
        const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;
        for (let k = 0; k < n; k++) {
          const akp = a[k][p];
          const akq = a[k][q];
          a[k][p] = c * akp - s * akq;
          a[k][q] = s * akp + c * akq;
        }
        for (let k = 0; k < n; k++) {
          const apk = a[p][k];
          const aqk = a[q][k];
          a[p][k] = c * apk - s * aqk;
          a[q][k] = s * apk + c * aqk;
        }
        for (let k = 0; k < n; k++) {
          const vkp = v[k][p];
          const vkq = v[k][q];
          v[k][p] = c * vkp - s * vkq;
          v[k][q] = s * vkp + c * vkq;
        }
      }
    }
  }
  const order = Array.from({ length: n }, (_, i) => i).sort((i, j) => a[j][j] - a[i][i]);
  return { values: order.map((i) => a[i][i]), vectors: order.map((i) => v.map((row) => row[i])) };
}

export interface SmallPca {
  /** per input row: [first, second] coordinate */
  coords: [number, number][];
  explained: [number, number];
  /** the two axes as unit vectors over the input dimensions */
  axes: [number[], number[]];
  mean: number[];
}

/** Principal components of rows with no missing value (centred, no scaling: the inputs share one 0–100 scale). */
export function smallPca(rows: number[][]): SmallPca | null {
  const n = rows.length;
  if (n < 3) return null;
  const d = rows[0].length;
  const mean = Array.from({ length: d }, (_, j) => rows.reduce((s, r) => s + r[j], 0) / n);
  const cov = Array.from({ length: d }, () => Array(d).fill(0) as number[]);
  for (const r of rows) for (let i = 0; i < d; i++) for (let j = 0; j < d; j++) cov[i][j] += (r[i] - mean[i]) * (r[j] - mean[j]);
  for (let i = 0; i < d; i++) for (let j = 0; j < d; j++) cov[i][j] /= n - 1;
  const { values, vectors } = symmetricEigen(cov);
  const total = values.reduce((s, x) => s + Math.max(x, 0), 0) || 1;
  const ax1 = vectors[0];
  const ax2 = vectors[1] ?? Array(d).fill(0);
  // a stable sign: the axis points toward the component with the largest loading
  const sign = (ax: number[]) => (ax[ax.map(Math.abs).indexOf(Math.max(...ax.map(Math.abs)))] < 0 ? -1 : 1);
  const s1 = sign(ax1);
  const s2 = sign(ax2);
  const a1 = ax1.map((x) => x * s1);
  const a2 = ax2.map((x) => x * s2);
  const coords = rows.map((r) => [r.reduce((s, x, j) => s + (x - mean[j]) * a1[j], 0), r.reduce((s, x, j) => s + (x - mean[j]) * a2[j], 0)] as [number, number]);
  return { coords, explained: [Math.max(values[0], 0) / total, Math.max(values[1] ?? 0, 0) / total], axes: [a1, a2], mean };
}

/** Project a direction (e.g. equal weights) onto the two axes, for drawing it on the map. */
export function projectDirection(pca: SmallPca, direction: number[]): [number, number] {
  const n = Math.sqrt(direction.reduce((s, x) => s + x * x, 0)) || 1;
  const u = direction.map((x) => x / n);
  return [u.reduce((s, x, j) => s + x * pca.axes[0][j], 0), u.reduce((s, x, j) => s + x * pca.axes[1][j], 0)];
}
