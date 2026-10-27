"use client";

import Link from "next/link";
import { LayerLabel } from "@/components/ui/Badges";
import { Skeleton } from "@/components/ui/Skeleton";
import { COUNTRY_COUNT_WORD } from "@/lib/constants";
import { findingById, type Finding, type SummaryCard } from "@/lib/summary";

/**
 * The executive summary at the top of the home: why the question matters, the five findings with their key numbers,
 * what is new in them, one sentence to keep, and what the site cannot say. The prose is the team's reading, AI-drafted
 * and labelled interpretation; every figure is a finding computed in lib/summary.ts from the loaded files, and a
 * finding whose rows are missing prints the sentence that says so in the number's place.
 */
export function ExecutiveSummary({ cards, loading, sampleNote = null, financeLastYear = null }: { cards: SummaryCard[] | null; loading: boolean; sampleNote?: string | null; /** the last year of the Chinese finance record (flows meta), for the limits */ financeLastYear?: number | null }) {
  const get = (id: string) => (cards ? findingById(cards, id) : null);
  const turns = get("turns"), lending = get("lending"), hedge = get("hedge"), leads = get("leads");
  return (
    <section className="mt-2 border-t border-rule pt-5" aria-labelledby="summary-title">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p id="summary-title" className="eyebrow">Executive summary</p>
        <p className="text-[11px] text-ink-3"><LayerLabel layer="interpretation" /> AI-drafted; every figure computed from the data files when the page loads</p>
      </div>

      {/* why it matters */}
      <h2 className="mt-3 text-[1.15rem]">Why it matters</h2>
      <p className="serif mt-1 max-w-[72ch] text-[1.02rem] leading-snug text-ink">The minerals of the energy transition (lithium, copper, rare earths, nickel, graphite) come disproportionately from {COUNTRY_COUNT_WORD} Latin American countries, and the two largest economies compete for them. The usual account says the region is choosing sides, that Chinese loans buy its ore, and that US policy is winning it back. This site tests that account on the record, year by year, country by country, with every number linked to its source.</p>

      {/* what we found */}
      <h2 className="mt-5 text-[1.15rem]">What we found</h2>
      {loading && !cards ? (
        <div className="mt-3 grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true" aria-label="Loading the findings">
          {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-44 w-full" />)}
        </div>
      ) : sampleNote ? (
        <p className="mt-3 rounded-md border border-sample/40 bg-sample/10 px-3 py-2 text-sm text-sample">{sampleNote}</p>
      ) : cards ? (
        <div className="mt-3 grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((c) => <Card key={c.id} card={c} />)}
        </div>
      ) : (
        <p className="mt-3 text-sm text-ink-2">The findings could not be computed: a data file did not load.</p>
      )}

      {/* what is new, and the limits */}
      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        <div>
          <h2 className="text-[1.15rem]">What is new</h2>
          <ol className="mt-2 grid gap-2.5 text-sm">
            <NewLine text="Elections are not a lever on the buyer: the smelters decide." findings={[turns]} loading={loading} sampleNote={sampleNote} />
            <NewLine text="The debt-trap story and the resource-grab story are two different stories: the lending collapsed while the purchases kept rising." findings={[lending]} loading={loading} sampleNote={sampleNote} />
            <NewLine text="The region does not talk like a region choosing sides, and the index's lean to China is carried by voting habits, not by trade." findings={[hedge, leads]} loading={loading} sampleNote={sampleNote} />
          </ol>
        </div>
        <div className="grid content-start gap-5">
          <div>
            <h2 className="text-[1.15rem]">Remember this</h2>
            <p className="serif mt-1 max-w-[62ch] text-[1.02rem] italic leading-snug text-ink">Three countries&apos; copper and iron, bought by Chinese smelters, owned largely by American capital, under governments that talk about neither. <LayerLabel layer="interpretation" /></p>
          </div>
          <div>
            <h2 className="text-[1.15rem]">What this site cannot say</h2>
            <ul className="mt-2 grid gap-1.5 text-sm text-ink-2">
              <li>Shares, turns and panels describe associations, not causes; prices and mine cycles move in the same years as the politics.</li>
              <li>The Chinese finance record {financeLastYear != null ? `ends in ${financeLastYear}` : "ends where its source ends"}; later lending is not visible in it.</li>
              <li>The statements are the owner&apos;s selection, not a census, and their stance coding is unvalidated.</li>
              <li>The forecasts are indicative, fans rather than points; <Link href="/methodology#forecasting" className="underline decoration-dotted">how they are made and backtested</Link>.</li>
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

/** One of the five cards: the lead finding's number large, the card's reading, the lead's line and detail, then the further findings. */
function Card({ card }: { card: SummaryCard }) {
  const { lead } = card;
  return (
    <article className="summary-card card grid content-start gap-2 p-4" aria-labelledby={`summary-${card.id}`}>
      {lead.number != null ? <div className="key-number text-[1.9rem] sm:text-[2.1rem]">{lead.number}</div> : <p className="serif text-sm italic text-ink-3">{lead.absent}</p>}
      <h3 id={`summary-${card.id}`} className="text-[1.02rem] leading-snug">{card.title} <LayerLabel layer="interpretation" /></h3>
      <p className="text-[0.8rem] leading-snug text-ink">{lead.headline}{lead.years ? ` (${lead.years})` : ""}. <LayerLabel layer={lead.kind} /></p>
      {lead.number != null && <p className="text-[0.74rem] leading-snug text-ink-2">{lead.detail}</p>}
      {card.more.length > 0 && (
        <ul className="grid gap-1.5 border-t border-rule pt-2 text-[0.74rem] leading-snug text-ink-2">
          {card.more.map((f) => <More key={f.id} f={f} />)}
        </ul>
      )}
      <Link href={lead.href} className="mt-auto text-xs underline decoration-dotted">Where this is tested →</Link>
    </article>
  );
}

function More({ f }: { f: Finding }) {
  return (
    <li>
      <span className="reading-label">Also</span> {f.number != null ? <><strong className="font-medium text-ink">{f.number}</strong>{f.years ? ` (${f.years})` : ""}: {f.detail}</> : <span className="italic">{f.absent}</span>} <LayerLabel layer={f.kind} />
    </li>
  );
}

/** A line of "what is new": the reading, then the finding(s) it rests on with their numbers as computed. */
function NewLine({ text, findings, loading, sampleNote }: { text: string; findings: (Finding | null)[]; loading: boolean; sampleNote: string | null }) {
  const list = findings.filter((f): f is Finding => f != null);
  return (
    <li className="grid gap-0.5">
      <span className="text-ink">{text} <LayerLabel layer="interpretation" /></span>
      {sampleNote ? <span className="text-xs text-sample">{sampleNote}</span> : loading && !list.length ? <Skeleton className="h-4 w-2/3" /> : list.map((f) => (
        <span key={f.id} className="text-xs text-ink-2">{f.number != null ? <><strong className="font-medium text-ink">{f.number}</strong> · {f.headline}</> : f.absent} <LayerLabel layer={f.kind} /></span>
      ))}
    </li>
  );
}
