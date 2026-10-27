"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { LayerLabel } from "@/components/ui/Badges";
import { HeaderPicture } from "@/components/ui/Picture";
import { PageGuide } from "@/components/ui/Reading";
import { InsightsSkeleton } from "@/components/ui/Skeleton";
import { chapterEvidence, coverageWall, evidenceInputs, argentinaIndexRows, presentChapters } from "@/lib/story";
import { loadAppendixFiles, type StoryLoaded } from "@/lib/storyData";
import { ArgentinaIndex } from "./exhibits/ArgentinaIndex";
import { ChapterMeters } from "./exhibits/ChapterMeters";
import { CoverageWall } from "./exhibits/CoverageWall";
import { LenderRanking } from "./exhibits/LenderRanking";
import { ChileParityBar, ParityRanking, parityGapOf } from "./exhibits/ParityExhibits";
import { RoutesExhibit } from "./exhibits/RoutesExhibit";

/** One section of the appendix: the chapter it comes from, a link back to that chapter in the story, and the exhibit or the sentence that says what is absent. */
function FromChapter({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <section className="mt-10 border-t border-rule pt-6" aria-labelledby={`from-c${n}-title`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="eyebrow">From chapter {n}</p>
        <Link href={`/story#c${n}`} className="text-xs underline decoration-dotted">Back to chapter {n} in the story →</Link>
      </div>
      <h2 id={`from-c${n}-title`} className="serif mt-1 text-xl font-bold sm:text-2xl">{title}</h2>
      <div className="mt-4 space-y-6">{children}</div>
    </section>
  );
}

const Absent = ({ children }: { children: ReactNode }) => <p className="text-sm text-ink-2">{children}</p>;

/**
 * The story's technical exhibits on their own page: the coverage wall and the chapter meters, the lender ranking, the
 * parity arithmetic, Argentina's index and the indirect route, each with its chapter named and a way back. Every
 * exhibit renders when its file is present and gives way to one sentence when it is not; no file gates the page.
 */
export function StoryAppendix() {
  const [d, setD] = useState<StoryLoaded | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    loadAppendixFiles()
      .then((loaded) => {
        if (alive) setD(loaded);
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, []);
  // the exhibits mount after the files land, so a link with a hash (#c9-wall) scrolls once the anchor exists
  useEffect(() => {
    if (!d || !window.location.hash) return;
    document.getElementById(window.location.hash.slice(1))?.scrollIntoView();
  }, [d]);
  const c = useMemo(() => {
    if (!d) return null;
    const { flows, insights } = d;
    const chl = insights?.countries.find((x) => x.iso3 === "CHL");
    const arg = insights?.countries.find((x) => x.iso3 === "ARG");
    const wall = d.meta && flows ? coverageWall(d.meta, flows) : null;
    const chapters = flows && insights ? presentChapters(chapterEvidence(evidenceInputs(flows, insights, d.quant)), { chl: chl !== undefined, arg: arg !== undefined }) : null;
    const lenders = d.quant?.network?.top_lenders?.length ? d.quant.network : null;
    return { chlParity: parityGapOf(chl), wall, chapters, lenders, argRows: argentinaIndexRows(d.index), lastYear: flows?.meta.last_year ?? null };
  }, [d]);

  if (!d && !failed) return <InsightsSkeleton />;
  return (
    <div className="mx-auto max-w-5xl px-4 pb-16 pt-6 sm:px-6">
      <p className="eyebrow">Said &amp; Paid · appendix</p>
      <h1 className="serif mt-1 text-3xl font-bold leading-tight sm:text-4xl">The technical exhibits</h1>
      <p className="mt-3 max-w-3xl text-base leading-relaxed text-ink-2">The <Link href="/story" className="underline decoration-dotted">story</Link> keeps to its headline exhibits. The ones that document the record behind them sit here, in chapter order: which record each country holds and how strong each chapter is (chapter 9), which institutions carry the lending (chapter 3), the arithmetic of parity for Chile and for every country (chapters 6 and 7), Argentina&apos;s influence index with its weight bands and its trajectory (chapter 8), and the reconciled trade that bounds what the United States could be getting through a third country (chapter 0). Each keeps its label, its sources and its anchor, so a link into the story that pointed at one of these lands here.</p>
      <div className="mt-3 flex flex-wrap items-center gap-2"><LayerLabel layer="facts" /><LayerLabel layer="model" /><LayerLabel layer="interpretation" /><span className="text-xs text-ink-3">every exhibit carries its own label</span></div>
      <PageGuide
        purpose="The appendix: the exhibits that document coverage, weights, network ranks and the arithmetic behind the story's chapters."
        read="Each section names the chapter it comes from and links back to it; read the question above an exhibit, then its findings, which carry the numbers computed from the data files, and the line beneath, which says what they tell us. A record the release does not hold is said to be absent, never drawn as zero."
        next={[{ href: "/story", label: "The story, chapter by chapter" }, { href: "/methodology", label: "How the record is built" }]}
      />
      <HeaderPicture id="open_pit" className="mt-3" />
      {failed &&<p className="mt-4 rounded-md border border-rule px-3 py-2 text-sm text-ink-2">The data export could not be loaded (a network error or a missing file); the exhibits below say what is absent. Reload the page, or go in through the <Link href="/explore" className="underline">evidence room</Link>.</p>}

      <FromChapter n={0} title="Where the United States gets it, and what passes through Canada">
        <RoutesExhibit />
      </FromChapter>

      <FromChapter n={3} title="Who lends: the largest lenders of the finance network">
        {c?.lenders && c.lastYear ? <LenderRanking network={c.lenders} lastYear={{ finance_CN: c.lastYear.finance_CN, finance_US: c.lastYear.finance_US }} /> : <Absent>The lender ranking reads the network block of the quant export (quant.json) and the finance rows of flows.json; {c?.lenders ? "the flows file" : "the network block"} is not in this release, so no ranking is drawn.</Absent>}
      </FromChapter>

      <FromChapter n={6} title="The copper parity bar">
        {c?.chlParity ? <ChileParityBar parity={c.chlParity} /> : <Absent>Chile&apos;s parity gap is a contrast of the insights export (insights.json); it is not in this release, so no bar is drawn.</Absent>}
      </FromChapter>

      <FromChapter n={7} title="What would have to change hands for the two buyers to be equal">
        {d?.insights ? <ParityRanking countries={d.insights.countries} parity={c?.chlParity} /> : <Absent>The parity ranking reads every country&apos;s parity gap from the insights export (insights.json), which is not in this release, so no bars are drawn.</Absent>}
      </FromChapter>

      <FromChapter n={8} title="Argentina's influence index and its trajectory">
        <ArgentinaIndex rows={c?.argRows ?? []} />
      </FromChapter>

      <FromChapter n={9} title="The coverage wall and the chapter meters">
        {c?.wall && c.lastYear ? <CoverageWall wall={c.wall} lastYearCN={c.lastYear.finance_CN} /> : <Absent>The coverage wall reads meta.json&apos;s coverage block and the finance rows of flows.json; {d?.meta ? "the flows file" : "the metadata"} is not in this release, so no wall is drawn.</Absent>}
        {c?.chapters ? <ChapterMeters chapters={c.chapters} hrefBase="/story" /> : <Absent>The chapter meters take their years and counts from flows.json and insights.json; one of them is not in this release, so no meters are drawn.</Absent>}
      </FromChapter>

      <p className="mt-10 border-t border-rule pt-6 text-sm text-ink-2">That is the whole appendix. <Link href="/story" className="underline">Back to the story</Link>, or on to <Link href="/methodology" className="underline decoration-dotted">how the record is built</Link>.</p>
    </div>
  );
}
