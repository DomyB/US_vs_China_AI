"use client";

import * as Plot from "@observablehq/plot";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { PlotFigure, type PlotOptions } from "@/components/charts/PlotFigure";
import { Exhibit, StepCard } from "@/components/story/Chapter";
import { WideFigure } from "@/components/story/Ch3Iceberg";
import { LayerLabel } from "@/components/ui/Badges";
import { SectionNav } from "@/components/ui/SectionNav";
import { InsightsSkeleton } from "@/components/ui/Skeleton";
import { ACTOR_COLOR, COUNTRY_NAMES, OTHER_COLOR } from "@/lib/constants";
import { CONFIDENCE_ORDER, DENIAL_BASE, DENIAL_CREDIT, DENIAL_TITLE, STAGES, VERDICT_LABEL, eventsByYear, govCells, inScope, loadDenial, stageOf, synthRows, tradeLean, verdictKind, type DenialData, type DenialR3, type DenialR4, type DenialSynth } from "@/lib/denial";
import { economyName } from "@/lib/routes";

const SECTIONS = [
  { id: "d-answer", label: "The answer" }, { id: "d-verdicts", label: "Countries" }, { id: "d-props", label: "Findings" }, { id: "d-projects", label: "Projects" }, { id: "d-timeline", label: "Timeline" },
  { id: "d-governments", label: "Governments" }, { id: "d-perception", label: "Opinion" }, { id: "d-synth", label: "Correlations" }, { id: "d-open", label: "Disagreements" }, { id: "d-sources", label: "Sources" }, { id: "d-pictures", label: "Pictures" }, { id: "d-method", label: "Method" },
];
const FIVE = [
  ["The market comes first", "China buys soy, copper, iron ore and oil from South America regardless of who governs. US speeches do not change that demand."],
  ["From loans to ownership", "Chinese state banks lent heavily until 2015, then almost stopped. China then bought power grids, ports and lithium projects."],
  ["Washington reacted late", "The US saw the problem from 2005 but only acted from 2017, and until 2025 mostly with announcements rather than money."],
  ["Blocking is not replacing", "US pressure stopped some projects, such as Chile's cable and Panama's ports, but it did not offer an alternative market or comparable capital."],
  ["Governments keep both", "Latin American states hedge: they trade with China and stay aligned with the US on security. Their leaders rarely talk about the rivalry at all."],
];
const VERDICT_TONE = { holds: "border-cn text-cn", qualifies: "border-outline text-ink", fails: "border-us text-us" } as const;
const CONF_TONE: Record<string, string> = { high: "bg-ink text-surface", "medium-high": "bg-surface-2 text-ink", medium: "bg-surface-2 text-ink-2", "low-medium": "text-ink-3 border border-outline", low: "text-ink-3 border border-outline" };
const name = (iso: string) => COUNTRY_NAMES[iso] ?? economyName(iso);
const IDEO_COLOR: Record<string, string> = { left: "#c8441c", "centre-left": "#e3a08a", centre: "#8a8f98", "centre-right": "#8fb0d6", right: "#1f5fa8" };

