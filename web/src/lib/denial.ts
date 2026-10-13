/**
 * The companion project "Denial without Substitution" (Investigating with AI, Sciences Po, 2026), supplied by the owner as
 * its data files (DECISIONS 94) and served from /data/companion/denial. Everything here is that project's record and that
 * project's reading: 31 studies reduced to claims with page citations, dated events with sources, propositions and
 * mechanisms with their evidence, country verdicts, projects, the coded governments, UN ideal points, a 2026 survey and
 * the project's own correlations. The helpers below only select, count and label; nothing is rescored.
 */
import { IN_SCOPE } from "./constants";

export const DENIAL_BASE = "/data/companion/denial";
export const DENIAL_TITLE = "Denial without Substitution";
export const DENIAL_CREDIT = "Investigating with AI, Sciences Po, 2026";

export interface DenialDoc { doc_id: string; short_citation: string; harvard_reference: string; doc_type: string; year: string; research_question: string; methodology: string; summary: string; relevance_level: string; stance_on_premise: string; themes: string; n_claims: string }
export interface DenialClaim { id: string; d: string; c: string; t: string; q: string; e: string; co: string[]; ps: string; pe: string; se: string; m: string[]; st: string; u: string; pl?: string; an?: string }
export interface DenialEvent { id: string; dt: string; y: number; ev: string; co: string; ty: string; pw: string; sg: string; o: string; d: string; src: string; u?: string; k: boolean; b: string; v: string }
export interface DenialProp { pid: string; proposition: string; mechanisms: string[]; scope_countries: string; period: string; sectors: string; supporting: string[]; qualifying: string[]; contradicting: string[]; external: string[]; confidence: string; note: string }
export interface DenialMech { mid: string; explanation: string; prediction: string; propositions: string[]; evidence_for: string[]; evidence_against: string[]; cases: string; counterexamples: string; scope_conditions: string; assessment: string; gaps: string }
export interface DenialContra { cid: string; topic: string; position_a: string; claims_a: string[]; position_b: string; claims_b: string[]; status: string; analyst_reading: string }
export interface DenialCountry { iso: string; name: string; verdict: string; politics: string; china: string; us: string; assessment: string; claims: string[]; projects: string[] }
export interface DenialProject { key: string; name: string; country: string; sector: string; actor: string; nat: string; instrument: string; year: string; announced: string; approved: string; disbursed: string; status: string; stage: string; records: string[]; note: string }
export interface DenialGap { gid: string; gap: string; mechanisms: string; source: string; priority: string }
export interface DenialAudit { nid: string; section: string; synthesis_claim: string; verdict: string; corpus_evidence: string[]; note: string; action: string }
export interface DenialAdmin { id: string; name: string; party: string; start: string; end: string; elected: string[]; d20: string[]; summary: string; instruments: string[]; claims: string[] }
export interface DenialExt { pub: string; ti: string; u: string; v: string }
export interface DenialData { docs: DenialDoc[]; claims: DenialClaim[]; timeline: DenialEvent[]; ext: Record<string, DenialExt>; props: DenialProp[]; mechs: DenialMech[]; contra: DenialContra[]; countries: DenialCountry[]; projects: DenialProject[]; gaps: DenialGap[]; audit: DenialAudit[]; admins: DenialAdmin[] }

