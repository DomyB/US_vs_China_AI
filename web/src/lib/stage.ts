/**
 * "Two powers, one stage": the team's Strata prototype (draft v0.2, 13 October 2026), supplied by the owner and served
 * from /data/companion/prototype as supplied (DECISIONS 95): the team's own trade panel (CEPII BACI HS96 for 2001–2024
 * and UN Comtrade monthly data for 2025–2026, by exporter, mineral, stage, basket and partner group, team R scripts
 * 01–04) and its record lists (events with lanes and tiers, the commitment ladder, the sixteen pressure cases, the
 * quotes, the coded terms of the six focus countries, the alignment markers, the five acts). The functions below port
 * the prototype's own readers: `tradeSeries` is its aggregation rule, kept line for line, so the four numbers it states
 * reproduce exactly.
 */

import { fetchOnce } from "@/lib/data";

export const STAGE_BASE = "/data/companion/prototype";
export const Y0 = 2001;
export const Y1 = 2026;
export const YEARS = Array.from({ length: Y1 - Y0 + 1 }, (_, i) => Y0 + i);
export const SOURCE_BREAK = 2024.5;
export const YTD_YEAR = 2026;

/** row: [c, y, m, s(0 raw, 1 processed), b(0 core, 1 industrial), CHN, USA, BEN, LAC, ROW, qty]; values US$ million (FOB) */
export interface TradePanel { Y: number[]; C: string[]; M: string[]; rows: number[][]; cov25: string[]; m26: Record<string, number> }
export interface StageEvent { id: string; date: string; year: number; month: number; lane: "CHN" | "USA" | "LAC"; isos: string[]; type: string; tier: number; title: string; minerals: string[]; src: string; ref: string }
export interface StageQuote { id: string; date: string; year: number; country: string; speaker: string; role: string; bloc: string; en: string; orig: string; lang: string; src: string; url: string; cn: string; us: string; theme: string }
export interface StageProject { id: string; name: string; isos: string[]; power: "CHN" | "USA" | "OTH"; status: string; years: string; sector: string; amount: string; lat: number | null; lon: number | null; minerals: string[]; start: number }
export interface StageCase { name: string; iso: string; years: string; outcome: string; cause: string; alt: string }
export interface StageStep { act: number; t: string; kinds: string[]; p: string; chart?: string; ex?: string }
export interface StageMineral { id: string; name: string; sym: string; basket: "core" | "industrial" | "mixed"; uses: string[]; hs: string; us: boolean; cn: boolean; profile: string[] }
export interface StageRecords {
  PERIODS: { id: string; label: string; act: string; name: string; from: number; to: number }[];
  COUNTRY_NAMES: Record<string, string>;
  FOCUS: string[];
  GROUPS: Record<string, { label: string; isos: string[] }>;
  USES: Record<string, string>;
  MINERALS: StageMineral[];
  STAGES: Record<string, string>;
  ETYPES: Record<string, string>;
  LANES: Record<string, string>;
  EVENTS: StageEvent[];
  US_ADMIN: [string, number, number, string][];
  CN_LEAD: [string, number, number][];
  TERMS: Record<string, [number, string, "L" | "C" | "R"][]>;
  ORI_LABEL: Record<string, string>;
  RECOG: Record<string, number>;
  TAIWAN_ALLIES: string[];
  BRI: Record<string, number>;
  BRI_EXIT: Record<string, number>;
  FTA_CN: Record<string, number>;
  FTA_US: Record<string, number>;
  VERDICT: Record<string, "holds" | "part" | "fails">;
  VERDICT_LABEL: Record<string, string>;
  STATS: Record<string, unknown>;
  QUOTES: StageQuote[];
  POWERS: Record<string, string>;
  STATUS_LABEL: Record<string, string>;
  PROJECTS: StageProject[];
  CASES: StageCase[];
  PARTNER_LABEL: Record<string, string>;
  STEPS: StageStep[];
  ACTS: string[];
  LENDING: [string, number, string][];
  THEMES: string[];
  defs: [string, string][];
  src: [string, string, string, string, string][];
  FINANCE: Record<string, { CN: Record<string, number | null>; US: Record<string, number | null>; swap: Record<string, number> }>;
  FIN_LAST: { CN: number; US: number };
  note: string;
}

