"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { SectionNav } from "@/components/ui/SectionNav";
import { InsightsSkeleton } from "@/components/ui/Skeleton";
import { Toast } from "@/components/ui/Toast";
import { useRevealChildren } from "@/lib/motion";
import { Interpretation } from "@/components/panel/Interpretation";
import { Segmented } from "@/components/ui/Segmented";
import { COUNTRY_NAMES } from "@/lib/constants";
import { loadIndex, loadInsights } from "@/lib/data";
import { DEFAULT_LEVERS, leversFromParams, leversToParams, type Levers } from "@/lib/scenario";
import type { EvidenceLevel, IndexFile, InsightsFile } from "@/lib/types";
import { Attention } from "./Attention";
import { Board, boardRows } from "./Board";
import { FindingCard } from "./FindingCard";
import { Ledger } from "./Ledger";
import { MineralsTalk } from "./MineralsTalk";
import { PanelLever } from "./PanelLever";
import { ParityChart } from "./ParityChart";
import { ScenarioStudio } from "./ScenarioStudio";
import { Shocks } from "./Shocks";
import { WordsVsMoney } from "./WordsVsMoney";
import { Block } from "./shared";

type LevelFilter = "all" | EvidenceLevel;

const INSIGHT_SECTIONS = [
  { id: "board-h", label: "2030 board" },
  { id: "studio-h", label: "Scenario studio" },
  { id: "words-h", label: "Words and money" },
  { id: "ledger-h", label: "Who talks, who pays" },
  { id: "minerals-h", label: "Minerals" },
  { id: "parity-h", label: "What it would take" },
  { id: "shocks-h", label: "After the shock" },
  { id: "panel-h", label: "Panel" },
  { id: "attention-h", label: "Attention" },
  { id: "findings-h", label: "Findings" },
  { id: "reading-h", label: "Reading" },
];

