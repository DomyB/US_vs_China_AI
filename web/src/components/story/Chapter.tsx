"use client";

import Link from "next/link";
import { useEffect, useId, useState, type ReactNode } from "react";
import { EvidenceButton } from "@/components/ui/EvidenceDrawer";
import { RELIABILITY_LABEL } from "@/lib/constants";
import type { Provenance } from "@/lib/provenance";
import { sourceEntry } from "@/lib/sources";
import type { EvidenceLevel, Reliability } from "@/lib/types";
import { useSources } from "@/lib/useSources";

/** Dispatched on window by "Start the story over": the opening replays and every guess is cleared. */
export const STORY_RESTART_EVENT = "story:restart";

export function restartStory() {
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith("guess.")) localStorage.removeItem(k);
  } catch {
    // storage may be unavailable
  }
  window.dispatchEvent(new Event(STORY_RESTART_EVENT));
}

export type Layer = "facts" | "model" | "interp";
const LAYER_LABEL: Record<Layer, string> = { facts: "Facts", model: "Model output", interp: "Interpretation" };

/** One chapter: a dark title card asking the question, then the paper where the exhibit and the step cards sit. */
export function Chapter({ n, eyebrow, question, meter, children }: { n: number; eyebrow: string; question: string; meter?: { level: EvidenceLevel; basis: string }; children: ReactNode }) {
  return (
    <section id={`c${n}`} className="story-chapter scroll-mt-2" aria-labelledby={`c${n}-title`}>
      <div className="ink-stage chapter-card">
        <div className="mx-auto max-w-5xl">
          <p className="eyebrow !text-[0.7rem] opacity-80">Chapter {n} · {eyebrow}</p>
          <h2 id={`c${n}-title`} className="mt-2">{question}</h2>
          {meter && (
            <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs opacity-85" title={meter.basis}>
              {/* the meter and its word stay on one line; the basis wraps beneath on a phone, with the separator only when it sits beside */}
              <span className="inline-flex items-center gap-2 whitespace-nowrap"><Meter level={meter.level} /> evidence {meter.level}</span>
              <span className="opacity-80 sm:before:content-['·_']">{meter.basis}</span>
            </p>
          )}
        </div>
      </div>
      <div className="mx-auto max-w-5xl px-4 py-6 sm:py-8">{children}</div>
    </section>
  );
}

const METER_BARS: Record<EvidenceLevel, number> = { thin: 1, moderate: 2, strong: 3 };

/** Three bars in the surrounding text colour, so the meter reads the same on the ink stage, the rail and the paper in either scheme. */
export function Meter({ level }: { level: EvidenceLevel }) {
  return (
    <span className="meter" data-level={level} aria-label={`evidence ${level}`}>
      {[1, 2, 3].map((n) => <i key={n} className={n <= METER_BARS[level] ? "bg-current" : "bg-current/25"} />)}
    </span>
  );
}

export function StepCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`story-step card p-4 text-sm leading-relaxed text-ink-2 ${className}`}>{children}</div>;
}

/**
 * A flat exhibit with its provenance ribbon: the layer on the left edge, the sources with their reliability and the table ids beneath.
 * `id` is the figure's anchor: the drawer's "Copy link" and the issue body point at it, so every exhibit on the story carries one.
 * `lastYear` (label → year) is printed by the drawer as "Last year of data" where the chapter knows it.
 */
