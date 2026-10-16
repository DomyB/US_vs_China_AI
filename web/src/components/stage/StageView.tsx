"use client";

import * as Plot from "@observablehq/plot";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { PlotFigure, type PlotOptions } from "@/components/charts/PlotFigure";
import { Exhibit, KeyNumber, StepCard } from "@/components/story/Chapter";
import { WideFigure } from "@/components/story/Ch3Iceberg";
import { LayerLabel } from "@/components/ui/Badges";
import { PageGuide, Reading } from "@/components/ui/Reading";
import { HeaderPicture } from "@/components/ui/Picture";
import { SectionNav } from "@/components/ui/SectionNav";
import { InsightsSkeleton } from "@/components/ui/Skeleton";
import { ACTOR_COLOR, IN_SCOPE, OTHER_COLOR } from "@/lib/constants";
import { fmtPct } from "@/lib/format";
import { HYPOTHESES, PARTNERS, SOURCE_BREAK, Y0, fourNumbers, loadStage, share, termSegments, tradeSeries, type Partner, type StageRecords, type TradePanel } from "@/lib/stage";
import { RESEARCH_QUESTION, TEAM_CITATION } from "@/lib/team";

const SECTIONS = [
  { id: "s-numbers", label: "Four numbers" }, { id: "s-acts", label: "Five acts" }, { id: "s-trade", label: "Baskets & stages" }, { id: "s-timeline", label: "Timeline" },
  { id: "s-ladder", label: "Ladder & cases" }, { id: "s-hyp", label: "Hypotheses" }, { id: "s-quotes", label: "Quotes" }, { id: "s-states", label: "33 states" }, { id: "s-methods", label: "Methods" },
];
const PARTNER_COLOR: Record<Partner, string> = { CHN: ACTOR_COLOR.CN, USA: ACTOR_COLOR.US, BEN: "#b8860b", LAC: "#1d8f6e", ROW: OTHER_COLOR };
const ORI_COLOR = { L: "#c8441c", C: "#8a8f98", R: "#1f5fa8" } as const;
const KIND_LABEL: Record<string, string> = { fact: "Fact", ana: "Analysis", interp: "Interpretation" };
const KIND_TONE: Record<string, string> = { fact: "bg-ink text-surface", ana: "bg-surface-2 text-ink", interp: "border border-outline text-ink-3" };
const Kind = ({ k }: { k: string }) => <span className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide ${KIND_TONE[k] ?? ""}`}>{KIND_LABEL[k] ?? k}</span>;
const fmtBn = (v: number) => (v >= 10 ? `US$${v.toFixed(0)} bn` : `US$${v.toFixed(1)} bn`);

/** The team's prototype as a section of Strata: its trade panel read with its own rule, its record lists as supplied, its words labelled by kind. */
export function StageView() {
  const [d, setD] = useState<{ tr: TradePanel; rec: StageRecords } | null | undefined>(undefined);
  useEffect(() => { loadStage().then(setD).catch(() => setD(null)); }, []);
  const [group, setGroup] = useState("all");
  const [resource, setResource] = useState("all");
  const [stage, setStage] = useState<"all" | "raw" | "processed">("all");
  const [lane, setLane] = useState("");
  const [etype, setEtype] = useState("");
  const [project, setProject] = useState<string | null>(null);
  const isos = useMemo(() => (d ? d.rec.GROUPS[group]?.isos ?? Object.keys(d.rec.COUNTRY_NAMES) : []), [d, group]);
  const series = useMemo(() => (d ? tradeSeries(d.tr, { isos, resource, stage }) : []), [d, isos, resource, stage]);
  const four = useMemo(() => (d ? fourNumbers(d.tr, Object.keys(d.rec.COUNTRY_NAMES)) : null), [d]);
  const raw25 = useMemo(() => (d ? tradeSeries(d.tr, { isos: Object.keys(d.rec.COUNTRY_NAMES), stage: "raw" }) : []), [d]);
  const pro25 = useMemo(() => (d ? tradeSeries(d.tr, { isos: Object.keys(d.rec.COUNTRY_NAMES), stage: "processed" }) : []), [d]);
  const segments = useMemo(() => (d ? termSegments(d.rec.TERMS) : []), [d]);

  if (d === undefined) return <InsightsSkeleton />;
  if (!d || !four) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <p className="eyebrow">Two powers, one stage</p>
        <h1 className="serif mt-1 text-2xl font-bold sm:text-4xl">The team&apos;s prototype</h1>
        <p className="mt-3 text-sm text-ink-2">The prototype&apos;s files are not in this build.</p>
      </div>
    );
  }
  const { tr, rec } = d;
  const name = (iso: string) => rec.COUNTRY_NAMES[iso] ?? iso;
  const all33 = Object.keys(rec.COUNTRY_NAMES);
  const events = rec.EVENTS.filter((e) => (!lane || e.lane === lane) && (!etype || e.type === etype)).sort((a, b) => a.date.localeCompare(b.date));
  const picked = rec.PROJECTS.find((p) => p.id === project) ?? null;
  const ladder = ["announced", "committed", "construction", "operating", "stalled", "cancelled"].map((s) => ({ id: s, label: rec.STATUS_LABEL[s], items: rec.PROJECTS.filter((p) => p.status === s) }));
  const r2024 = series[2024 - Y0];
  const rawR = raw25[2025 - Y0], proR = pro25[2025 - Y0];
  // the finding cards read the prototype's own statement counts, finance totals and pressure cases instead of carrying typed figures
  const st = rec.STATS as Record<string, number>;
  const talkRatio = st.usOfficials && st.cnOfficials ? st.usOfficials / st.cnOfficials : null;
  const moneyRatio = st.cnMoney && st.usMoney ? st.cnMoney / st.usMoney : null;
  const removed = rec.CASES.filter((c) => ["Cancelled", "Delayed or frozen", "Transferred", "Modified", "Restricted"].includes(c.outcome)).length;
  const altPartial = rec.CASES.filter((c) => c.alt === "partial").length;
  const caseFrom = Math.min(...rec.CASES.map((c) => parseInt(c.years, 10)).filter((y) => Number.isFinite(y)));
  // the technology core: the first year after which China's share stays above the US share to the last BACI year
  const coreAll = tradeSeries(tr, { isos: all33, resource: "core" });
  const coreFlip = (() => {
    let flip: number | null = null;
    for (let y = 2024; y >= Y0; y--) {
      const r = coreAll[y - Y0];
      if ((share(r, "CHN") ?? 0) > (share(r, "USA") ?? 0)) flip = y;
      else break;
    }
    return flip;
  })();

  const shareFigure = (
    <PlotFigure
      options={{
        height: 300, marginLeft: 48,
        x: { label: null, tickFormat: (v: number) => String(v) },
        y: { label: "↑ share of the selection's exports", domain: [0, 1], grid: true, tickFormat: (v: number) => fmtPct(v, 0) },
        color: { legend: true, domain: PARTNERS.map((p) => rec.PARTNER_LABEL[p]), range: PARTNERS.map((p) => PARTNER_COLOR[p]) },
        marks: [
          ...rec.PERIODS.map((p) => Plot.rectX([p], { x1: p.from, x2: p.to + 1, y1: 0, y2: 1, fill: "#000", fillOpacity: rec.PERIODS.indexOf(p) % 2 ? 0.03 : 0 })),
          Plot.areaY(series.filter((r) => r.total > 0).flatMap((r) => PARTNERS.map((p) => ({ year: r.year, v: share(r, p) ?? 0, k: rec.PARTNER_LABEL[p], o: PARTNERS.indexOf(p) }))), { x: "year", y: "v", fill: "k", order: "o", fillOpacity: 0.85, tip: true, title: (x: { year: number; v: number; k: string }) => `${x.year}${x.year > SOURCE_BREAK ? " (Comtrade, China, the US and everyone else)" : ""}: ${x.k} ${fmtPct(x.v, 1)}` }),
          Plot.ruleX([SOURCE_BREAK], { stroke: "#1b1d20", strokeDasharray: "3,3" }),
          Plot.text(rec.PERIODS, { x: (p: { from: number; to: number }) => (p.from + p.to + 1) / 2, y: 0.97, text: "act", fontSize: 9, fill: OTHER_COLOR }),
        ],
      } as PlotOptions}
      ariaLabel="Shares of the selection's critical-mineral exports by partner group and year, with the five acts shaded and the source break marked"
    />
  );
  const laneY = { CHN: "China", USA: "United States", LAC: "Latin America" } as const;
  const timelineFigure = (
    <PlotFigure
      options={{
        height: 200, marginLeft: 112,
        x: { label: null, domain: [2001, 2027], tickFormat: (v: number) => String(v) },
        y: { label: null, domain: Object.values(laneY) },
        // the radius is given in pixels per tier, not scaled; the act bands span the whole height (a rect with no y on a band scale draws nothing)
        r: { type: "identity" },
        color: { legend: true, domain: Object.values(rec.ETYPES), scheme: "tableau10" },
        marks: [
          ...rec.PERIODS.map((p, i) => Plot.rectX([p], { x1: p.from, x2: p.to + 1, fill: "#000", fillOpacity: i % 2 ? 0.05 : 0 })),
          ...rec.PERIODS.map((p) => Plot.text([p], { x: (p.from + p.to + 1) / 2, frameAnchor: "top", dy: 4, text: () => p.act, fontSize: 9, fill: "var(--ink-3)" })),
          Plot.dot(events.map((e) => ({ ...e, t: e.year + (e.month - 0.5) / 12, laneLabel: laneY[e.lane], typeLabel: rec.ETYPES[e.type] })), { x: "t", y: "laneLabel", fill: "typeLabel", r: (e: { tier: number }) => (e.tier === 1 ? 7 : e.tier === 2 ? 5 : 3.5), stroke: "#fff", tip: true, title: (e: { date: string; title: string; src: string; ref: string; isos: string[] }) => `${e.date}: ${e.title}${e.isos.length ? ` (${e.isos.map(name).join(", ")})` : ""}\n${e.ref}${e.src === "T" ? " · team narrative, unverified" : ""}` }),
        ],
      } as PlotOptions}
      ariaLabel="Dated events on three lanes, China, the United States and Latin America, 2001–2026, the five acts shaded"
    />
  );
  const politicsFigure = (
    <PlotFigure
      options={{
        height: 40 + 22 * rec.FOCUS.length, marginLeft: 112,
        x: { label: null, domain: [2001, 2027], tickFormat: (v: number) => String(v) },
        y: { label: null, domain: rec.FOCUS.map(name) },
        color: { legend: true, domain: ["Left", "Centre", "Right"], range: [ORI_COLOR.L, ORI_COLOR.C, ORI_COLOR.R] },
        marks: [
          Plot.rectX(segments.map((s) => ({ ...s, c: name(s.iso), ori: rec.ORI_LABEL[s.ori] })), { x1: "x1", x2: "x2", y: "c", fill: "ori", inset: 2, rx: 2, tip: true, title: (s: { name: string; ori: string; x1: number; x2: number }) => `${s.name}, ${s.ori}: ${Math.floor(s.x1)}–${s.x2 >= 2027 ? "" : Math.floor(s.x2)}` }),
          Plot.text(segments.filter((s) => s.x2 - s.x1 > 2.2).map((s) => ({ ...s, c: name(s.iso) })), { x: (s: { x1: number; x2: number }) => (s.x1 + s.x2) / 2, y: "c", text: "name", fontSize: 9, fill: "#fff" }),
          Plot.dot(Object.entries(rec.BRI).filter(([iso]) => rec.FOCUS.includes(iso)).map(([iso, y]) => ({ c: name(iso), y: y + 0.5, m: `Belt and Road memorandum ${y}` })), { x: "y", y: "c", symbol: "diamond", r: 4, fill: "#1b1d20", stroke: "#fff", tip: true, title: "m" }),
          Plot.dot(Object.entries(rec.FTA_CN).filter(([iso]) => rec.FOCUS.includes(iso)).map(([iso, y]) => ({ c: name(iso), y: y + 0.5, m: `FTA with China ${y}` })), { x: "y", y: "c", symbol: "square", r: 3.5, fill: ACTOR_COLOR.CN, stroke: "#fff", tip: true, title: "m" }),
          Plot.dot(Object.entries(rec.FTA_US).filter(([iso]) => rec.FOCUS.includes(iso)).map(([iso, y]) => ({ c: name(iso), y: Math.max(y, 2001) + 0.5, m: `FTA with the United States ${y}` })), { x: "y", y: "c", symbol: "square", r: 3.5, fill: ACTOR_COLOR.US, stroke: "#fff", tip: true, title: "m" }),
        ],
      } as PlotOptions}
      ariaLabel="Head-of-state orientation of the six focus countries by term, with Belt and Road and free-trade-agreement markers"
    />
  );

  return (
    <div className="mx-auto max-w-6xl px-4 pb-16 pt-6 sm:px-6">
      <header className="max-w-3xl">
        <p className="eyebrow">Two powers, one stage · the team&apos;s prototype, draft v0.2</p>
        <h1 className="serif mt-1 text-2xl font-bold leading-tight sm:text-4xl">How China and the United States compete for Latin America&apos;s critical minerals, and how the region responds</h1>
        <p className="mt-3 text-base leading-relaxed text-ink-2"><strong>Research question.</strong> {RESEARCH_QUESTION}</p>
        <p className="mt-2 text-sm text-ink-2">{all33.length} ECLAC states · {rec.FOCUS.length} focus countries ({rec.FOCUS.map(name).join(", ")}) · 2001 to 2026 · {rec.MINERALS.length} resources in two baskets · trade, finance, projects, events, statements. The trade figures are the team&apos;s own calculations (CEPII BACI HS96 for 2001–2024, UN Comtrade monthly data for 2025–2026, scripts 01–04); the records come from the two companion projects and keep their sources. Every block is labelled by the kind of knowledge it rests on: <Kind k="fact" /> <Kind k="ana" /> <Kind k="interp" />.</p>
        <div className="mt-3 flex flex-wrap items-center gap-2"><LayerLabel layer="facts" /><Link href="/prototype/index.html" className="text-xs underline">Open the prototype as supplied</Link></div>
        <div className="mt-4">
          <PageGuide
            purpose="The team's prototype reading, on its own panel: its trade panel, record lists and words as supplied, kept apart from this site's data."
            read="Every block carries the kind of knowledge it rests on. The trade figures are the prototype's numbers, recomputed from the team's own BACI and Comtrade panel by its own rule, not this site's reconciled series; where the two differ, the case files cite this site's."
            next={[{ href: "/story", label: "The story" }, { href: "/denial", label: "The companion study" }]}
          />
        <HeaderPicture id="bri" className="mt-3" />
        </div>
      </header>
      <div className="mt-5"><SectionNav items={SECTIONS} /></div>

      <section id="s-numbers" className="mt-6 scroll-mt-14">
        <h2 className="serif text-xl font-bold">The region in four numbers</h2>
        <Reading
          asks="What do the prototype's four headline numbers say, and from where? Four tiles from the team's own BACI and Comtrade panel, recomputed here by the same rule, not from this site's flows.json."
          how="Each tile is a share or a value in the team's panel, 2001 against 2024, over all the ECLAC states and the tracked resources, exporter-side values; the last tile narrows to the technology-core basket. A share is of the region's exports to every destination, not of the two powers' purchases."
        />
        <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KeyNumber value={<>{fmtPct(four.cn2001 ?? 0, 1)} → {fmtPct(four.cn2024 ?? 0, 1)}</>} label="China's share of the region's critical-mineral exports, 2001 → 2024 (BACI HS96, team scripts)" tone="cn" size="text-2xl sm:text-3xl" />
          <KeyNumber value={<>{fmtPct(four.us2001 ?? 0, 1)} → {fmtPct(four.us2024 ?? 0, 1)}</>} label="US share of the same exports, 2001 → 2024" tone="us" size="text-2xl sm:text-3xl" />
          <KeyNumber value={<>{fmtBn(four.value2001)} → {fmtBn(four.value2024)}</>} label="Value of those exports, current US$, mostly price-driven" size="text-2xl sm:text-3xl" />
          <KeyNumber value={<>{fmtPct(four.coreCn2024 ?? 0, 1)} vs {fmtPct(four.coreUs2024 ?? 0, 1)}</>} label={`Technology core in 2024, China vs the United States${coreFlip && coreFlip > Y0 ? `: leaned US until ${coreFlip - 1}, China since ${coreFlip}` : ""}`} size="text-2xl sm:text-3xl" />
        </div>
        <Reading
          says={`In the team's panel China's share of the region's exports went from ${fmtPct(four.cn2001 ?? 0, 1)} to ${fmtPct(four.cn2024 ?? 0, 1)} and the US share from ${fmtPct(four.us2001 ?? 0, 1)} to ${fmtPct(four.us2024 ?? 0, 1)} between 2001 and 2024; these are the prototype's numbers on its 33-state scope and its own HS list, so they differ from this site's reconciled series over twenty countries.`}
          saysKind="facts"
        />
        <div className="mt-4 card px-4 py-3 text-sm">
          <p className="eyebrow">Three actors, not two</p>
          <p className="mt-1">Latin American governments set the rules, choose partners and bargain over terms. The prototype treats them as actors in every section, not as the stage on which two powers compete: China buys, lends, then owns; the United States brings its market, the dollar, security and pressure; each link carries trade, investment and finance, diplomacy and narratives.</p>
        </div>
        <ol className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {[
            ["fact", "The market came first", `China's share of the region's critical-mineral exports rose from ${fmtPct(four.cn2001 ?? 0, 1)} in 2001 to ${fmtPct(four.cn2024 ?? 0, 1)} in 2024; the US share fell from ${fmtPct(four.us2001 ?? 0, 1)} to ${fmtPct(four.us2024 ?? 0, 1)}.`],
            ["fact", "Ore to China, metal to the US", `In 2025 (the countries reporting to Comtrade), China bought ${fmtPct(share(rawR, "CHN") ?? 0, 0)} of the region's ores and concentrates but ${fmtPct(share(proR, "CHN") ?? 0, 0)} of processed products; the United States bought ${fmtPct(share(rawR, "USA") ?? 0, 1)} of ores and ${fmtPct(share(proR, "USA") ?? 0, 0)} of processed products.`],
            ["ana", "Said and paid", `${talkRatio ? `US officials made ${talkRatio.toFixed(1)} statements for every Chinese one (${st.usOfficials} to ${st.cnOfficials} in the prototype's set)` : "The prototype counts more US than Chinese official statements"}; ${moneyRatio ? `Chinese institutions committed about US$${Math.round(moneyRatio)} for every US$1 of documented US finance (US$${st.cnMoney} bn to US$${st.usMoney} bn in its 2015–2021 window)` : "its finance totals are not in the records"}.`],
            ["ana", "Denial without substitution", `In ${rec.CASES.length} documented cases since ${caseFrom}, US pressure coincided with ${removed} Chinese-linked options being cancelled, frozen, transferred, modified or restricted; a US or allied alternative was built, in part, in ${altPartial}, and in none in full.`],
            ["fact", "Governments hedge", `${Math.round((st.latamNeither ?? 0) * 100)}% of ${st.latamN} statements by Latin American actors on critical minerals mention neither China nor the US; only ${st.latamBoth} mention both.`],
          ].map(([k, t, body], i) => (
            <li key={t} className="card px-4 py-3"><div className="flex items-center justify-between"><span className="font-mono text-[11px] text-ink-3">{i + 1}</span><Kind k={k} /></div><p className="serif mt-1 text-base font-bold leading-tight">{t}</p><p className="mt-1 text-sm text-ink-2">{body}</p></li>
          ))}
        </ol>
      </section>

      <section id="s-acts" className="mt-10 scroll-mt-14">
        <h2 className="serif text-xl font-bold">Two powers, one stage: the story in five acts</h2>
        <p className="mt-1 text-sm text-ink-2">Both capitals followed in parallel, 2001–2026, with the team&apos;s trade data at each turn. The acts are the prototype&apos;s periods; each break is still to be justified by a documented event or data break, by its own account.</p>
        <ol className="mt-3 space-y-3">
          {rec.STEPS.map((s, i) => (
            <li key={i} className="card px-4 py-3">
              <div className="flex flex-wrap items-center gap-2"><span className="font-mono text-[11px] text-ink-3">{rec.ACTS[s.act]}</span>{s.kinds.map((k) => <Kind key={k} k={k} />)}</div>
              <p className="serif mt-1 text-base font-bold leading-tight">{s.t}</p>
              <p className="mt-1 text-sm text-ink-2">{s.p}</p>
            </li>
          ))}
        </ol>
      </section>

      <section id="s-trade" className="mt-10 scroll-mt-14">
        <h2 className="serif text-xl font-bold">Every destination, not just two: baskets and stages</h2>
        <p className="mt-1 text-sm text-ink-2">Canada, the EU, Japan and Korea, intra-regional trade and the rest of the world stay visible, so a lower US share is not read as a gain for China. Resources sit in two baskets by HS code and stage (technology core; general industrial), ores and concentrates apart from processed products. BACI years to 2024; 2025–2026 come from Comtrade with China, the United States and everyone else only, and 2026 is year to date.</p>
        <div className="mt-2 flex flex-wrap gap-2 text-xs">
          <label className="flex items-center gap-1">Countries <select className="input max-w-[12rem] text-xs" value={group} onChange={(e) => setGroup(e.target.value)}>{Object.entries(rec.GROUPS).map(([k, g]) => <option key={k} value={k}>{g.label}</option>)}</select></label>
          <label className="flex items-center gap-1">Resource <select className="input max-w-[12rem] text-xs" value={resource} onChange={(e) => setResource(e.target.value)}><option value="all">All critical minerals</option><option value="core">Technology core</option><option value="industrial">General industrial</option>{rec.MINERALS.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
          <label className="flex items-center gap-1">Stage <select className="input max-w-[12rem] text-xs" value={stage} onChange={(e) => setStage(e.target.value as "all" | "raw" | "processed")}><option value="all">Both stages</option><option value="raw">{rec.STAGES.raw}</option><option value="processed">{rec.STAGES.processed}</option></select></label>
        </div>
        <Exhibit id="s-shares" title="Who bought the selection's exports, by year" layer="facts" note={`Exporter-side values (FOB), current US$, summed over the selection and split by partner group; the dashed line is the source break (BACI to Comtrade).${r2024 && r2024.total > 0 ? ` In 2024: China ${fmtPct(share(r2024, "CHN") ?? 0, 1)}, the United States ${fmtPct(share(r2024, "USA") ?? 0, 1)}, Canada, the EU, Japan and Korea ${fmtPct(share(r2024, "BEN") ?? 0, 1)}, within the region ${fmtPct(share(r2024, "LAC") ?? 0, 1)}, over ${r2024.n} reporting countries and US$${(r2024.total / 1000).toFixed(1)} bn.` : ""} Team calculations on CEPII BACI HS96 v202601 and UN Comtrade.`}
          asks="Who bought the selection's exports each year, and did a lower US share mean a gain for China or for someone else? Stacked shares keep every partner group visible on one scale."
          how="One band per partner group, stacked to the whole, the five acts shaded in turn; after the dashed break the years come from Comtrade with only China, the United States and everyone else, so the benchmark and intra-regional bands end there rather than fall to zero. The table under the chart carries the same shares with the total and the count of reporters."
          says="Set the China band against the benchmark and intra-regional bands as much as against the US one: a US band that narrows while the benchmark band holds is not a Chinese gain. The shares are the prototype's numbers from the team's own panel, reproduced by its rule, not this site's reconciled series.">
          <WideFigure minWidth="36rem">{shareFigure}</WideFigure>
        </Exhibit>
        <div className="scroll-x mt-3">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-ink-3"><th className="py-1 pr-3">Year</th><th className="py-1 pr-3">China</th><th className="py-1 pr-3">US</th><th className="py-1 pr-3">CA·EU·JP·KR</th><th className="py-1 pr-3">Intra-regional</th><th className="py-1 pr-3">Rest of world</th><th className="py-1 pr-3">Total, US$ m</th><th className="py-1">Reporters</th></tr></thead>
            <tbody>{series.filter((r) => r.total > 0).map((r) => <tr key={r.year} className="border-t border-rule-2 font-mono tabular-nums text-xs"><td className="py-0.5 pr-3">{r.year}{r.year === 2026 ? " YTD" : ""}</td><td className="py-0.5 pr-3">{fmtPct(share(r, "CHN") ?? 0, 1)}</td><td className="py-0.5 pr-3">{fmtPct(share(r, "USA") ?? 0, 1)}</td><td className="py-0.5 pr-3">{r.comtrade ? "n/a" : fmtPct(share(r, "BEN") ?? 0, 1)}</td><td className="py-0.5 pr-3">{r.comtrade ? "n/a" : fmtPct(share(r, "LAC") ?? 0, 1)}</td><td className="py-0.5 pr-3">{fmtPct(share(r, "ROW") ?? 0, 1)}{r.comtrade ? " (all others)" : ""}</td><td className="py-0.5 pr-3">{Math.round(r.total).toLocaleString("en-GB")}</td><td className="py-0.5">{r.n}</td></tr>)}</tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-ink-3">2025: only {tr.cov25.length} countries reported all twelve months to Comtrade ({tr.cov25.join(", ")}); 2026 is year to date with {Object.keys(tr.m26).length} reporters and between {Math.min(...Object.values(tr.m26))} and {Math.max(...Object.values(tr.m26))} months each. Strata&apos;s own reconciled series (its BACI adapter) and its routes page use the registry&apos;s HS6 list over twenty countries, so the two can differ.</p>
      </section>

      <section id="s-timeline" className="mt-10 scroll-mt-14">
        <h2 className="serif text-xl font-bold">What happened in Beijing, Washington and the region at the same time</h2>
        <p className="mt-1 text-sm text-ink-2">{rec.EVENTS.length} dated events on three lanes, tier 1 (changes the regional picture) drawn largest; most come from the companion study&apos;s verified timeline (the reference in the tooltip), a few from the team narrative and marked unverified. The politics track is the team&apos;s coding of the head of state for the six focus countries, to verify with two coders.</p>
        <div className="mt-2 flex flex-wrap gap-2 text-xs">
          <label className="flex items-center gap-1">Lane <select className="input max-w-[10rem] text-xs" value={lane} onChange={(e) => setLane(e.target.value)}><option value="">All</option>{Object.entries(rec.LANES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <label className="flex items-center gap-1">Type <select className="input max-w-[12rem] text-xs" value={etype} onChange={(e) => setEtype(e.target.value)}><option value="">All</option>{Object.entries(rec.ETYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        </div>
        <Exhibit id="s-events" title="Events track" layer="facts" note="Hover a dot for the event and its source reference; the shaded bands are the five acts."
          asks="What happened in Beijing, Washington and the region at the same time, and do the breaks between the acts line up with dated events? Dots on three lanes put the three sets of actors on one time axis."
          how="One dot per event on its lane, larger for tier 1, coloured by type; an event from the team narrative is marked unverified in the tooltip. The filters above narrow the lanes and types, so an empty lane is a filtered one, not a quiet one."
          says="Look for years where the dots thicken on two lanes at once: those are the turns the acts are drawn around, and by the team's own account each break still needs a documented event to justify it. A dot is a dated record, not a measure of weight.">
          <WideFigure minWidth="40rem">{timelineFigure}</WideFigure>
        </Exhibit>
        <Exhibit id="s-politics" title="Politics track: who governed the six focus countries" layer="interp" note="Head-of-state orientation by term (team coding, to verify); diamonds mark Belt and Road memoranda, squares free-trade agreements with China (orange) and the United States (blue)."
          asks="Who governed the six focus countries when, and did the memoranda and trade agreements fall under governments of one orientation? One strip per country puts terms and markers on the same axis as the events above."
          how="One bar per head-of-state term, coloured left, centre or right as the team coded it, the name written where the term is long enough; a marker sits in the year it was signed. A term is the team's coding, not yet checked by a second coder."
          says="Read each marker against the colour under it: where memoranda sit under terms of every orientation, orientation alone does not sort the partners, which is what the H2 card below counts rather than tests as an effect.">
          <WideFigure minWidth="40rem">{politicsFigure}</WideFigure>
        </Exhibit>
        <ol className="mt-3 max-h-80 space-y-1 overflow-y-auto rounded-md border border-rule-2 px-3 py-2 text-xs [overflow-wrap:anywhere]">
          {events.map((e) => <li key={e.id} className="border-b border-rule-2 py-1 last:border-0"><span className="font-mono text-ink-3">{e.date}</span> <span className="rounded-full border border-outline px-1.5 text-[10px]">{rec.LANES[e.lane]}</span> {e.title}{e.isos.length ? <span className="text-ink-3"> · {e.isos.map(name).join(", ")}</span> : null} <span className="text-ink-3">· {e.ref}{e.src === "T" ? " (unverified)" : ""}</span></li>)}
        </ol>
      </section>

      <section id="s-ladder" className="mt-10 scroll-mt-14">
        <h2 className="serif text-xl font-bold">The commitment ladder and the sixteen pressure cases</h2>
        <p className="mt-1 text-sm text-ink-2">Each mark is one commitment of the companion study&apos;s ladder: announced, then signed, approved or financed, under construction, operating or completed; stalled and cancelled apart. The study chose commitments that mattered to the China–US contest, so Chinese records far outnumber US ones ({rec.PROJECTS.filter((p) => p.power === "CHN").length} to {rec.PROJECTS.filter((p) => p.power === "USA").length}); conversion rates by power need a symmetric list. Hong Kong private capital is kept apart from Chinese state capital.</p>
        <Reading
          asks="How far did each commitment on the companion study's ladder get, and for which power? Six columns, one per status, put the announced beside the operating."
          how="One tile per commitment in its status column, its left edge in the power's colour, the count under each heading the number of tiles; click a tile for its record. The list was chosen for the contest, not sampled."
        />
        <div className="scroll-x mt-3">
          <div className="grid min-w-[56rem] grid-cols-6 gap-2">
            {ladder.map((s) => (
              <div key={s.id}>
                <p className="text-xs font-semibold">{s.label} <span className="font-mono text-ink-3">{s.items.length}</span></p>
                <ul className="mt-1 space-y-1">{s.items.map((p) => <li key={p.id}><button type="button" onClick={() => setProject(project === p.id ? null : p.id)} className={`w-full rounded-md border-l-4 bg-card px-2 py-1 text-left text-xs ${project === p.id ? "ring-2 ring-ink" : ""}`} style={{ borderColor: p.power === "CHN" ? ACTOR_COLOR.CN : p.power === "USA" ? ACTOR_COLOR.US : OTHER_COLOR }}><span className="font-semibold">{p.isos.map(name).join(", ") || "Region"}</span> · {p.name.length > 56 ? `${p.name.slice(0, 54)}…` : p.name}</button></li>)}</ul>
              </div>
            ))}
          </div>
        </div>
        {picked && <div className="mt-3 card px-4 py-3 text-sm"><p className="serif text-base font-bold">{picked.name}</p><p className="text-xs text-ink-3">{picked.isos.map(name).join(", ") || "Region"} · {rec.POWERS[picked.power]} · {picked.sector} · {picked.years} · {rec.STATUS_LABEL[picked.status]}{picked.amount ? ` · ${picked.amount}` : ""}{picked.minerals.length ? ` · ${picked.minerals.join(", ")}` : ""}</p><p className="mt-1 text-xs text-ink-3">Record {picked.id} of the prototype; the dated source sits in the companion study&apos;s ladder (<Link href="/denial#d-projects" className="underline">its projects</Link>).</p></div>}
        <Reading says="The columns say where the listed commitments ended, not how likely any commitment is to be built: the list over-represents Chinese records by the study's own account, and a conversion rate by power needs a symmetric list." />
        <Reading
          asks={`In the ${rec.CASES.length} documented pressure cases, what became of the Chinese-linked option, and did a US or allied alternative follow? A table, one row per case, keeps the two questions apart.`}
          how="One row per case with the companion study's three codings: the outcome for the Chinese-linked option, whether US pressure was the cause, and whether an alternative was built; the wording in each cell is the study's."
        />
        <div className="scroll-x mt-4">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-ink-3"><th className="py-1 pr-3">Case</th><th className="py-1 pr-3">Country</th><th className="py-1 pr-3">Years</th><th className="py-1 pr-3">Outcome for the Chinese-linked option</th><th className="py-1 pr-3">US pressure the cause?</th><th className="py-1">Alternative built?</th></tr></thead>
            <tbody>{rec.CASES.map((c) => <tr key={c.name} className="border-t border-rule-2 align-top text-xs"><td className="py-1 pr-3">{c.name}</td><td className="py-1 pr-3">{name(c.iso)}</td><td className="py-1 pr-3 font-mono">{c.years}</td><td className="py-1 pr-3">{c.outcome}</td><td className="py-1 pr-3">{c.cause}</td><td className="py-1">{c.alt}</td></tr>)}</tbody>
          </table>
        </div>
        <Reading says="Read the last two columns together: a case coded with US pressure as the cause and no alternative built is the study's denial without substitution. The codings are the companion study's, not this site's." />
      </section>

      <section id="s-hyp" className="mt-10 scroll-mt-14">
        <h2 className="serif text-xl font-bold">Hypothesis cards</h2>
        <p className="mt-1 text-sm text-ink-2">Each card states the claim, how it should be tested and what the evidence does and does not show, in the prototype&apos;s words. Status follows the team scale: supported, mixed, not supported, not yet testable. Presence indices describe where each power is active, not why; the H2 and H3 tests are descriptive counts, and a causal claim needs a design (fixed-effects panel, event study with comparison countries).</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {HYPOTHESES.map((h) => (
            <div key={h.h} className="card px-4 py-3 text-sm">
              <div className="flex flex-wrap items-center gap-2"><span className="font-mono text-[11px] text-ink-3">{h.h}</span>{h.kinds.map((k) => <Kind key={k} k={k} />)}<span className="ml-auto rounded-full border border-outline px-2 py-0.5 text-[11px]">{h.status}</span></div>
              <p className="serif mt-1 text-base font-bold leading-tight">{h.t}</p>
              <p className="mt-1">{h.claim}</p>
              <p className="mt-2 text-xs text-ink-2"><strong>Method.</strong> {h.method}</p>
              <p className="mt-1 text-xs text-ink-2"><strong>What the evidence shows.</strong> {h.reading}</p>
              <Link href={h.href} className="mt-2 inline-block text-xs underline">Open the evidence →</Link>
            </div>
          ))}
        </div>
      </section>

      <section id="s-quotes" className="mt-10 scroll-mt-14">
        <h2 className="serif text-xl font-bold">What leaders say: {rec.QUOTES.length} selected records</h2>
        <p className="mt-1 text-sm text-ink-2">From the shared statements dataset (417 records, 2019–2026), the original language kept; stance coding is interpretive and not yet validated by a second human coder. Strata&apos;s own Politics tabs carry the full dataset per country.</p>
        <ul className="mt-3 space-y-2">
          {[...rec.QUOTES].sort((a, b) => b.date.localeCompare(a.date)).map((q) => (
            <li key={q.id} className="card px-4 py-2 text-sm">
              <p className="serif">&ldquo;{q.orig || q.en}&rdquo;</p>
              {q.orig && q.orig !== q.en && <p className="mt-1 text-xs text-ink-2">{q.en}</p>}
              <p className="mt-1 text-[11px] text-ink-3">{q.speaker}, {q.role} · {q.date} · toward China {q.cn}, toward the US {q.us} · {q.url ? <a href={q.url} className="underline" target="_blank" rel="noreferrer">{q.src}</a> : q.src} · {q.id}</p>
            </li>
          ))}
        </ul>
      </section>

      <section id="s-states" className="mt-10 scroll-mt-14">
        <h2 className="serif text-xl font-bold">All {all33.length} ECLAC states</h2>
        <p className="mt-1 text-sm text-ink-2">Exports of the tracked resources in 2024 with the two shares, the alignment markers (team lists, to verify) and the companion study&apos;s verdict where it coded the country. States in Strata&apos;s twenty link to their case files.</p>
        <Reading
          asks="How do all the ECLAC states, not only the twenty this site tracks, split their tracked exports between the two powers, and which carry the alignment markers? A table, one row per state, puts trade and markers side by side."
          how="One row per state with its 2024 exports from the team's panel and the two shares, then the year of each marker as the team lists it and the companion study's verdict where it coded the country; a dash is a state with no row or no marker, not a zero."
        />
        <div className="scroll-x mt-3">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-ink-3"><th className="py-1 pr-3">Country</th><th className="py-1 pr-3">Exports 2024</th><th className="py-1 pr-3">China</th><th className="py-1 pr-3">US</th><th className="py-1 pr-3">Belt and Road</th><th className="py-1 pr-3">FTA China</th><th className="py-1 pr-3">FTA US</th><th className="py-1 pr-3">Recognises</th><th className="py-1">Companion verdict</th></tr></thead>
            <tbody>
              {all33.sort((a, b) => name(a).localeCompare(name(b))).map((iso) => {
                const r = tradeSeries(tr, { isos: [iso] })[2024 - Y0];
                return (
                  <tr key={iso} className="border-t border-rule-2 text-xs">
                    <td className="py-1 pr-3 font-semibold">{(IN_SCOPE as readonly string[]).includes(iso) ? <Link href={`/country/${iso}`} className="underline">{name(iso)}</Link> : name(iso)}{rec.FOCUS.includes(iso) ? <span className="ml-1 rounded-full border border-outline px-1.5 text-[10px]">focus</span> : null}</td>
                    <td className="py-1 pr-3 font-mono tabular-nums">{r.total >= 10 ? fmtBn(r.total / 1000) : r.total > 1 ? "<US$0.01 bn" : "—"}</td>
                    <td className="py-1 pr-3 font-mono tabular-nums">{r.total > 1 ? fmtPct(share(r, "CHN") ?? 0, 0) : "—"}</td>
                    <td className="py-1 pr-3 font-mono tabular-nums">{r.total > 1 ? fmtPct(share(r, "USA") ?? 0, 0) : "—"}</td>
                    <td className="py-1 pr-3 font-mono tabular-nums">{rec.BRI[iso] ? `${rec.BRI[iso]}${rec.BRI_EXIT[iso] ? `–${rec.BRI_EXIT[iso]}` : ""}` : "—"}</td>
                    <td className="py-1 pr-3 font-mono tabular-nums">{rec.FTA_CN[iso] ?? "—"}</td>
                    <td className="py-1 pr-3 font-mono tabular-nums">{rec.FTA_US[iso] ?? "—"}</td>
                    <td className="py-1 pr-3">{rec.RECOG[iso] ? `Beijing since ${rec.RECOG[iso]}` : rec.TAIWAN_ALLIES.includes(iso) ? "Taipei" : "Beijing, before 2001"}</td>
                    <td className="py-1">{rec.VERDICT[iso] ? rec.VERDICT_LABEL[rec.VERDICT[iso]] : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Reading says="Look for states where a free-trade agreement with the United States sits beside a large China share: the markers and the shares are listed side by side so the reader can see whether they sort together. The shares are the prototype's numbers; the markers are team lists still to verify and the verdicts are the companion study's." />
      </section>

      <section id="s-methods" className="mt-10 scroll-mt-14">
        <h2 className="serif text-xl font-bold">Methods and data, in the prototype&apos;s words</h2>
        <h3 className="mt-3 text-sm font-semibold">Definitions</h3>
        <dl className="mt-1 grid gap-2 text-xs sm:grid-cols-2">{rec.defs.map(([t, body]) => <div key={t} className="rounded-md border border-rule-2 px-3 py-2"><dt className="font-semibold">{t}</dt><dd className="mt-0.5 text-ink-2">{body}</dd></div>)}</dl>
        <h3 className="mt-4 text-sm font-semibold">The team&apos;s data pipeline</h3>
        <p className="mt-1 text-xs text-ink-2">R scripts 00 (runs the Comtrade download and the maps), 01 (builds the BACI panel: exporter × year × mineral × stage × basket × partner group), 02 (maps the China–US lean), 03 (monthly Comtrade exports for 2025–2026 with reporter coverage) and 04 (joins BACI and Comtrade years). Outputs used: panel_lac_exports_by_mineral_partner.csv and ct_exports_lac_monthly.csv. Check: this page reproduces the team findings exactly (China {fmtPct(four.cn2001 ?? 0, 1)} → {fmtPct(four.cn2024 ?? 0, 1)}, US {fmtPct(four.us2001 ?? 0, 1)} → {fmtPct(four.us2024 ?? 0, 1)}, technology core {fmtPct(four.coreCn2024 ?? 0, 1)} vs {fmtPct(four.coreUs2024 ?? 0, 1)} in 2024), and a unit test holds them.</p>
        <h3 className="mt-4 text-sm font-semibold">Sources</h3>
        <Reading
          asks="Which sources does the prototype rest on, and how far does each one reach? One row per source with its area, its coverage and the team's word on its status."
          how="One row per source as the team lists it, linked to the publisher; the coverage column says the years or records the team used and the status column is the team's own note on how far it is loaded."
        />
        <div className="scroll-x mt-1"><table className="w-full text-xs"><thead><tr className="text-left text-ink-3"><th className="py-1 pr-3">Source</th><th className="py-1 pr-3">Area</th><th className="py-1 pr-3">Coverage</th><th className="py-1">Status</th></tr></thead><tbody>{rec.src.map(([s, area, cov, url, status]) => <tr key={s} className="border-t border-rule-2"><td className="py-1 pr-3"><a href={url} className="underline" target="_blank" rel="noreferrer">{s}</a></td><td className="py-1 pr-3">{area}</td><td className="py-1 pr-3">{cov}</td><td className="py-1">{status}</td></tr>)}</tbody></table></div>
        <Reading says="The coverage column is where the limits in the paragraph below come from: two official-finance records that end in different years make any comparison after the earlier end one-sided, by the team's own account." />
        <h3 className="mt-4 text-sm font-semibold">Codebooks</h3>
        <p className="mt-1 text-xs text-ink-2"><strong>Event types.</strong> {Object.values(rec.ETYPES).join("; ")}. Tier 1 changes the regional picture; tier 2 a bilateral relation; tier 3 is notable but local. <strong>Narrative themes (method v1.0).</strong> {rec.THEMES.join("; ")}. <strong>Commitment status.</strong> {Object.values(rec.STATUS_LABEL).join("; ")}.</p>
        <h3 className="mt-4 text-sm font-semibold">AI use, limits and credits</h3>
        <p className="mt-1 text-xs text-ink-2">AI helped write the R scripts and the prototype. Every script re-runs from the raw files, and every figure is computed from the team&apos;s output tables, not written by hand. The statements dataset was stance-coded with AI assistance; an AI re-coding of 40 records agreed 95% (China) and 87.5% (US) with the original; the planned theme coding will be validated on a hand-coded sample. Limits: the Chinese official-finance record ends in 2021 and the US record runs to 2026, so comparisons after 2021 are one-sided; the ladder and the cases were selected for their importance to the rivalry, not sampled; most event dates come from the companion study&apos;s verified timeline, a few from the team narrative; government orientation is team coding, not yet double-coded; shares and indices show associations. Credits: <Link href="/denial" className="underline">Denial without Substitution</Link> (verified timeline, ladder, pressure cases, verdicts, Mexico case, lending reference points) and this tracker (official finance, statements), both reused with credit and their record IDs kept. Cite as: {TEAM_CITATION} (2026). Strata: China, the United States and Latin America&apos;s critical minerals, 2001–present. Sciences Po PSIA, AI-assisted Data Analysis for Social Sciences. Version 0.2 (draft).</p>
        <StepCard className="mt-4">
          <p><strong>Where this sits in Strata.</strong> The prototype&apos;s trade panel, record lists and words are served as the team supplied them ({rec.note}); its stage and basket split, its benchmark partners and its 33-state scope go beyond what Strata&apos;s pipeline computes, and its verdicts, codings and hypothesis readings are labelled as its own. Strata&apos;s indices, forecasts and case files are untouched by it. Chinese policy-bank lending reference points it cites: {rec.LENDING.map(([y, , t]) => `${y} ${t}`).join("; ")} (China–Latin America Finance Database, reference points only).</p>
        </StepCard>
      </section>
    </div>
  );
}