export interface DenialGov { id: string; n: string; p: string; s: string; e: string | null; int: boolean; how: string | null; ideo: string; il: string; us: string; cn: string; net: number; sh: string; shift: string; facts: string[]; src: { t: string; pub: string; d: string; u: string; wp: boolean }[]; conf?: string; notes?: string; img?: { file: string; author: string; license: string; source_url: string; wiki: string } }
export interface DenialSurveyCountry { china_pos: number | null; us_pos: number | null; china_neg: number | null; us_neg: number | null; year: string; source: string; confirmed: boolean; note?: string }
export interface DenialR4 {
  meta: { built: string; stance_scale: Record<string, number>; coding: string };
  govs: Record<string, DenialGov[]>;
  tr: { d: Record<string, Record<string, [number, number]>>; source: string; eu?: Record<string, Record<string, number>>; eusrc?: string };
  un: { d: Record<string, Record<string, { u: number; ip: number; c: number }>>; ip: Record<string, Record<string, number>>; ipsrc: string; source: string; ver: string; date: string };
  lb: { article: Record<string, unknown>; primary: unknown; question_wording: unknown; region: { us: Record<string, { pos: number; neg: number; ns: number }>; china: Record<string, { pos: number; neg: number; ns: number }>; source: string }; countries: Record<string, DenialSurveyCountry>; series: unknown; fieldwork: Record<string, unknown>; caveats: string[] };
}
export interface DenialImage { key: string; file: string; w: number; h: number; sections: string[]; countries: string[]; links: string[]; caption: string; caption_es: string; alt: string; alt_es: string; author: string; license: string; license_url: string; source_url?: string }
export interface DenialR3 {
  countries: Record<string, { news: { id: string; kind: string; claim: string; date: string; source_title: string; author_institution: string; pub_date: string; url: string }[]; gov: unknown; trade: Record<string, { v: number; y: string; id: string; url: string }> }>;
  countries_meta: { summary: string; gaps: string[] };
  images: DenialImage[];
  us: { summary: string };
  cases: { summary: string; cases: { id: string; kind: string; claim: string; date?: string; url?: string }[] };
  mexico: { summary: string };
  trade: { meta: { source: string; unit: string; year: number; url: string; groups: Record<string, string> }; derived: Record<string, number> };
  verification: { record_id: string; issue: string; what_was_checked: string; sources: string; result: string; corrected_value: string; note: string }[];
}
export interface DenialSynth {
  vars: string[];
  /** "x|y" -> [r, p, n] across countries (each country's 2001–2023 mean) */
  between: Record<string, [number, number, number]>;
  /** "x|y" -> [r, p, n] within countries (country and year effects removed) */
  within: Record<string, [number, number, number]>;
  R: { descr: { n_obs: number; lean_mean: number; lean_sd: number; lean_2001: number; lean_2023: number } } & Record<string, unknown>;
}

export const VAR_LABEL: Record<string, string> = {
  lean: "trade lean to China (China's share of exports to the two)",
  ores: "ores and metals in exports",
  comm: "commodities in exports",
  ideo: "government ideology (left to right)",
  net: "government stance, US minus China",
  un_gap: "UN voting gap, US minus China",
  cn_events: "Chinese initiatives that year",
};

export type VerdictKind = "holds" | "qualifies" | "fails";
/** The project's verdict vocabulary: "supports" means the pattern (more US pressure, ties with China still grow) holds. */
export function verdictKind(verdict: string): VerdictKind {
  const v = verdict.toLowerCase();
  if (v.startsWith("supports")) return "holds";
  if (v.startsWith("challenges")) return "fails";
  return "qualifies";
}
export const VERDICT_LABEL: Record<VerdictKind, string> = { holds: "the pattern holds", qualifies: "holds only partly", fails: "the pattern fails" };

export type Stage = "announced" | "signed" | "under construction" | "operating" | "stalled" | "cancelled";
export const STAGES: { id: Stage; label: string }[] = [
  { id: "announced", label: "Announced" }, { id: "signed", label: "Signed, approved or financed" }, { id: "under construction", label: "Under construction" },
  { id: "operating", label: "Operating or completed" }, { id: "stalled", label: "Stalled" }, { id: "cancelled", label: "Cancelled" },
];
/** The project's own stage rule (its page's `stageOf`): the first word of the stage text decides. */
export function stageOf(p: { stage: string }): Stage {
  const s = p.stage.toLowerCase();
  if (s.startsWith("operat") || s.startsWith("complet")) return "operating";
  if (s.startsWith("signed") || s.startsWith("approved")) return "signed";
  return (STAGES.find((x) => s.startsWith(x.id))?.id ?? "announced") as Stage;
}