export function Exhibit({ id, title, layer, sources = [], ids = [], tables, explore, note, evidence, caveat, model, status, findingId, glossary, lastYear, table, children }: { id?: string; title: ReactNode; layer: Layer; sources?: string[]; ids?: string[]; tables?: string[]; explore?: { href: string; label?: string }; note?: ReactNode; evidence?: Provenance["evidence"]; caveat?: string; model?: Provenance["model"]; status?: string; findingId?: string; glossary?: string[]; lastYear?: Provenance["lastYear"]; table?: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const registry = useSources();
  const srcs = sources.map((id) => ({ id, s: sourceEntry(registry, id) }));
  const provenance: Provenance = {
    title: typeof title === "string" ? title : "This exhibit",
    layer: layer === "interp" ? "interpretation" : layer,
    tables,
    ids,
    sources,
    explore,
    evidence,
    caveat,
    model,
    status,
    findingId,
    glossary,
    lastYear,
    anchor: id,
  };
  return (
    <figure id={id} className="exhibit scroll-mt-12" data-layer={layer}>
      <span className="ribbon-label" aria-hidden="true">{LAYER_LABEL[layer]}</span>
      <figcaption className="mb-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <span className="text-sm font-semibold">{title}</span>
        <span className="flex items-center gap-2 text-[11px] text-ink-3"><span>{LAYER_LABEL[layer]}</span><EvidenceButton provenance={provenance} table={table} /></span>
      </figcaption>
      <div className="min-w-0">{children}</div>
      {note && <p className="mt-2 text-[11px] leading-snug text-ink-3">{note}</p>}
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-3">
        {srcs.length > 0 && (
          <span>
            Sources: {srcs.map(({ id, s }, i) => (
              <span key={id}>
                {i > 0 && " · "}
                {s?.url ? <a href={s.url} target="_blank" rel="noopener noreferrer" className="underline decoration-dotted">{s.name}</a> : (s?.name ?? id)}
                {s?.reliability && <span className="text-ink-3"> ({RELIABILITY_LABEL[s.reliability as Reliability] ?? s.reliability})</span>}
              </span>
            ))}
          </span>
        )}
        {ids.length > 0 && (
          <button type="button" className="underline decoration-dotted pointer-coarse:-my-2 pointer-coarse:py-2" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
            {open ? "Hide" : "Show"} table ids
          </button>
        )}
        {explore && <Link href={explore.href} className="ml-auto underline pointer-coarse:-my-2 pointer-coarse:py-2">{explore.label ?? "Explore this exhibit"} →</Link>}
      </div>
      {open && ids.length > 0 && <p className="mt-1 font-mono text-[11px] text-ink-3 [overflow-wrap:anywhere]">{ids.join(" · ")}</p>}
    </figure>
  );
}

export function KeyNumber({ value, label, tone, size = "text-4xl sm:text-5xl" }: { value: ReactNode; label: ReactNode; tone?: "us" | "cn"; size?: string }) {
  return (
    <div className="min-w-0">
      <div className={`key-number ${size} ${tone === "us" ? "text-us" : tone === "cn" ? "text-cn" : ""}`}>{value}</div>
      <div className="mt-1 text-xs leading-snug text-ink-2">{label}</div>
    </div>
  );
}

/**
 * Guess first, on a fact: a labelled range, the reader's guess kept as a dashed tick beside the record's value, the reveal
 * announced in a live region. Stored in this browser only; no score, no verdict word.
 */
export function GuessFirst({ id, question, min, max, step = 1, answer, format, unit }: { id: string; question: string; min: number; max: number; step?: number; answer: number; format: (v: number) => string; unit?: string }) {
  const inputId = useId();
  const key = `guess.${id}`;
  const [guess, setGuess] = useState<number>((min + max) / 2);
  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    try {
      const v = localStorage.getItem(key);
      if (v !== null) {
        setGuess(Number(v));
        setRevealed(true);
      }
    } catch {
      // storage unavailable: the prompt still works for this visit
    }
  }, [key]);
  const reveal = () => {
    setRevealed(true);
    try {
      localStorage.setItem(key, String(guess));
    } catch {
      // ignore
    }
  };
  const again = () => {
    setRevealed(false);
    setGuess((min + max) / 2);
    try {
      localStorage.removeItem(key);
    } catch {
      // ignore
    }
  };
  useEffect(() => {
    const onRestart = () => {
      setRevealed(false);
      setGuess((min + max) / 2);
    };
    window.addEventListener(STORY_RESTART_EVENT, onRestart);
    return () => window.removeEventListener(STORY_RESTART_EVENT, onRestart);
  }, [min, max]);
  const pct = (v: number) => `${((v - min) / (max - min)) * 100}%`;
  return (
    <div className="card p-4">
      <label htmlFor={inputId} className="block text-sm font-semibold">{question}</label>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <input id={inputId} type="range" min={min} max={max} step={step} value={guess} onChange={(e) => setGuess(Number(e.target.value))} disabled={revealed} className="min-w-[10rem] flex-1" aria-valuetext={`${format(guess)}${unit ? ` ${unit}` : ""}`} />
        <output htmlFor={inputId} className="serif w-20 text-right text-2xl tabular-nums">{format(guess)}</output>
        {revealed ? (
          <button type="button" className="btn btn-sm" onClick={again}>Guess again</button>
        ) : (
          <button type="button" className="btn btn-sm btn-primary" onClick={reveal}>Show the record</button>
        )}
      </div>
      <div className="relative mt-3 h-6 border-b border-rule-2">
        <span className="absolute -bottom-px h-3 w-0 border-l-[1.5px] border-dashed border-ink" style={{ left: pct(guess) }} title={`your guess: ${format(guess)}`} aria-hidden="true" />
        {revealed && <span className="absolute -bottom-px h-5 w-0 border-l-2 border-cn" style={{ left: pct(Math.min(max, Math.max(min, answer))) }} aria-hidden="true" />}
        <span className="absolute left-0 top-0 text-[10px] text-ink-3">{format(min)}</span>
        <span className="absolute right-0 top-0 text-[10px] text-ink-3">{format(max)}{answer > max ? "+" : ""}</span>
      </div>
      <p className="mt-2 text-xs text-ink-2" aria-live="polite">
        {revealed ? <>The record says <strong className="text-cn">{format(answer)}</strong>{unit ? ` ${unit}` : ""}; you guessed {format(guess)}. The dashed tick is yours.</> : <span className="text-ink-3">Move the slider, then show the record. Your guess stays in this browser.</span>}
      </p>
    </div>
  );
}

export function Door({ href, title, text, primary = false }: { href: string; title: string; text: string; primary?: boolean }) {
  return (
    <Link href={href} className={`door ${primary ? "bg-current/10 hover:bg-current/15" : ""}`}>
      <span className="font-semibold">{title} →</span>
      <span className="text-xs opacity-80">{text}</span>
    </Link>
  );
}