export type Partner = "CHN" | "USA" | "BEN" | "LAC" | "ROW";
export const PARTNERS: Partner[] = ["CHN", "USA", "BEN", "LAC", "ROW"];
export interface TradeYear { year: number; total: number; CHN: number; USA: number; BEN: number; LAC: number; ROW: number; q: number; n: number; comtrade: boolean }

/** The prototype's aggregation: exporter-side values summed over the selection; a Comtrade year (2025–26) carries China, the US and everyone else in ROW. */
export function tradeSeries(tr: TradePanel, { isos, resource = "all", stage = "all" }: { isos: readonly string[]; resource?: string; stage?: "all" | "raw" | "processed" }): TradeYear[] {
  const ci = new Map(tr.C.map((c, i) => [c, i]));
  const mi = new Map(tr.M.map((m, i) => [m, i]));
  const cset = new Set(isos.map((i) => ci.get(i)).filter((v): v is number => v != null));
  const m = resource !== "all" && resource !== "core" && resource !== "industrial" ? mi.get(resource) ?? -1 : null;
  const bsk = resource === "core" ? 0 : resource === "industrial" ? 1 : null;
  const st = stage === "raw" ? 0 : stage === "processed" ? 1 : null;
  const out: (TradeYear & { rep: Set<number> })[] = YEARS.map((year) => ({ year, total: 0, CHN: 0, USA: 0, BEN: 0, LAC: 0, ROW: 0, q: 0, n: 0, comtrade: year > SOURCE_BREAK, rep: new Set<number>() }));
  for (const r of tr.rows) {
    if (!cset.has(r[0])) continue;
    if (m != null && r[2] !== m) continue;
    if (bsk != null && r[4] !== bsk) continue;
    if (st != null && r[3] !== st) continue;
    const o = out[r[1]];
    if (!o) continue;
    const t = (r[5] || 0) + (r[6] || 0) + (r[7] || 0) + (r[8] || 0) + (r[9] || 0);
    o.total += t; o.CHN += r[5] || 0; o.USA += r[6] || 0; o.BEN += r[7] || 0; o.LAC += r[8] || 0; o.ROW += r[9] || 0; o.q += r[10] || 0;
    o.rep.add(r[0]);
  }
  return out.map(({ rep, ...o }) => ({ ...o, n: rep.size }));
}

export const share = (r: TradeYear | undefined, k: Partner): number | null => (r && r.total > 0 ? r[k] / r.total : null);

/** The government in office at mid-year, from the prototype's coded terms (six focus countries only). */
export function termAt(terms: StageRecords["TERMS"], iso: string, year: number): { name: string; ori: "L" | "C" | "R"; from: number } | null {
  const list = terms[iso];
  if (!list) return null;
  const t = year + 0.5;
  let cur: [number, string, "L" | "C" | "R"] | null = null;
  for (const term of list) if (term[0] <= t) cur = term;
  return cur ? { name: cur[1], ori: cur[2], from: cur[0] } : null;
}

/** One segment per term for a strip chart, clipped to the window. */
export function termSegments(terms: StageRecords["TERMS"], from = Y0, to = Y1 + 1): { iso: string; name: string; ori: "L" | "C" | "R"; x1: number; x2: number }[] {
  const out: { iso: string; name: string; ori: "L" | "C" | "R"; x1: number; x2: number }[] = [];
  for (const [iso, list] of Object.entries(terms)) {
    list.forEach((term, i) => {
      const x1 = Math.max(term[0], from);
      const x2 = Math.min(list[i + 1]?.[0] ?? to, to);
      if (x2 > x1) out.push({ iso, name: term[1], ori: term[2], x1, x2 });
    });
  }
  return out;
}

