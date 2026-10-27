"use client";

import type { ChapterMeter } from "@/lib/story";
import { Exhibit, Meter } from "../Chapter";

/**
 * The chapter meters (chapter 9's second exhibit, in the appendix): one card per chapter on the story page with its
 * evidence level and the basis the level rests on. The level is an editorial judgement and is labelled interpretation;
 * each card links to `${hrefBase}#c${n}`, so the appendix sends the reader back to the story's own anchors.
 */
export function ChapterMeters({ chapters, hrefBase }: { chapters: ChapterMeter[]; hrefBase: string }) {
  const by = (level: ChapterMeter["level"]) => chapters.filter((c) => c.level === level);
  const strong = by("strong"), moderate = by("moderate"), thin = by("thin");
  const names = (xs: ChapterMeter[]) => xs.map((c) => c.label).join("; ");
  return (
    <Exhibit
      id="c9-meters"
      title="How strong is each chapter"
      layer="interp"
      sources={[]}
      ids={chapters.map((c) => `chapter:${c.n}`)}
      asks="How much should each chapter's answer be trusted? One meter per chapter, with its basis spelled out, puts the strength of the record beside the claim it supports; it rates the evidence, not the region."
      how="One card per chapter, in order: three bars read thin, moderate or strong, the word beside them, the basis the level rests on beneath; each card links back to its chapter in the story."
      findings={[
        `${strong.length} of the ${chapters.length} chapters rate strong, ${moderate.length} moderate and ${thin.length} thin.`,
        strong.length ? `Strong: ${names(strong)}.` : null,
        thin.length ? `Thin: ${names(thin)}.` : null,
      ]}
      findingsKind="interpretation"
      says="The chapters on reported trade and documented money rate strong and those on coded words thin: the record is firmest at the border and weakest where it has to read intent."
    >
      <ol className="grid gap-2 sm:grid-cols-3">
        {chapters.map((c) => (
          <li key={c.n}>
            <a href={`${hrefBase}#c${c.n}`} className="flex items-start gap-2 rounded-md border border-rule p-2 text-xs no-underline hover:bg-surface-2">
              <span className="mt-0.5"><Meter level={c.level} /></span>
              <span><strong>{c.n}. {c.label}</strong> · {c.level}<br /><span className="text-ink-3">{c.basis}</span></span>
            </a>
          </li>
        ))}
      </ol>
    </Exhibit>
  );
}
