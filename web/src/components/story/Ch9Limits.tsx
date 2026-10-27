"use client";

import Link from "next/link";
import { COUNTRY_COUNT_WORD, YEAR_MIN } from "@/lib/constants";
import { Door, StepCard, restartStory } from "./Chapter";

export interface Limit { text: string; ids: string[] }

/** The limits as numbered facts, what would change the reading, and the doors into the evidence room; the coverage wall and the chapter meters are in the appendix. */
export function Ch9Limits({ limits, changes }: { limits: Limit[]; changes: string[] }) {
  return (
    <div className="space-y-6">
      <p className="text-sm text-ink-2">The coverage wall (which record each country holds) and the chapter meters (how strong each chapter is, with its basis) are in the <Link href="/story/appendix#c9-wall" className="underline decoration-dotted">appendix</Link>.</p>
      <div className="grid gap-6 lg:grid-cols-2">
        <StepCard>
          <p className="font-semibold text-ink">The limits, as numbered facts</p>
          <ol className="mt-2 list-decimal space-y-1.5 pl-5">
            {limits.map((l, i) => <li key={i}>{l.text}</li>)}
          </ol>
        </StepCard>
        <StepCard>
          <p className="font-semibold text-ink">What would change this reading</p>
          <ul className="mt-2 list-disc space-y-1.5 pl-5">
            {changes.map((c, i) => <li key={i}>{c}</li>)}
          </ul>
          <p className="mt-3 text-xs text-ink-3">The full list of known limits is in <Link href="/methodology#limitations" className="underline">Methods</Link> and in the repository&apos;s LIMITATIONS.md; corrections arrive as GitHub issues naming the finding id.</p>
        </StepCard>
      </div>
      <div className="ink-stage rounded-xl p-5 sm:p-8">
        <p className="eyebrow !text-[0.68rem] opacity-80">The evidence room</p>
        <p className="serif mt-2 text-2xl sm:text-3xl">The case is laid out. Now walk the evidence.</p>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <Door href="/explore" title="The map" text={`Index lean, money arcs and trade arcs, every year since ${YEAR_MIN}.`} primary />
          <Door href="/country" title="The case files" text={`${COUNTRY_COUNT_WORD[0].toUpperCase()}${COUNTRY_COUNT_WORD.slice(1)} countries, five tabs each, every receipt attached.`} />
          <Door href="/lab" title="The Lab" text="Your own scenario to 2030, labelled as yours." />
        </div>
        <p className="mt-5 text-xs opacity-80">
          Or read it again: <button type="button" className="underline decoration-dotted pointer-coarse:py-2" onClick={restartStory}>start the story over</button> (the opening replays and your guesses are cleared from this browser).
        </p>
      </div>
    </div>
  );
}
