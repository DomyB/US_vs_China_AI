"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { SectionNav } from "@/components/ui/SectionNav";
import { InsightsSkeleton } from "@/components/ui/Skeleton";
import { Toast } from "@/components/ui/Toast";
import { PageGuide } from "@/components/ui/Reading";
import { HeaderPicture } from "@/components/ui/Picture";
import { useRevealChildren } from "@/lib/motion";
import { Interpretation } from "@/components/panel/Interpretation";
import { Segmented } from "@/components/ui/Segmented";
import { COUNTRY_NAMES } from "@/lib/constants";
import { loadIndex, loadInsights } from "@/lib/data";
import { DEFAULT_LEVERS, leversFromParams, leversToParams, type Levers } from "@/lib/scenario";
import type { EvidenceLevel, IndexFile, InsightsFile } from "@/lib/types";
import { labProvenance } from "@/lib/provenance";
import { useRealMeta } from "@/lib/useRealMeta";
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
import { replaceSearch } from "@/lib/url";

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
  const realMeta = useRealMeta();
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

  // The blocks mount only once the data is in, so the browser's own jump to a #hash (the story's /lab#ledger links, a reload on
  // a section) finds nothing: land it here, and follow the page for a moment while the figures above the target take their height.
  useEffect(() => {
    const root = revealRoot.current;
    const id = window.location.hash.slice(1);
    if (!file || !root || !id) return;
    const land = () => document.getElementById(id)?.scrollIntoView({ block: "start" });
    land();
    const ro = new ResizeObserver(land);
    ro.observe(root);
    const stop = window.setTimeout(() => ro.disconnect(), 1500);
    return () => {
      window.clearTimeout(stop);
      ro.disconnect();
    };
  }, [file, revealRoot]);

  const update = useCallback(
    (patch: Partial<Levers>) => {
      const next = { ...(levers ?? { country: defaultCountry, ...DEFAULT_LEVERS }), ...patch };
      setLevers(next);
      const p = leversToParams(next, new URLSearchParams(window.location.search));
      replaceSearch(p);
    },
    [levers, defaultCountry],
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
        <h1 className="serif text-2xl font-bold">The Lab</h1>
        <p className="mt-3 rounded-md border border-dashed border-rule-2 bg-surface-2 p-4 text-sm leading-relaxed text-ink-2">
          Nothing to show yet: the file this page reads, <code className="font-mono text-xs">insights.json</code>, is written by the pipeline&apos;s export step and appears with the next data run. The contrasts, the scenario studio and the findings then come from the same tables as the rest of the site. See the <Link href="/methodology#insights" className="underline">methodology</Link>.
        </p>
      </div>
    );
  }
  const horizon = file.meta.horizon_year;
  const interp = { generated: [], human: file.human, template_version: file.version, generated_on: file.generated_on, label: file.label };
  const forecastCountries = file.countries.filter((c) => c.forecast);
  // The panel's own span and size, from its regression rows (every row carries them), so the lead and the drawer's caveat
  // cannot drift from the table beneath; without rows the sentences carry no number.
  const reg0 = file.region.regressions.rows[0];
  const regSpan = reg0 ? reg0.years.split(/[–-]/).map(Number) : [];
  const regYears = regSpan.length === 2 && regSpan.every(Number.isFinite) ? regSpan[1] - regSpan[0] + 1 : null;
  const panelLead = reg0
    ? `${reg0.n_countries} countries, ${reg0.years}${regYears ? ` (${regYears} years, ${reg0.n_obs} country-years)` : ` (${reg0.n_obs} country-years)`}, country and year effects: which recorded ties move together, and which do not.`
    : "Country and year effects: which recorded ties move together, and which do not.";
  const panelProvenance = labProvenance("panel", realMeta);
  const panelCaveat = reg0 ? `${reg0.n_countries} countries and ${regYears ?? reg0.years} years: an association, not a cause.` : panelProvenance?.caveat;
  // the ledger's reading compares the two ratios it already prints: who speaks more, who commits more, in the shared window
  const tm = file.region.talk_vs_money;
  const usTalksMore = (tm.ratios.statements_us_over_cn ?? 0) > 1;
  const cnPaysMore = (tm.ratios.money_cn_over_us_2015_21 ?? 0) > 1;
  const studioName = country?.name ?? "the chosen country";

  return (
    <div ref={revealRoot} className="mx-auto max-w-7xl px-4 pb-10 pt-6">
      <Toast message={copied ? "Link copied" : null} />
      <header className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
        <div>
          <p className="eyebrow">Lab</p>
          <h1 className="serif mt-1 text-2xl font-bold leading-tight sm:text-4xl">What the words, the money and the minerals say together</h1>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ink-2">
            Every other page shows the layers exhibit by exhibit, each labelled. This one sets them against each other: what governments say (the owner&apos;s coded statements), what legislatures and the press say (text-model outputs), what the money and the ore actually do (documented commitments, reported trade) and what the backtested models expect to 2030. Move the levers to build your own scenario; every number stays traceable and nothing you set is stored.
          </p>
        </div>
        <ul className="flex flex-wrap gap-1.5 text-[11px] text-ink-3">
          <li className="chip border border-rule">computed {file.generated_on}</li>
          <li className="chip border border-rule"><AnimatedNumber value={file.meta.n_statements} /> statements · {file.meta.countries_with_statements.length} countries</li>
          <li className="chip border border-rule">forecasts for {file.meta.forecast_countries.length} countries</li>
          <li className="chip border border-rule">trade to {file.meta.last_year.trade ?? "—"} · China finance to {file.meta.last_year.finance_CN ?? "—"} · US to {file.meta.last_year.finance_US ?? "—"}</li>
        </ul>
      </header>
      <PageGuide
        purpose="Sets the layers the other pages show one at a time against each other: what governments and legislatures say, what the money and the ore do, and what the backtested models expect, in eleven blocks from the board to the reading."
        read="The levers are yours: each one is arithmetic on published numbers, and the board, the studio and the shock block follow them. The link button keeps a scenario in the address; nothing you set is stored, and nothing you set is a forecast."
        next={[{ href: "/story#c7", label: "Chapter 7 of the story, what it would take" }, { href: "/region", label: "The regional overview" }]}
      />
      <HeaderPicture id="battery" className="mt-3" />
      <div className="mt-4">
        <SectionNav items={INSIGHT_SECTIONS} />
      </div>

      <Block id="board" provenance={labProvenance("board", realMeta)} n={1} title={`Where will the minerals go in ${horizon}?`} lead="The split of each country's mineral exports today and under your scenario. Pick a country to open the studio." layer="model"
        asks={`Where does each country's ore go today, and where would it go in ${horizon} under the levers you set? One row per country puts the two years side by side on the same bar.`}
        how={`Top bar: the latest reported split, United States on the left, rest of the world in grey, China on the right; the faded bar under it is ${horizon} under your scenario; the dumbbell on the right is the ${horizon} index lean. A row with no lower bar has no share forecast, and hovering says why.`}
        says={`Rows are ordered by China's ${horizon} share under your scenario, so the countries whose ore the paths send most to China sit at the top. The lower bar moves with the levers and is your arithmetic on the published medians, not a forecast.`}
        saysKind="model">
        <Board rows={rows} selected={levers?.country ?? defaultCountry} onSelect={selectCountry} horizon={horizon} />
      </Block>

      <Block id="studio" provenance={labProvenance("studio", realMeta)} n={2} title={<>Scenario studio{country ? <span className="text-ink-3"> · {country.name}</span> : null}</>} lead="Five levers, all arithmetic on published numbers: blend the scenarios, add a shock history has seen, redirect a mineral, change the money, move a price." layer="model"
        asks={`What would ${studioName}'s export shares and index look like under your scenario, the one you build with the levers? Fan charts put the reported record, the published scenario bands and your blend on one time axis.`}
        how="Solid lines are the reported record; dashed lines with bands are your blend of the published scenarios; the dotted line is your shock; the three cards above give the horizon shares, the latest-year what-if and the index formula on your numbers. A gap in a solid line is a year without a partner row, not a zero."
        says="Everything on the right is your scenario and not a forecast: the published bands bound the blend, the shock is an average of what followed past events, and the redirect, finance and price levers are arithmetic at constant totals. Nothing here says what will happen."
        saysKind="model"
        tags={<button type="button" className="btn btn-sm" onClick={copyLink}>{copied ? "Link copied" : "Copy link to this scenario"}</button>}>
        <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
          <label className="text-ink-2">Country <select className="input ml-1 text-xs" value={levers?.country ?? defaultCountry} onChange={(e) => selectCountry(e.target.value)} aria-label="Country of the scenario studio">{forecastCountries.map((c) => <option key={c.iso3} value={c.iso3}>{c.name}</option>)}</select></label>
          {levers && (levers.pull !== 0 || levers.shock || levers.divertPct > 0 || levers.cnFin !== 1 || levers.usFin !== 1 || levers.pricePct !== 0) && <button type="button" className="underline decoration-dotted text-ink-3" onClick={() => update({ ...DEFAULT_LEVERS })}>Reset the levers</button>}
        </div>
        {country && levers && index ? <ScenarioStudio country={country} region={file.region} indexRows={index.rows} levers={levers} onChange={update} horizon={horizon} /> : <p className="text-sm text-ink-3">No forecast for this country.</p>}
      </Block>

      <Block id="words" provenance={labProvenance("words", realMeta)} n={3} title="Words and money" lead="Executives' coded stance toward each power against the share of their mineral exports that actually goes there; and who says what, by bloc." layer="facts" tags={<span className="chip border border-dashed border-interp/60 text-interp">dataset coding · not validated</span>}
        asks="Do governments that speak warmly of a power also sell it their ore? A bubble chart sets each country's coded stance against the share of its mineral exports that goes to that power, so words and money meet in one point."
        how="One bubble per country: stance across, from −1 cool to +1 warm; export share up; bubble area the country's mineral exports; the four tinted corners name the combinations. A country listed under the chart has no partner row for that power and is not drawn at 0%. The bars on the right count coded positions by speaker bloc."
        says="Look for the bubbles off the diagonal: warm words with small trade, or large trade with cool words. The height of a bubble is a fact from reported trade; its position across is the dataset's own coding, which no one has validated.">
        <WordsVsMoney countries={file.countries} byBloc={file.region.talk_vs_money.by_bloc} />
      </Block>

      <Block id="ledger" provenance={labProvenance("ledger", realMeta)} n={4} title="Who talks, who pays" lead="Statement counts by speaker bloc beside documented commitments by origin." layer="facts"
        asks="Who does the talking and who does the paying? Two bar lists, each on its own visual scale, put statement counts beside documented commitments so the two can be compared by eye."
        how="Left: one bar per speaker bloc, its length the number of statements. Right: one bar per origin and window, the darker part tagged to a mineral; the later US window is listed apart because the Chinese record ends earlier, so the two are never added. The three cards above give the ratios."
        says={`${usTalksMore && cnPaysMore ? "In the shared window the United States speaks more and China commits more: the talking and the paying come from different capitals." : "Compare the longest bar on each side: the bloc that speaks most and the origin that commits most need not be the same."} After ${tm.finance.CN.years[1]} the Chinese record ends, so later US commitments stand without a counterpart.`}>
        <Ledger tm={file.region.talk_vs_money} />
      </Block>

      <Block id="minerals" provenance={labProvenance("minerals", realMeta)} n={5} title="Talk and trade by mineral" lead="The minerals leaders name against the minerals that earn the export value." layer="facts"
        asks="Do leaders talk about the minerals that earn the money? One small dumbbell chart per country sets each mineral's share of the mentions against its share of the export value."
        how="One row per mineral, up to seven: the purple dot is its share of the mineral mentions in the country's statements, the black dot its share of reported export value, the grey bar the gap between them; the mismatch in the title sums the gaps. A country without enough mentions has no card."
        says="A long bar is a mineral talked about far more, or far less, than it earns, and the mismatch figure ranks the countries by it. The mentions come from the owner's coded statements, so where the statement count is small the purple dots move with a single speech.">
        <MineralsTalk countries={file.countries} />
      </Block>

      <Block id="parity" provenance={labProvenance("parity", realMeta)} n={6} title="What it would take" lead="The yearly export value that would have to switch from China to the United States for the two to buy the same." layer="facts" tags={<span className="chip border border-rule text-ink-3">arithmetic at constant totals</span>}
        asks="How much trade would have to change hands for the United States to buy as much as China? One bar per country turns the gap between the two buyers into a yearly dollar figure."
        how="Bars run from the largest gap to the smallest, one per country where China buys more; the label gives the amount and, on a wide screen, how many times the current US purchases it is. Countries with a gap under US$10 m, or where the United States already buys more, are left out."
        says="The amounts are the size of today's gap at constant totals, not what any policy could move; the table says whether the country's largest mineral to China could cover the gap on its own.">
        <ParityChart countries={file.countries} />
      </Block>

      <Block id="shocks" provenance={labProvenance("shocks", realMeta)} n={7} title="After the shock" lead="What followed each kind of event in these countries, two years after against two years before; the shock lever uses the family mean." layer="model"
        asks="What followed each kind of event in these countries' export shares? One dot per event and country, with the family mean as a tick, lets the spread show beside the average the shock lever uses."
        how="One row per event family; each dot is the change in the share two years after an event minus two years before, coloured by the buyer the share goes to; the thick tick is the family mean. The family chosen as a shock above is drawn in full and the others faded."
        says="Look at the spread before the tick: a family whose dots fall on both sides of zero gives a mean the shock lever carries but that no single country followed. Each window's placebo p is in the tip and the table."
        saysKind="model">
        <Shocks echoes={file.region.event_echoes} titles={file.region.event_titles} selected={levers?.shock ?? null} />
      </Block>

      <Block id="panel" provenance={panelProvenance ? { ...panelProvenance, caveat: panelCaveat } : undefined} n={8} title="What the panel says" lead={panelLead} layer="model"
        asks="Which recorded ties move together across the panel once country and year effects are taken out? A dot-and-range chart shows each regressor's coefficient for each outcome, so the four outcomes read side by side."
        how="One panel per outcome, one row per regressor: the dot is the change in the share, in points, for one standard deviation of the regressor; the line is where the coefficient lands when one country is dropped; a filled dot passes the wild-cluster bootstrap at 5%. The lever on the right applies one coefficient to a change you choose."
        says={`The coefficients are associations within countries over time; the panel cannot establish causation, so a filled dot says that the two moved together across ${reg0 ? `${reg0.n_countries} countries` : "the panel"}, not that one moved the other. A line that crosses zero means a single country carries the result.`}
        saysKind="model">
        <PanelLever reg={file.region.regressions} />
      </Block>

      <Block id="attention" provenance={labProvenance("attention", realMeta)} n={9} title="Attention and money" lead="Washington's paper trail and its cheque book, year by year, with Beijing's commitments beside them." layer="facts"
        asks="Does Washington's attention track its money? Four small bar charts on the same years put policy documents and statements beside US and Chinese commitments, so the peaks can be compared."
        how="One bar per year on each panel; the vertical scales differ, so compare shapes across panels and heights within one. A shaded span on a money panel is the years after the source ends: no record, not zero."
        says="Compare the years when the documents peak with the years when the commitments do; the two need not move together, and the Chinese bars stop where their source ends rather than where the money did.">
        <Attention rows={file.region.attention} lastYear={{ finance_US: file.meta.last_year.finance_US ?? null, finance_CN: file.meta.last_year.finance_CN ?? null }} />
      </Block>

      <Block id="findings" provenance={labProvenance("findings", realMeta)} n={10} title="Findings" lead="Generated from the indicators above by fixed templates; click a sentence for the indicator ids, and read the evidence meter before you quote a headline." layer="interpretation"
        asks="What do the indicators above add up to? One card per finding keeps each claim next to its evidence level and its caveat, so a headline is never read without them."
        how="One card per finding: the headline, an evidence meter of one to three bars, the countries it rests on, and sentences that open the indicator ids behind them when clicked. The filters narrow the cards by evidence level or by country."
        says="The sentences are written by fixed templates from the numbers above, so a full meter means the indicators agree, not that anyone has reviewed the claim; read the caveat before quoting."
        tags={<><Segmented value={level} onChange={setLevel} label="Evidence level" options={[{ value: "all", label: "All" }, { value: "strong", label: "Strong" }, { value: "moderate", label: "Moderate" }, { value: "thin", label: "Thin" }]} /><select className="input text-xs" value={onlyCountry} onChange={(e) => setOnlyCountry(e.target.value)} aria-label="Only findings about a country"><option value="">every country</option>{file.countries.map((c) => <option key={c.iso3} value={c.iso3}>{COUNTRY_NAMES[c.iso3] ?? c.name}</option>)}</select></>}>
        {findings.length ? <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{findings.map((f) => <FindingCard key={f.id} f={f} />)}</div> : <p className="text-sm text-ink-3">No finding matches the filter.</p>}
      </Block>

      <Block id="reading" provenance={labProvenance("reading", realMeta)} n={11} title="Reading and outlook" lead="The interpretation of the contrasts and the perspective to 2030, kept apart from the facts and the models." layer="interpretation"
        asks="What is the site's own reading of these contrasts and of the outlook to 2030? A text block, kept apart from the facts and the models, so that the judgement is visible as judgement."
        how="Read it as one argument: the text is signed and dated, and its review status is printed above it; nothing in it changes with the levers."
        says="This is the interpretation layer: it can be wrong where the measures are thin, and every claim it makes points back to a block above.">
        <Interpretation block={interp} scopeLabel="the Lab" hideGenerated />
      </Block>
    </div>
  );
}
