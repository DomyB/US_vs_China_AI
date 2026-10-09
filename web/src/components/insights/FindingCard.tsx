"use client";

import { useState } from "react";
import { COUNTRY_NAMES } from "@/lib/constants";
import type { Finding } from "@/lib/types";
import { EvidenceMeter } from "./shared";

export function FindingCard({ f }: { f: Finding }) {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <article className="card flex h-full flex-col px-4 py-3" aria-labelledby={`f-${f.id}`}>
      <p className="eyebrow">{f.title}</p>
      <h3 id={`f-${f.id}`} className="serif mt-0.5 text-lg font-bold leading-snug">{f.headline}</h3>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
        <EvidenceMeter level={f.strength.level} basis={f.strength.basis} />
        {f.countries.length > 0 && f.countries.length < 12 && <span className="text-[11px] text-ink-3">{f.countries.map((c) => COUNTRY_NAMES[c] ?? c).join(", ")}</span>}
      </div>
      <p className="mt-2 text-sm leading-relaxed text-ink-2">
        {f.sentences.map((s, i) => (
          <span key={i}>
            <button type="button" onClick={() => setOpen(open === i ? null : i)} className={`text-left hover:bg-interp/10 ${open === i ? "bg-interp/10" : ""}`} aria-expanded={open === i} title="Show the indicators behind this sentence">{s.text}</button>{" "}
            {open === i && <span className="my-1 block rounded border border-rule bg-surface px-2 py-1 font-mono text-[10px] text-ink-3">based on: {s.ids.join(", ") || "—"}</span>}
          </span>
        ))}
      </p>
      <p className="mt-auto pt-2 text-[11px] leading-snug text-ink-3"><span className="font-semibold text-ink-2">Evidence:</span> {f.strength.basis}.{f.caveat ? <> <span className="font-semibold text-ink-2">Why it could be wrong:</span> {f.caveat}</> : null}</p>
    </article>
  );
}