export const CONFIDENCE_ORDER = ["high", "medium-high", "medium", "low-medium", "low"];

/** Events per year and type, after the filters; years with no event are absent. */
export function eventsByYear(events: DenialEvent[], filter: { co?: string; pw?: string; ty?: string } = {}): { year: number; ty: string; n: number }[] {
  const by = new Map<string, { year: number; ty: string; n: number }>();
  for (const e of events) {
    if (filter.co && e.co !== filter.co) continue;
    if (filter.pw && e.pw !== filter.pw && !(filter.pw === "both" && e.pw === "both")) continue;
    if (filter.ty && e.ty !== filter.ty) continue;
    const k = `${e.y}|${e.ty}`;
    const c = by.get(k) ?? { year: e.y, ty: e.ty, n: 0 };
    c.n += 1;
    by.set(k, c);
  }
  return Array.from(by.values()).sort((a, b) => a.year - b.year || a.ty.localeCompare(b.ty));
}

/** One cell per country and year with the government in office on 1 July: its net stance (US minus China, −4..+4) and ideology. */
export function govCells(govs: Record<string, DenialGov[]>, from = 2001, to = 2026): { iso: string; year: number; net: number; ideo: string; name: string; us: string; cn: string }[] {
  const out: { iso: string; year: number; net: number; ideo: string; name: string; us: string; cn: string }[] = [];
  for (const [iso, list] of Object.entries(govs)) {
    for (let year = from; year <= to; year++) {
      const mid = `${year}-07-01`;
      const g = list.find((x) => x.s <= mid && (x.e == null || x.e >= mid));
      if (g) out.push({ iso, year, net: g.net, ideo: g.ideo, name: g.n, us: g.us, cn: g.cn });
    }
  }
  return out;
}

/** The project's trade lean per country and year: China's share of the two powers' imports from the country (unit-free). */
export function tradeLean(tr: DenialR4["tr"]): { iso: string; year: number; lean: number }[] {
  const out: { iso: string; year: number; lean: number }[] = [];
  for (const [iso, years] of Object.entries(tr.d)) {
    for (const [y, [cn, us]] of Object.entries(years)) {
      if (cn == null || us == null || cn + us <= 0) continue;
      out.push({ iso, year: Number(y), lean: cn / (cn + us) });
    }
  }
  return out.sort((a, b) => a.iso.localeCompare(b.iso) || a.year - b.year);
}

/** The correlation table: one row per variable pair with the between- and within-country coefficients. */
export function synthRows(s: DenialSynth): { pair: string; x: string; y: string; between: [number, number, number] | null; within: [number, number, number] | null }[] {
  const keys = Array.from(new Set([...Object.keys(s.between), ...Object.keys(s.within)]));
  return keys.map((pair) => {
    const [x, y] = pair.split("|");
    return { pair, x: VAR_LABEL[x] ?? x, y: VAR_LABEL[y] ?? y, between: s.between[pair] ?? null, within: s.within[pair] ?? null };
  }).sort((a, b) => Math.abs(b.between?.[0] ?? 0) - Math.abs(a.between?.[0] ?? 0));
}

export const inScope = (iso: string) => (IN_SCOPE as readonly string[]).includes(iso);

export async function loadDenial(): Promise<{ data: DenialData; r3: DenialR3; r4: DenialR4; synth: DenialSynth } | null> {
  try {
    const get = async <T,>(name: string) => {
      const res = await fetch(`${DENIAL_BASE}/${name}`);
      if (!res.ok) { await res.text().catch(() => undefined); throw new Error(`${name}: ${res.status}`); }
      return (await res.json()) as T;
    };
    const [data, r3, r4, synth] = await Promise.all([get<DenialData>("data.json"), get<DenialR3>("r3.json"), get<DenialR4>("r4.json"), get<DenialSynth>("synth.json")]);
    return Array.isArray(data.docs) && data.docs.length ? { data, r3, r4, synth } : null;
  } catch {
    return null;
  }
}
