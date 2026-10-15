"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { VerdictTable } from "@/components/story/Verdicts";
import { LayerLabel } from "@/components/ui/Badges";
import { Reading } from "@/components/ui/Reading";
import { InsightsSkeleton } from "@/components/ui/Skeleton";
import { COUNTRY_COUNT, IN_SCOPE, YEAR_MAX } from "@/lib/constants";
import { loadComponents, loadFlows, loadIndex, loadInvestment } from "@/lib/data";
import { MEASURE_LABEL, VERDICT_LABEL, WORKS, type Measure, type Work } from "@/lib/literature";
import { financeByYear, investmentByYear, leanByYear, tradeByYear, votesByYear } from "@/lib/overview";
import { verdicts as measureVerdicts, type MeasureVerdict } from "@/lib/verdicts";

const ORDER: Measure[] = ["trade", "finance", "investment", "votes", "index", "lithium", "events"];
const VERDICT_TONE = { agrees: "border-us text-us", partly: "border-outline text-ink", cannot_say: "border-outline text-ink-3" } as const;

/** What do we know: the record's own verdicts, the literature set against them, and where each reading comes from. */
export function WhatWeKnowView() {
  const [state, setState] = useState<{ verdicts: MeasureVerdict[]; ok: boolean } | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    Promise.all([loadFlows(), loadIndex(), loadComponents(), loadInvestment()])
      .then(([flows, index, components, investment]) => {
        if (!alive) return;
        const scope = new Set(IN_SCOPE);
        if (flows.layer !== "real") { setState({ verdicts: [], ok: false }); return; }
        const o = { trade: tradeByYear(flows.data.trade, scope), finance: financeByYear(flows.data.finance, scope), votes: components ? votesByYear(components, scope) : [], lean: leanByYear(index.rows, scope), investment: investment ? investmentByYear(investment, scope) : [] };
        setState({ verdicts: measureVerdicts(o, { trade: flows.data.meta.last_year.trade ?? null, finance_CN: flows.data.meta.last_year.finance_CN ?? null }, YEAR_MAX), ok: true });
      })
      .catch(() => alive && setState({ verdicts: [], ok: false }));
    return () => { alive = false; };
  }, []);
  const byMeasure = useMemo(() => { const m = new Map<Measure, Work[]>(); for (const w of WORKS) m.set(w.measure, [...(m.get(w.measure) ?? []), w]); return m; }, []);
  if (state === undefined) return <InsightsSkeleton />;
  return (
    <div className="mx-auto max-w-5xl px-4 pb-16 pt-6 sm:px-6">
      <header className="max-w-3xl">
        <p className="eyebrow">After the analysis</p>
        <h1 className="serif mt-1 text-2xl font-bold leading-tight sm:text-4xl">What do we know?</h1>
        <p className="mt-3 text-base leading-relaxed text-ink-2">Three things, kept apart: what this record says measure by measure, what the published literature on China, the United States and Latin America&apos;s minerals has argued, and where the two agree. The first is the exports&apos; arithmetic over {COUNTRY_COUNT} countries; the second is a reading list checked against the publishers&apos; pages; the third is interpretation, drafted by an AI session and labelled so.</p>
        <div className="mt-3 flex flex-wrap gap-1.5"><LayerLabel layer="facts" /><LayerLabel layer="model" /><LayerLabel layer="interpretation" /></div>
      </header>

      <section className="mt-8" aria-labelledby="wwk-record">
        <h2 id="wwk-record" className="serif text-xl font-bold">1 · What the record says</h2>
        <p className="mt-1 text-sm text-ink-2">Each measure in its latest year, summed or averaged over the countries that carry a value; the index is a model output. The story&apos;s <Link href="/story#c10" className="underline">closing chapter</Link> reads these together.</p>
        <Reading compact asks="What does the record say, measure by measure, before any reading is laid over it? One table row per measure keeps the latest figure, its year and its verdict together, so the literature below can be checked against them." how="One row per measure, with its layer and year under the name: whom it favours in its latest year, the figures behind that, and what keeps it from settling the question; the tally above counts the rows. A measure whose source ends early carries that year, and a row marked no figure has no value, not a zero." />
        <div className="card mt-3 px-4 py-4">{state.ok && state.verdicts.length ? <VerdictTable verdicts={state.verdicts} /> : <p className="text-sm text-ink-3">The exports could not be loaded; the verdicts need the real data release.</p>}</div>
        <Reading compact says="Each verdict is the exports' arithmetic over the countries that carry a value, and the index row is a model output; none of them says why a measure moved, which is what the sections below argue about." />
      </section>

      <section className="mt-8" aria-labelledby="wwk-lit">
        <h2 id="wwk-lit" className="serif text-xl font-bold">2 · What the literature says, and whether the record agrees</h2>
        <p className="mt-1 text-sm text-ink-2">One sentence per work (our paraphrase of its claim), the measure of this record it bears on, and a verdict: the record agrees, partly agrees, or cannot say because it does not hold what the claim is about. The verdicts and readings are interpretation; the works are real and linked.</p>
        {ORDER.filter((m) => byMeasure.has(m)).map((m) => (
          <div key={m} className="mt-4">
            <h3 className="eyebrow">{MEASURE_LABEL[m]}</h3>
            <ul className="mt-1 space-y-3">
              {(byMeasure.get(m) ?? []).map((w) => (
                <li key={w.id} className="card px-4 py-3">
                  <p className="text-sm"><strong>{w.authors} ({w.year}).</strong> <a href={w.url} className="underline" target="_blank" rel="noreferrer">{w.title}</a>. <span className="text-ink-2">{w.venue}.</span></p>
                  <p className="mt-1.5 text-sm"><span className="text-ink-3">Claim · </span>{w.claim}</p>
                  <p className="mt-1.5 text-sm"><span className={`mr-2 rounded-full border px-2 py-0.5 text-[11px] ${VERDICT_TONE[w.verdict]}`}>{VERDICT_LABEL[w.verdict]}</span><span className="text-ink-2">{w.reading}</span></p>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      <section className="mt-8 card px-4 py-4 sm:px-6" aria-labelledby="wwk-so">
        <div className="flex flex-wrap items-center gap-2"><h2 id="wwk-so" className="serif text-xl font-bold">3 · So what is interesting</h2><LayerLabel layer="interpretation" /><span className="text-[11px] text-ink-3">AI-drafted, not yet reviewed by the owner</span></div>
        <div className="prose-doc mt-2 max-w-3xl text-sm leading-relaxed">
          <p>Three things in this record are not in the headlines. <strong>First, the votes came before the ore.</strong> The region voted with China at the General Assembly far more often than with the United States at the start of the record, when China bought almost none of its minerals; the trade then turned, and the voting barely moved. The literature that reads alignment as a purchase (Flores-Macías and Kreps) finds less support here than the literature that reads it as domestic and ideological (Strüver). <strong>Second, the cheques and the capital point in opposite directions.</strong> The documented Chinese commitments are large, old and ended with their source; the stock of capital, where the surveys reach, is still mostly American, and the two sides cannot agree on the size of the Chinese part. &ldquo;Who is winning&rdquo; depends on whether one asks about flows or stocks. <strong>Third, the countries that sell to China are not the countries that vote with it.</strong> The &ldquo;Votes and ore&rdquo; page shows the two leans nearly uncorrelated, with corners such as Colombia, Paraguay and Uruguay voting with China while selling to the United States, and Argentina the reverse.</p>
          <p>The companion project <Link href="/denial" className="underline">Denial without Substitution</Link> carries the fuller corpus: thirty-one studies reduced to claims with page citations, twenty-nine findings with their confidence, seventeen mechanisms tested, twenty country verdicts and the coded governments since 2001, served from its own files and labelled as its reading.</p>
          <p>What the record cannot say is as clear: nothing here measures the policy latitude Kaplan describes, the imaginaries Barandiarán describes, or the manufacturing side of Gallagher and Porzecanski&apos;s warning. The next topic, what the ore becomes after export, is where those questions and this method meet; the story&apos;s <Link href="/story#c10" className="underline">closing chapter</Link> opens it.</p>
        </div>
      </section>
    </div>
  );
}
