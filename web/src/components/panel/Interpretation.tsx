"use client";

import { useState } from "react";
import { LayerLabel } from "@/components/ui/Badges";
import type { InterpretationBlock } from "@/lib/types";

/** Minimal rendering of the owner's Markdown: #/## headings and blank-line paragraphs; everything else as typed. */
function renderMarkdown(md: string) {
  const blocks = md.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  return blocks.map((b, i) => {
    const h = /^(#{1,3})\s+(.*)$/.exec(b);
    if (h) {
      const level = h[1].length;
      const cls = level === 1 ? "mt-2 text-sm font-semibold" : "mt-2 text-xs font-semibold uppercase tracking-wide text-ink-2";
      return <p key={i} className={cls}>{h[2]}</p>;
    }
    if (/^[-*]\s+/m.test(b)) {
      return (
        <ul key={i} className="list-disc pl-4 text-sm text-ink-2">
          {b.split(/\n/).map((line, j) => <li key={j}>{line.replace(/^[-*]\s+/, "")}</li>)}
        </ul>
      );
    }
    return <p key={i} className="text-sm text-ink-2">{b}</p>;
  });
}

/**
 * The third layer: text generated from named indicators (each sentence can show the indicator ids it rests on)
 * and, apart from it, the project owner's own writing. Used by the country Analysis tab and the region page.
 */
export function Interpretation({ block, scopeLabel }: { block: InterpretationBlock | null | undefined; scopeLabel: string }) {
  const [open, setOpen] = useState<string | null>(null);
  if (!block) {
    return (
      <div className="rounded border border-dotted border-interp/60 bg-surface-2 p-3 text-sm text-ink-2">
        <p>No written analysis for {scopeLabel} yet: the briefs are generated once the quant step has run on a data release.</p>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <div className="rounded border border-dotted border-interp/60 bg-surface-2 p-3">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-interp">Generated from indicators · templates {block.template_version} · {block.generated_on}</p>
          <LayerLabel layer="interpretation" />
        </div>
        <p className="mb-2 text-[11px] text-ink-3">{block.label} Click a sentence to see the indicator ids behind it (table:field:actor:year).</p>
        {block.generated.map((g) => (
          <section key={g.section} className="mb-2" aria-label={g.title}>
            <h4 className="text-xs font-semibold text-ink">
              {g.title}
              {g.changed_since_previous && <span className="ml-1 rounded-sm bg-interp/10 px-1 text-[9px] font-medium uppercase text-interp" title={g.previous_date ? `text differs from the ${g.previous_date} release` : "first release of this section"}>updated</span>}
            </h4>
            <p className="text-sm leading-relaxed text-ink-2">
              {g.sentences.map((s, i) => {
                const key = `${g.section}-${i}`;
                return (
                  <span key={key}>
                    <button type="button" onClick={() => setOpen(open === key ? null : key)} className={`text-left hover:bg-interp/10 ${open === key ? "bg-interp/10" : ""}`} aria-expanded={open === key} title="Show the indicators behind this sentence">
                      {s.text}
                    </button>{" "}
                    {open === key && (
                      <span className="block my-1 rounded border border-rule bg-surface px-2 py-1 font-mono text-[10px] text-ink-3">based on: {s.ids.join(", ") || "—"}</span>
                    )}
                  </span>
                );
              })}
            </p>
          </section>
        ))}
      </div>
      <div className="rounded border border-dotted border-interp/60 bg-surface-2 p-3">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-interp">Written by the project owner</p>
          <LayerLabel layer="interpretation" />
        </div>
        {block.human ? (
          <div>
            <p className="text-sm font-semibold">{block.human.title}{!block.human.reviewed && <span className="ml-1 rounded-sm border border-dotted border-ink-3 px-1 text-[9px] uppercase text-ink-3">draft</span>}</p>
            <p className="mb-1 text-[11px] text-ink-3">{block.human.author ?? "project owner"}{block.human.date ? ` · ${block.human.date}` : ""}{block.human.reviewed ? " · reviewed" : " · not yet reviewed"}</p>
            <div className="space-y-1">{renderMarkdown(block.human.text_md)}</div>
          </div>
        ) : (
          <p className="text-sm text-ink-3">No human-written interpretation for {scopeLabel} yet. The project owner adds one as a Markdown file under <code className="font-mono text-xs">data/manual/interpretation/</code>; it is shown here, apart from the generated text, and nothing is written in its place.</p>
        )}
      </div>
    </div>
  );
}
