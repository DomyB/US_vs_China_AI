"use client";

import Link from "next/link";
import { useEffect, useId, useState, type ReactNode } from "react";
import { sourceById } from "@/lib/sources";
import { RELIABILITY_LABEL } from "@/lib/constants";
import type { EvidenceLevel, Reliability } from "@/lib/types";

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
            <p className="mt-3 flex items-center gap-2 text-xs opacity-85" title={meter.basis}>
              <Meter level={meter.level} /> evidence {meter.level} · <span className="opacity-80">{meter.basis}</span>
            </p>
          )}
        </div>
      </div>
      <div className="mx-auto max-w-5xl px-4 py-6 sm:py-8">{children}</div>
    </section>
  );
}

export function Meter({ level }: { level: EvidenceLevel }) {
  return (
    <span className="meter" data-level={level} aria-label={`evidence ${level}`}>
      <i /><i /><i />
    </span>
  );
}

export function StepCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`story-step card p-4 text-sm leading-relaxed text-ink-2 ${className}`}>{children}</div>;
}

/** A flat exhibit with its provenance ribbon: the layer on the left edge, the sources with their reliability and the table ids beneath. */
export function Exhibit({ title, layer, sources = [], ids = [], explore, note, children }: { title: ReactNode; layer: Layer; sources?: string[]; ids?: string[]; explore?: { href: string; label?: string }; note?: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const srcs = sources.map((id) => ({ id, s: sourceById(id) }));
  return (
    <figure className="exhibit" data-layer={layer}>
      <span className="ribbon-label" aria-hidden="true">{LAYER_LABEL[layer]}</span>
      <figcaption className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="text-sm font-semibold">{title}</span>
        <span className="text-[11px] text-ink-3">{LAYER_LABEL[layer]}</span>
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
          <button type="button" className="underline decoration-dotted" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
            {open ? "Hide" : "Show"} table ids
          </button>
        )}
        {explore && <Link href={explore.href} className="ml-auto underline">{explore.label ?? "Explore this exhibit"} →</Link>}
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
  const pct = (v: number) => `${((v - min) / (max - min)) * 100}%`;
  return (
    <div className="card p-4">
      <label htmlFor={inputId} className="block text-sm font-semibold">{question}</label>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <input id={inputId} type="range" min={min} max={max} step={step} value={guess} onChange={(e) => setGuess(Number(e.target.value))} disabled={revealed} className="min-w-[10rem] flex-1" aria-valuetext={`${format(guess)}${unit ? ` ${unit}` : ""}`} />
        <output htmlFor={inputId} className="serif w-20 text-right text-2xl tabular-nums">{format(guess)}</output>
        {!revealed && <button type="button" className="btn btn-sm btn-primary" onClick={reveal}>Show the record</button>}
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
    <Link href={href} className={`door ${primary ? "bg-stage-ink/10" : ""}`}>
      <span className="font-semibold">{title} →</span>
      <span className="text-xs opacity-80">{text}</span>
    </Link>
  );
}