export function InsightsView() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [file, setFile] = useState<InsightsFile | null | undefined>(undefined);
  const [index, setIndex] = useState<IndexFile | null>(null);
  const [levers, setLevers] = useState<Levers | null>(null);
  const [level, setLevel] = useState<LevelFilter>("all");
  const [onlyCountry, setOnlyCountry] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const revealRoot = useRevealChildren<HTMLDivElement>(".insights-block", file);

  useEffect(() => {
    Promise.all([loadInsights(), loadIndex()]).then(([f, i]) => {
      setFile(f);
      setIndex(i);
    });
  }, []);

  const defaultCountry = useMemo(() => {
    if (!file) return "CHL";
    const withForecast = file.countries.filter((c) => c.forecast && c.trade);
    return withForecast.sort((a, b) => (b.trade?.total_musd ?? 0) - (a.trade?.total_musd ?? 0))[0]?.iso3 ?? file.countries[0]?.iso3 ?? "CHL";
  }, [file]);
  useEffect(() => {
    if (file && !levers) setLevers(leversFromParams(new URLSearchParams(params.toString()), defaultCountry));
  }, [file, levers, params, defaultCountry]);

  const update = useCallback(
    (patch: Partial<Levers>) => {
      const next = { ...(levers ?? { country: defaultCountry, ...DEFAULT_LEVERS }), ...patch };
      setLevers(next);
      const p = leversToParams(next, new URLSearchParams(window.location.search));
      router.replace(`${pathname}?${p.toString()}`, { scroll: false });
    },
    [levers, defaultCountry, pathname, router],
  );
  const selectCountry = useCallback((iso3: string) => update({ country: iso3, divertMineral: null, divertPct: 0, pricePct: 0 }), [update]);
  const copyLink = useCallback(() => {
    if (!levers) return;
    const url = `${window.location.origin}${pathname}?${leversToParams(levers).toString()}`;
    navigator.clipboard?.writeText(url).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    });
  }, [levers, pathname]);

  const country = useMemo(() => (file && levers ? file.countries.find((c) => c.iso3 === levers.country) ?? null : null), [file, levers]);
  const rows = useMemo(() => (file && levers ? boardRows(file.countries, levers, file.region.event_echoes, file.meta.horizon_year) : []), [file, levers]);
  const findings = useMemo(() => (file ? file.findings.filter((f) => (level === "all" || f.strength.level === level) && (!onlyCountry || f.countries.includes(onlyCountry))) : []), [file, level, onlyCountry]);

  if (file === undefined) return <InsightsSkeleton />;
  if (file === null) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="serif text-2xl font-bold">Insights and scenarios</h1>
        <p className="mt-3 rounded-md border border-dashed border-rule-2 bg-surface-2 p-4 text-sm leading-relaxed text-ink-2">
          Nothing to show yet: the file this page reads, <code className="font-mono text-xs">insights.json</code>, is written by the pipeline&apos;s export step and appears with the next data run. The contrasts, the scenario studio and the findings then come from the same tables as the rest of the site. See the <Link href="/methodology#insights" className="underline">methodology</Link>.
        </p>
      </div>
    );
  }
  const horizon = file.meta.horizon_year;
  const interp = { generated: [], human: file.human, template_version: file.version, generated_on: file.generated_on, label: file.label };
  const forecastCountries = file.countries.filter((c) => c.forecast);

  return (
    <div ref={revealRoot} className="mx-auto max-w-7xl px-4 pb-10 pt-6">
      <Toast message={copied ? "Link copied" : null} />
      <header className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
        <div>
          <p className="eyebrow">Insights</p>
          <h1 className="serif mt-1 text-2xl font-bold leading-tight sm:text-4xl">What the words, the money and the minerals say together</h1>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ink-2">
            Every other page shows one layer at a time. This one sets them against each other: what governments say (the owner&apos;s coded statements), what legislatures and the press say (text-model outputs), what the money and the ore actually do (documented commitments, reported trade) and what the backtested models expect to 2030. Move the levers to build your own scenario; every number stays traceable and nothing you set is stored.
          </p>
        </div>
        <ul className="flex flex-wrap gap-1.5 text-[11px] text-ink-3">
          <li className="chip border border-rule">computed {file.generated_on}</li>
          <li className="chip border border-rule"><AnimatedNumber value={file.meta.n_statements} /> statements · {file.meta.countries_with_statements.length} countries</li>
          <li className="chip border border-rule">forecasts for {file.meta.forecast_countries.length} countries</li>
          <li className="chip border border-rule">trade to {file.meta.last_year.trade ?? "—"} · China finance to {file.meta.last_year.finance_CN ?? "—"} · US to {file.meta.last_year.finance_US ?? "—"}</li>
        </ul>
      </header>
      <div className="mt-4">
        <SectionNav items={INSIGHT_SECTIONS} />
      </div>

      <Block id="board" n={1} title={`Where will the minerals go in ${horizon}?`} lead="The split of each country's mineral exports today and under your scenario. Pick a country to open the studio." layer="model">
        <Board rows={rows} selected={levers?.country ?? defaultCountry} onSelect={selectCountry} horizon={horizon} />
      </Block>

      <Block id="studio" n={2} title={<>Scenario studio{country ? <span className="text-ink-3"> · {country.name}</span> : null}</>} lead="Five levers, all arithmetic on published numbers: blend the scenarios, add a shock history has seen, redirect a mineral, change the money, move a price." layer="model"
        tags={<button type="button" className="btn btn-sm" onClick={copyLink}>{copied ? "Link copied" : "Copy link to this scenario"}</button>}>
        <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
          <label className="text-ink-2">Country <select className="input ml-1 text-xs" value={levers?.country ?? defaultCountry} onChange={(e) => selectCountry(e.target.value)} aria-label="Country of the scenario studio">{forecastCountries.map((c) => <option key={c.iso3} value={c.iso3}>{c.name}</option>)}</select></label>
          {levers && (levers.pull !== 0 || levers.shock || levers.divertPct > 0 || levers.cnFin !== 1 || levers.usFin !== 1 || levers.pricePct !== 0) && <button type="button" className="underline decoration-dotted text-ink-3" onClick={() => update({ ...DEFAULT_LEVERS })}>Reset the levers</button>}
        </div>
        {country && levers && index ? <ScenarioStudio country={country} region={file.region} indexRows={index.rows} levers={levers} onChange={update} horizon={horizon} /> : <p className="text-sm text-ink-3">No forecast for this country.</p>}
      </Block>

      <Block id="words" n={3} title="Words and money" lead="Executives' coded stance toward each power against the share of their mineral exports that actually goes there; and who says what, by bloc." layer="facts" tags={<span className="chip border border-dashed border-interp/60 text-interp">dataset coding · not validated</span>}>
        <WordsVsMoney countries={file.countries} byBloc={file.region.talk_vs_money.by_bloc} />
      </Block>

      <Block id="ledger" n={4} title="Who talks, who pays" lead="Statement counts by speaker bloc beside documented commitments by origin." layer="facts">
        <Ledger tm={file.region.talk_vs_money} />
      </Block>

      <Block id="minerals" n={5} title="Talk and trade by mineral" lead="The minerals leaders name against the minerals that earn the export value." layer="facts">
        <MineralsTalk countries={file.countries} />
      </Block>

      <Block id="parity" n={6} title="What it would take" lead="The yearly export value that would have to switch from China to the United States for the two to buy the same." layer="facts" tags={<span className="chip border border-rule text-ink-3">arithmetic at constant totals</span>}>
        <ParityChart countries={file.countries} />
      </Block>

      <Block id="shocks" n={7} title="After the shock" lead="What followed each kind of event in these countries, two years after against two years before; the shock lever uses the family mean." layer="model">
        <Shocks echoes={file.region.event_echoes} titles={file.region.event_titles} selected={levers?.shock ?? null} />
      </Block>

      <Block id="panel" n={8} title="What the panel says" lead="Twelve countries, thirteen years, country and year effects: which recorded ties move together, and which do not." layer="model">
        <PanelLever reg={file.region.regressions} />
      </Block>

      <Block id="attention" n={9} title="Attention and money" lead="Washington's paper trail and its cheque book, year by year, with Beijing's commitments beside them." layer="facts">
        <Attention rows={file.region.attention} lastYear={{ finance_US: file.meta.last_year.finance_US ?? null, finance_CN: file.meta.last_year.finance_CN ?? null }} />
      </Block>

      <Block id="findings" n={10} title="Findings" lead="Generated from the indicators above by fixed templates; click a sentence for the indicator ids, and read the evidence meter before you quote a headline." layer="interpretation"
        tags={<><Segmented value={level} onChange={setLevel} label="Evidence level" options={[{ value: "all", label: "All" }, { value: "strong", label: "Strong" }, { value: "moderate", label: "Moderate" }, { value: "thin", label: "Thin" }]} /><select className="input text-xs" value={onlyCountry} onChange={(e) => setOnlyCountry(e.target.value)} aria-label="Only findings about a country"><option value="">every country</option>{file.countries.map((c) => <option key={c.iso3} value={c.iso3}>{COUNTRY_NAMES[c.iso3] ?? c.name}</option>)}</select></>}>
        {findings.length ? <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{findings.map((f) => <FindingCard key={f.id} f={f} />)}</div> : <p className="text-sm text-ink-3">No finding matches the filter.</p>}
      </Block>

      <Block id="reading" n={11} title="Reading and outlook" lead="The interpretation of the contrasts and the perspective to 2030, kept apart from the facts and the models." layer="interpretation">
        <Interpretation block={interp} scopeLabel="the insights" hideGenerated />
      </Block>
    </div>
  );
}