/** The companion project's analysis, served from its own files and labelled as its reading throughout. */
export function DenialView() {
  const [d, setD] = useState<{ data: DenialData; r3: DenialR3; r4: DenialR4; synth: DenialSynth } | null | undefined>(undefined);
  useEffect(() => { loadDenial().then(setD).catch(() => setD(null)); }, []);
  const [tlCountry, setTlCountry] = useState("");
  const [tlPower, setTlPower] = useState("");
  const [tlType, setTlType] = useState("");
  const [openCountry, setOpenCountry] = useState<string | null>(null);
  const [project, setProject] = useState<string | null>(null);
  const cells = useMemo(() => (d ? govCells(d.r4.govs) : []), [d]);
  const lean = useMemo(() => (d ? tradeLean(d.r4.tr) : []), [d]);
  const byYear = useMemo(() => (d ? eventsByYear(d.data.timeline, { co: tlCountry || undefined, pw: tlPower || undefined, ty: tlType || undefined }) : []), [d, tlCountry, tlPower, tlType]);
  const corr = useMemo(() => (d ? synthRows(d.synth) : []), [d]);

  if (d === undefined) return <InsightsSkeleton />;
  if (!d) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <p className="eyebrow">Companion project</p>
        <h1 className="serif mt-1 text-2xl font-bold sm:text-4xl">{DENIAL_TITLE}</h1>
        <p className="mt-3 text-sm text-ink-2">The companion project&apos;s files are not in this build.</p>
      </div>
    );
  }
  const { data, r3, r4, synth } = d;
  const countries = [...data.countries].sort((a, b) => a.name.localeCompare(b.name));
  const claimById = new Map(data.claims.map((c) => [c.id, c]));
  const docById = new Map(data.docs.map((x) => [x.doc_id, x]));
  const events = data.timeline.filter((e) => (!tlCountry || e.co === tlCountry) && (!tlPower || e.pw === tlPower) && (!tlType || e.ty === tlType)).sort((a, b) => b.dt.localeCompare(a.dt));
  const types = Array.from(new Set(data.timeline.map((e) => e.ty))).sort();
  const eventCountries = Array.from(new Set(data.timeline.map((e) => e.co))).sort((a, b) => name(a).localeCompare(name(b)));
  const projectsByStage = STAGES.map((s) => ({ ...s, items: data.projects.filter((p) => stageOf(p) === s.id) }));
  const picked = data.projects.find((p) => p.key === project) ?? null;
  const survey = Object.entries(r4.lb.countries).filter(([, v]) => v.china_pos != null || v.us_pos != null).sort((a, b) => ((b[1].china_pos ?? 0) - (b[1].us_pos ?? 0)) - ((a[1].china_pos ?? 0) - (a[1].us_pos ?? 0)));
  const region = r4.lb.region;
  const years = Array.from({ length: 26 }, (_, i) => 2001 + i);
  const isoOrder = Array.from(new Set(cells.map((c) => c.iso))).sort((a, b) => name(a).localeCompare(name(b)));

  const timelineFigure = byYear.length ? (
    <PlotFigure
      options={{
        height: 260, marginLeft: 40,
        x: { label: null, tickFormat: (v: number) => String(v) },
        y: { label: "↑ dated events", grid: true },
        color: { legend: true, scheme: "tableau10" },
        marks: [Plot.barY(byYear, { x: "year", y: "n", fill: "ty", tip: true, title: (r: { year: number; ty: string; n: number }) => `${r.year}, ${r.ty.replace(/_/g, " ")}: ${r.n}` })],
      } as PlotOptions}
      ariaLabel="Dated events of the companion project's timeline by year and type"
    />
  ) : null;
  const stanceFigure = cells.length ? (
    <PlotFigure
      options={{
        height: 40 + 18 * isoOrder.length, marginLeft: 92,
        x: { label: null, tickFormat: (v: number) => String(v), domain: years },
        y: { label: null, domain: isoOrder, tickFormat: (iso: string) => name(iso) },
        color: { type: "diverging", domain: [-4, 4], range: [ACTOR_COLOR.CN, ACTOR_COLOR.US], legend: true, label: "stance, US minus China" },
        marks: [Plot.cell(cells, { x: "year", y: "iso", fill: "net", inset: 0.5, rx: 2, tip: true, title: (c: { iso: string; year: number; name: string; net: number; ideo: string; us: string; cn: string }) => `${name(c.iso)}, ${c.year}: ${c.name}\n${c.ideo}; toward the United States ${c.us}, toward China ${c.cn} (net ${c.net > 0 ? "+" : ""}${c.net})` })],
      } as PlotOptions}
      ariaLabel="Each government's coded stance toward the United States minus its stance toward China, by country and year"
    />
  ) : null;
  const ideoFigure = cells.length ? (
    <PlotFigure
      options={{
        height: 40 + 18 * isoOrder.length, marginLeft: 92,
        x: { label: null, tickFormat: (v: number) => String(v), domain: years },
        y: { label: null, domain: isoOrder, tickFormat: (iso: string) => name(iso) },
        color: { legend: true, domain: Object.keys(IDEO_COLOR), range: Object.values(IDEO_COLOR) },
        marks: [Plot.cell(cells, { x: "year", y: "iso", fill: (c: { ideo: string }) => (IDEO_COLOR[c.ideo] ? c.ideo : "centre"), inset: 0.5, rx: 2, tip: true, title: (c: { iso: string; year: number; name: string; ideo: string }) => `${name(c.iso)}, ${c.year}: ${c.name}, ${c.ideo}` })],
      } as PlotOptions}
      ariaLabel="The ideology of the government in office, by country and year, as the companion project codes it"
    />
  ) : null;
  const leanFigure = lean.length ? (
    <PlotFigure
      options={{
        height: 40 + 18 * isoOrder.length, marginLeft: 92,
        x: { label: null, tickFormat: (v: number) => String(v), domain: years },
        y: { label: null, domain: isoOrder, tickFormat: (iso: string) => name(iso) },
        color: { type: "linear", domain: [0, 1], range: [ACTOR_COLOR.US, ACTOR_COLOR.CN], legend: true, label: "China's share of the two powers' purchases", tickFormat: (v: number) => `${Math.round(v * 100)}%` },
        marks: [Plot.cell(lean.filter((l) => isoOrder.includes(l.iso)), { x: "year", y: "iso", fill: "lean", inset: 0.5, rx: 2, tip: true, title: (c: { iso: string; year: number; lean: number }) => `${name(c.iso)}, ${c.year}: China took ${Math.round(c.lean * 100)}% of what the two powers bought from it` })],
      } as PlotOptions}
      ariaLabel="China's share of the two powers' purchases from each country by year, from the companion project's WITS mirror data"
    />
  ) : null;

  return (
    <div className="mx-auto max-w-6xl px-4 pb-16 pt-6 sm:px-6">
      <header className="max-w-3xl">
        <p className="eyebrow">Companion project · {DENIAL_CREDIT}</p>
        <h1 className="serif mt-1 text-2xl font-bold leading-tight sm:text-4xl">{DENIAL_TITLE}</h1>
        <p className="mt-2 serif text-lg leading-snug text-ink-2">Why does China keep its economic ground in Latin America while Washington talks louder?</p>
        <p className="mt-3 text-base leading-relaxed text-ink-2">The companion explainer answers from {data.docs.length} academic studies and reports, {data.timeline.length.toLocaleString("en-GB")} dated events, {data.claims.length} claims with page citations, the governments of {Object.keys(r4.govs).length} countries since 2001, UN voting data and a 2026 opinion survey. Strata measures the <em>how much</em>; this page carries that project&apos;s <em>why</em>, from its own files, labelled as its reading throughout. Nothing here is rescored.</p>
        <div className="mt-3 flex flex-wrap items-center gap-2"><LayerLabel layer="interpretation" /><span className="text-xs text-ink-3">facts and claims cite their sources; verdicts, propositions and assessments are the companion project&apos;s</span></div>
      </header>
      <div className="mt-5"><SectionNav items={SECTIONS} /></div>

      <section id="d-answer" className="mt-6 scroll-mt-14">
        <h2 className="serif text-xl font-bold">The short answer, in the companion project&apos;s words</h2>
        <StepCard className="mt-3">
          <p>The two powers mostly compete in different arenas. China&apos;s strength is buying South America&apos;s commodities and owning infrastructure. The US&apos;s strength is security, the dollar and its own market. When the US pushes, it can block specific projects (<em>denial</em>), but it rarely replaces what China offers (<em>substitution</em>). Where this holds: Brazil, Peru, Uruguay, Argentina&apos;s lithium. Where it fails: Mexico, Central America, Panama since 2019, Venezuela since 2026.</p>
        </StepCard>
        <ol className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {FIVE.map(([t, body], i) => (
            <li key={t} className="card px-4 py-3"><p className="font-mono text-[11px] text-ink-3">{i + 1}</p><p className="serif text-base font-bold leading-tight">{t}</p><p className="mt-1 text-sm text-ink-2">{body}</p></li>
          ))}
        </ol>
        <div className="mt-4 card px-4 py-3 text-sm">
          <p className="eyebrow">Read against Strata&apos;s record</p>
          <p className="mt-1">Strata&apos;s own measures say the same thing in numbers and with the stock kept apart from the flows: the ore and the votes go to China (<Link href="/story#c0" className="underline">the whole picture</Link>), the documented cheques were Chinese and ended with their source, the stock of capital where the surveys reach is still mostly American, and the <Link href="/routes" className="underline">routes page</Link> shows what the United States could at most be getting through third countries. The <Link href="/what-we-know" className="underline">What do we know</Link> page sets eight published works against the record; this page is the companion project&apos;s fuller corpus.</p>
        </div>
      </section>

      <section id="d-verdicts" className="mt-10 scroll-mt-14">
        <h2 className="serif text-xl font-bold">Where the pattern holds, and where it fails</h2>
        <p className="mt-1 text-sm text-ink-2">The pattern has two parts, both of which must be true: Washington talks louder and pushes harder, and economic ties with China still grow or hold. The verdict is the companion project&apos;s reading of the studies and records for each country, not a measured score. Countries in Strata&apos;s scope link to their case files.</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {countries.map((c) => {
            const k = verdictKind(c.verdict);
            const open = openCountry === c.iso;
            return (
              <div key={c.iso} className="card px-3 py-2 text-sm">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-semibold">{inScope(c.iso) ? <Link href={`/country/${c.iso}`} className="underline">{c.name}</Link> : c.name}</span>
                  <span className={`rounded-full border px-2 py-0.5 text-[11px] ${VERDICT_TONE[k]}`}>{VERDICT_LABEL[k]}</span>
                </div>
                <p className="mt-1 text-xs text-ink-3">{c.verdict}</p>
                <button type="button" className="mt-1 text-xs underline" onClick={() => setOpenCountry(open ? null : c.iso)}>{open ? "Hide the evidence" : "Show the evidence"}</button>
                {open && (
                  <div className="mt-2 space-y-1 text-xs text-ink-2">
                    <p><strong>Politics.</strong> {c.politics}</p>
                    <p><strong>China.</strong> {c.china}</p>
                    <p><strong>United States.</strong> {c.us}</p>
                    <p><strong>Assessment.</strong> {c.assessment}</p>
                    <p className="text-ink-3">Claims cited: {c.claims.map((id) => claimById.get(id)?.c ?? id).join("; ")}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section id="d-props" className="mt-10 scroll-mt-14">
        <h2 className="serif text-xl font-bold">{data.props.length} cross-study findings and {data.mechs.length} explanations</h2>
        <p className="mt-1 text-sm text-ink-2">Each finding lists the claims that support, qualify or contradict it; the confidence is the companion project&apos;s. The explanations are the mechanisms it tested against the corpus, with its assessment.</p>
        <div className="scroll-x mt-3">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-ink-3"><th className="py-1 pr-3">Finding</th><th className="py-1 pr-3">Confidence</th><th className="py-1 pr-3">For / qualifying / against</th><th className="py-1">Mechanisms</th></tr></thead>
            <tbody>
              {[...data.props].sort((a, b) => CONFIDENCE_ORDER.indexOf(a.confidence) - CONFIDENCE_ORDER.indexOf(b.confidence)).map((p) => (
                <tr key={p.pid} className="border-t border-rule-2 align-top">
                  <td className="py-1.5 pr-3"><span className="font-mono text-[11px] text-ink-3">{p.pid}</span> {p.proposition}{p.note ? <span className="block text-xs text-ink-3">{p.note}</span> : null}</td>
                  <td className="py-1.5 pr-3"><span className={`rounded-full px-2 py-0.5 text-[11px] ${CONF_TONE[p.confidence] ?? ""}`}>{p.confidence}</span></td>
                  <td className="py-1.5 pr-3 font-mono tabular-nums text-xs">{p.supporting.length} / {p.qualifying.length} / {p.contradicting.length}</td>
                  <td className="py-1.5 text-xs">{p.mechanisms.join(", ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          {data.mechs.map((m) => (
            <li key={m.mid} className="card px-3 py-2 text-sm"><p><span className="font-mono text-[11px] text-ink-3">{m.mid}</span> <strong>{m.explanation}</strong></p><p className="mt-1 text-xs text-ink-2">{m.assessment}</p><p className="mt-1 text-[11px] text-ink-3">For {m.evidence_for.length} claims, against {m.evidence_against.length}{m.cases ? ` · cases: ${m.cases}` : ""}</p></li>
          ))}
        </ul>
      </section>

      <section id="d-projects" className="mt-10 scroll-mt-14">
        <h2 className="serif text-xl font-bold">Projects: from announcement to operation</h2>
        <p className="mt-1 text-sm text-ink-2">{data.projects.length} projects of both powers on the same ladder, as the companion project records them. Many big announcements were never built; the Chinese projects that were built are durable assets: grids, ports, mines. Click a project for its amounts and status.</p>
        <div className="scroll-x mt-3">
          <div className="grid min-w-[56rem] grid-cols-6 gap-2">
            {projectsByStage.map((s) => (
              <div key={s.id}>
                <p className="text-xs font-semibold">{s.label} <span className="font-mono text-ink-3">{s.items.length}</span></p>
                <ul className="mt-1 space-y-1">
                  {s.items.map((p) => (
                    <li key={p.key}>
                      <button type="button" onClick={() => setProject(project === p.key ? null : p.key)} className={`w-full rounded-md border-l-4 bg-card px-2 py-1 text-left text-xs ${project === p.key ? "ring-2 ring-ink" : ""}`} style={{ borderColor: p.nat === "CHN" ? ACTOR_COLOR.CN : p.nat === "USA" ? ACTOR_COLOR.US : OTHER_COLOR }}>
                        <span className="font-semibold">{name(p.country)}</span> · {p.name.length > 60 ? `${p.name.slice(0, 58)}…` : p.name}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
        {picked && (
          <div className="mt-3 card px-4 py-3 text-sm">
            <p className="serif text-base font-bold">{picked.name}</p>
            <p className="text-xs text-ink-3">{name(picked.country)} · {picked.sector} · {picked.actor} ({picked.nat}) · {picked.instrument} · {picked.year}</p>
            <dl className="mt-2 grid gap-1 text-xs sm:grid-cols-2">
              <div><dt className="font-semibold">Announced</dt><dd>{picked.announced || "—"}</dd></div>
              <div><dt className="font-semibold">Approved or financed</dt><dd>{picked.approved || "—"}</dd></div>
              <div><dt className="font-semibold">Disbursed or built</dt><dd>{picked.disbursed || "—"}</dd></div>
              <div><dt className="font-semibold">Status</dt><dd>{picked.status}</dd></div>
            </dl>
            {picked.note && <p className="mt-2 text-xs text-ink-2">{picked.note}</p>}
            <p className="mt-1 text-[11px] text-ink-3">Records: {picked.records.join(", ")}</p>
          </div>
        )}
      </section>

      <section id="d-timeline" className="mt-10 scroll-mt-14">
        <h2 className="serif text-xl font-bold">Timeline, 1998–2026</h2>
        <p className="mt-1 text-sm text-ink-2">{data.timeline.length.toLocaleString("en-GB")} dated events: from the studies (with page), from external verification and from web research in 2026 (with a link). Single-source events are marked by the companion project.</p>
        <div className="mt-2 flex min-w-0 flex-wrap gap-2 text-xs">
          <label className="flex items-center gap-1">Country <select className="input max-w-[11rem] text-xs" value={tlCountry} onChange={(e) => setTlCountry(e.target.value)}><option value="">All</option>{eventCountries.map((c) => <option key={c} value={c}>{name(c)}</option>)}</select></label>
          <label className="flex items-center gap-1">Power <select className="input max-w-[9rem] text-xs" value={tlPower} onChange={(e) => setTlPower(e.target.value)}><option value="">All</option><option value="CHN">China</option><option value="USA">United States</option><option value="LAC">Latin America</option><option value="both">Both</option></select></label>
          <label className="flex items-center gap-1">Type <select className="input max-w-[10rem] text-xs" value={tlType} onChange={(e) => setTlType(e.target.value)}><option value="">All</option>{types.map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}</select></label>
          <span className="text-ink-3">{events.length} events</span>
        </div>
        <div className="mt-2"><WideFigure minWidth="36rem">{timelineFigure ?? <p className="text-sm text-ink-3">No event matches.</p>}</WideFigure></div>
        <ol className="mt-3 max-h-[28rem] space-y-1 overflow-y-auto rounded-md border border-rule-2 px-3 py-2 text-xs [overflow-wrap:anywhere]">
          {events.slice(0, 120).map((e) => (
            <li key={e.id} className="border-b border-rule-2 py-1 last:border-0">
              <span className="font-mono text-ink-3">{e.dt}</span> <span className="font-semibold">{name(e.co)}</span> · {e.ev}{" "}
              {e.u ? <a href={e.u} className="underline" target="_blank" rel="noreferrer">source</a> : e.src ? <span className="text-ink-3">{e.src}</span> : null}
              {e.v === "single-source" && <span className="ml-1 rounded-full border border-outline px-1.5 text-[10px] text-ink-3">single source</span>}
              {e.k && <span className="ml-1 rounded-full bg-ink px-1.5 text-[10px] text-surface">key</span>}
            </li>
          ))}
          {events.length > 120 && <li className="text-ink-3">…and {events.length - 120} more; narrow the filters.</li>}
        </ol>
      </section>

      <section id="d-governments" className="mt-10 scroll-mt-14">
        <h2 className="serif text-xl font-bold">Governments since 2001: ideology swung, trade kept growing</h2>
        <p className="mt-1 text-sm text-ink-2">Three strips over the same countries and years. The first is the ideology of the government in office on 1 July, the second its coded stance toward the United States minus its stance toward China (−4 to +4), both the companion project&apos;s coding from sourced facts with a confidence level. The third is China&apos;s share of what the two powers bought from the country, from the project&apos;s WITS mirror data (UN Comtrade), 2001–2023. {r4.meta.coding}</p>
        <Exhibit id="d-gov-ideo" title="Who governed" layer="interp" note="The companion project's coding; interim and short governments are low-confidence by its own account. China is not coded: a one-party state without electoral alternation.">
          {ideoFigure}
        </Exhibit>
        <Exhibit id="d-gov-stance" title="Which way each government leaned" layer="interp" note="Stance scale: aligned +2, cooperative +1, pragmatic 0, distant −1, hostile −2 toward each power; the cell is the US score minus the China score.">
          {stanceFigure}
        </Exhibit>
        <Exhibit id="d-gov-lean" title="Where the goods went" layer="facts" note={`${r4.tr.source}. The cell is China's purchases over the two powers' purchases from the country, unit-free; a year without both values is absent.`}>
          {leanFigure}
        </Exhibit>
      </section>

      <section id="d-perception" className="mt-10 scroll-mt-14">
        <h2 className="serif text-xl font-bold">How people see it: Latinobarómetro 2026</h2>
        <p className="mt-1 text-sm text-ink-2">In 2026, {region.china["2025_26"]?.pos}% of Latin Americans called China&apos;s influence positive against {region.us["2025_26"]?.pos}% for the United States ({region.china["2020"]?.pos}% and {region.us["2020"]?.pos}% in 2020). One survey question at two points in time; the report publishes China&apos;s figure for only some countries, and Nicaragua was not surveyed. Fieldwork {String(r4.lb.fieldwork.dates ?? "")}, {String(r4.lb.fieldwork.interviews ?? "")} interviews.</p>
        <div className="scroll-x mt-3">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-ink-3"><th className="py-1 pr-4">Country</th><th className="py-1 pr-4">China positive</th><th className="py-1 pr-4">US positive</th><th className="py-1">Note</th></tr></thead>
            <tbody>{survey.map(([iso, v]) => <tr key={iso} className="border-t border-rule-2"><td className="py-1 pr-4 font-semibold">{name(iso)}</td><td className="py-1 pr-4 font-mono tabular-nums">{v.china_pos ?? "—"}%</td><td className="py-1 pr-4 font-mono tabular-nums">{v.us_pos ?? "—"}%</td><td className="py-1 text-xs text-ink-3">{v.source}{v.note ? `; ${v.note}` : ""}</td></tr>)}</tbody>
          </table>
        </div>
      </section>

      <section id="d-synth" className="mt-10 scroll-mt-14">
        <h2 className="serif text-xl font-bold">Crossing the variables: what moves together</h2>
        <p className="mt-1 text-sm text-ink-2">The companion project&apos;s own correlations over {Object.keys(r4.govs).length} countries, 2001–2023 ({synth.R.descr.n_obs} country-years): <em>between</em> asks whether countries that are more X are also more Y (each country&apos;s average); <em>within</em> asks whether a change of X inside a country goes with a change of Y, after removing each country&apos;s level and each year&apos;s regional trend. Correlation is not causation. Its reading: within each country, changes of government move votes and rhetoric, not trade.</p>
        <div className="scroll-x mt-3">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-ink-3"><th className="py-1 pr-3">X</th><th className="py-1 pr-3">Y</th><th className="py-1 pr-3">Between countries r (p, n)</th><th className="py-1">Within countries r (p, n)</th></tr></thead>
            <tbody>{corr.map((r) => <tr key={r.pair} className="border-t border-rule-2"><td className="py-1 pr-3 text-xs">{r.x}</td><td className="py-1 pr-3 text-xs">{r.y}</td><td className="py-1 pr-3 font-mono tabular-nums text-xs">{r.between ? `${r.between[0].toFixed(2)} (${r.between[1].toFixed(3)}, ${r.between[2]})` : "—"}</td><td className="py-1 font-mono tabular-nums text-xs">{r.within ? `${r.within[0].toFixed(2)} (${r.within[1].toFixed(3)}, ${r.within[2]})` : "—"}</td></tr>)}</tbody>
          </table>
        </div>
      </section>

      <section id="d-open" className="mt-10 scroll-mt-14">
        <h2 className="serif text-xl font-bold">{data.contra.length} disagreements kept open, {data.gaps.length} gaps, {data.audit.length} audited claims</h2>
        <div className="mt-3 space-y-2">
          {data.contra.map((c) => (
            <details key={c.cid} className="card px-3 py-2 text-sm">
              <summary className="cursor-pointer"><span className="font-mono text-[11px] text-ink-3">{c.cid}</span> <strong>{c.topic}</strong> <span className="text-xs text-ink-3">· {c.status}</span></summary>
              <p className="mt-2 text-xs"><strong>A.</strong> {c.position_a} <span className="text-ink-3">({c.claims_a.join(", ")})</span></p>
              <p className="mt-1 text-xs"><strong>B.</strong> {c.position_b} <span className="text-ink-3">({c.claims_b.join(", ")})</span></p>
              <p className="mt-1 text-xs text-ink-2"><strong>The project&apos;s reading.</strong> {c.analyst_reading}</p>
            </details>
          ))}
        </div>
        <ul className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
          {data.gaps.map((g) => <li key={g.gid} className="rounded-md border border-rule-2 px-3 py-2"><span className="font-mono text-ink-3">{g.gid}</span> {g.gap} <span className="text-ink-3">· {g.priority} priority · {g.source}</span></li>)}
        </ul>
        <p className="mt-2 text-xs text-ink-3">Audit of the synthesis against the corpus: {Object.entries(data.audit.reduce<Record<string, number>>((acc, a) => ({ ...acc, [a.verdict]: (acc[a.verdict] ?? 0) + 1 }), {})).map(([k, v]) => `${v} ${k}`).join(", ")}. The 2026 web records were checked too: {r3.verification.length} issues examined, each with what was checked and the result.</p>
      </section>

      <section id="d-sources" className="mt-10 scroll-mt-14">
        <h2 className="serif text-xl font-bold">The {data.docs.length} studies</h2>
        <p className="mt-1 text-sm text-ink-2">Each read in full by the companion project; every quote machine-checked against the source text and page. The stance says whether the study supports, qualifies or challenges the premise. Chinese-language scholarship is absent, by the project&apos;s own account.</p>
        <ol className="mt-3 space-y-1 text-xs">
          {[...data.docs].sort((a, b) => a.short_citation.localeCompare(b.short_citation)).map((x) => (
            <li key={x.doc_id} className="border-b border-rule-2 py-1.5">
              <span className="font-mono text-ink-3">{x.doc_id}</span> {x.harvard_reference} <span className="text-ink-3">· {x.relevance_level} · {x.n_claims} claims · {x.stance_on_premise.split(/[—.]/)[0].trim()}</span>
            </li>
          ))}
        </ol>
      </section>

      <section id="d-pictures" className="mt-10 scroll-mt-14">
        <h2 className="serif text-xl font-bold">Pictures</h2>
        <p className="mt-1 text-sm text-ink-2">The companion project&apos;s pictures, each with its author and licence from Wikimedia Commons. Illustrations, not records.</p>
        <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {r3.images.map((im) => (
            <li key={im.key} className="card overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element -- the companion project's credited Commons pictures, served with the site */}
              <img src={`${DENIAL_BASE}/${im.file}`} alt={im.alt} loading="lazy" width={im.w} height={im.h} className="h-44 w-full object-cover" />
              <figcaption className="px-3 py-2 text-xs"><span>{im.caption}</span><span className="mt-1 block text-[11px] text-ink-3">{im.author}, {im.license_url ? <a href={im.license_url} className="underline" target="_blank" rel="noreferrer">{im.license}</a> : im.license}{im.source_url ? <> · <a href={im.source_url} className="underline" target="_blank" rel="noreferrer">Commons</a></> : null}</span></figcaption>
            </li>
          ))}
        </ul>
      </section>

      <section id="d-method" className="mt-10 scroll-mt-14">
        <h2 className="serif text-xl font-bold">Method and limits, in the companion project&apos;s words</h2>
        <div className="prose-doc mt-2 max-w-3xl text-sm leading-relaxed">
          <p>Nothing is invented and nothing is scored: no composite index of &ldquo;influence&rdquo; is computed there. Thirty supplied files were reduced to 27 distinct studies, each read in full; four papers on factor-endowment complementarity were added later (31 in total). Every quote was machine-checked against the source text and page. Events after 2020 and project statuses were verified on the web and carry a link; web-verified events resting on Wikipedia are marked single-source. The statements dataset is shared with Strata.</p>
          <p>Its stated limits: the studies are a curated set, not everything written, and Chinese-language scholarship is absent; 2025–2026 relies on news and official sources, so effects are not yet measurable; statement stance coding is interpretive and not validated by a human second coder; China&apos;s motives (commercial or geopolitical) remain contested; government ideology and stance are the project&apos;s coding from sourced facts, with a confidence level; UN voting data end in 2025 and trade data in 2023; the 2026 survey is one question at two points in time.</p>
          <p>Two sites, one project. Strata measures trade, finance, votes, media and forecasts for twenty countries and labels its model outputs; the companion explainer answers the <em>why</em> from the literature and follows the same three-layer rule. Here its files are served as supplied ({DENIAL_BASE}), the verdicts and readings are labelled as its interpretation, and no figure of its is folded into Strata&apos;s indices. Where the two use the same sources (the statements dataset, UN votes, Comtrade through WITS), the numbers can differ by vintage and by definition; Strata&apos;s own figures are the ones its pages cite.</p>
          <p className="text-xs text-ink-3">Supplied by the owner on 13 October 2026 as the project&apos;s data files (built {r4.meta.built}); the event, government and project records carry their own sources and the 2026 news records their URLs. The 2026 news status of {Object.keys(r3.countries).length} countries, the Mexico case, the US pressure cases and the factor-endowment map are in those files and summarised here only by their counts.</p>
        </div>
        <div className="mt-3 grid gap-2 text-xs sm:grid-cols-3">
          <div className="rounded-md border border-rule-2 px-3 py-2"><p className="font-semibold">Mexico case</p><p className="mt-1 text-ink-2">{r3.mexico.summary.slice(0, 420)}…</p></div>
          <div className="rounded-md border border-rule-2 px-3 py-2"><p className="font-semibold">US pressure cases</p><p className="mt-1 text-ink-2">{r3.cases.summary.slice(0, 420)}…</p></div>
          <div className="rounded-md border border-rule-2 px-3 py-2"><p className="font-semibold">Endowments compared</p><p className="mt-1 text-ink-2">{r3.us.summary.slice(0, 420)}…</p></div>
        </div>
        <p className="mt-3 text-xs text-ink-3">From {docById.size} studies and {Object.keys(data.ext).length} external records; the project&apos;s own glossary and the 2026 country status pages are in its files.</p>
      </section>
    </div>
  );
}