/** The prototype's four headline numbers, recomputed from its panel. */
export function fourNumbers(tr: TradePanel, isos: readonly string[]) {
  const all = tradeSeries(tr, { isos });
  const core = tradeSeries(tr, { isos, resource: "core" });
  const a = all[2001 - Y0], b = all[2024 - Y0], c = core[2024 - Y0];
  return { cn2001: share(a, "CHN"), cn2024: share(b, "CHN"), us2001: share(a, "USA"), us2024: share(b, "USA"), value2001: a.total / 1000, value2024: b.total / 1000, coreCn2024: share(c, "CHN"), coreUs2024: share(c, "USA") };
}

/** Both prototype files, each fetched once per page load (`fetchOnce`, shared with every other reader of the records). */
export async function loadStage(): Promise<{ tr: TradePanel; rec: StageRecords } | null> {
  try {
    const [tr, rec] = await Promise.all([fetchOnce<TradePanel>(`${STAGE_BASE}/trade.json`), fetchOnce<StageRecords>(`${STAGE_BASE}/records.json`)]);
    return Array.isArray(tr.rows) && tr.rows.length ? { tr, rec } : null;
  } catch {
    return null;
  }
}

/** The record lists alone (the coded terms, the cases, the quotes), for pages that need no trade panel; null when the file is absent. */
export async function loadStageRecords(): Promise<StageRecords | null> {
  try {
    const rec = await fetchOnce<StageRecords>(`${STAGE_BASE}/records.json`);
    return rec && typeof rec === "object" && rec.TERMS ? rec : null;
  } catch {
    return null;
  }
}

/** The hypothesis cards of the prototype's Balance page, in its words (the figures it computed live are stated in the reading where they are stated). */
export const HYPOTHESES = [
  { h: "H1", t: "Alignment gap", claim: "China's state-directed capital turns announcements into projects faster than US private capital.", status: "Not yet testable", kinds: ["ana", "interp"], method: "Compare the share of announced projects that reach construction and operation, and the time each step takes, by investor, on a project list that names every investor.", reading: "The money gap is documented (about US$20 of Chinese documented official finance for every US$1 of US finance in 2015–2021). Conversion rates are not: the ladder lists the commitments that mattered to the rivalry, so it is not a sample of everything announced.", href: "/stage#s-ladder" },
  { h: "H2", t: "Ideological conditionality", claim: "US engagement narrows with partners' ideology; China engages governments of any orientation.", status: "Mixed (descriptive)", kinds: ["fact", "ana"], method: "Official finance per country-year by the orientation of the government in office (China 2001–2021, US 2007–2026), and the change in China's export share over each term. Next: regressions with country and year fixed effects.", reading: "Chinese money and trade grew under left, centre and right governments alike. US finance per year is larger under right-wing governments, but most of it is Brazil in 2019–2023, when DFC lending grew everywhere, so time and orientation are confounded.", href: "/stage#s-timeline" },
  { h: "H3", t: "Right turn favours the US", claim: "Right-wing governments shift mineral exports towards the US; left-wing ones towards China.", status: "Mixed (descriptive)", kinds: ["fact", "ana"], method: "Before/after comparison around each inauguration that changed orientation in the six focus countries: export shares in the three years after minus the three years before, net of the same change for the rest of the region.", reading: "With prices and mine cycles moving at the same time, this is a coincidence count, not an effect.", href: "/stage#s-timeline" },
  { h: "H4", t: "Denial without substitution", claim: "US pressure can remove Chinese options, but rarely replaces them with a US or allied alternative.", status: "Supported in part (companion study)", kinds: ["ana"], method: "16 documented cases, 2018–2026, each coded for the US instrument, the outcome for the Chinese-linked option, whether US pressure is the documented cause, and whether an alternative was built.", reading: "A source names US pressure as the cause in only one case; \"plausible\" in most. None of the alternatives is a like-for-like project paid for with US public money.", href: "/denial" },
];
