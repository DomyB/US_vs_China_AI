"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { reducedMotion } from "@/lib/motion";
import type { StatementRecord } from "@/lib/types";
import { Door } from "./Chapter";

export interface Receipt {
  label: string;
  value: string;
  window: string;
  source: string;
  /** an outlined line: a record that exists but carries no amount, or a draft event */
  outlined?: boolean;
  href?: string;
}

const VERIFICATION: Record<string, string> = { primary_verified: "primary source", secondary_reported: "reported by media, not primary", unverified: "unverified" };

/**
 * The opening: a politician's sentence sets letter by letter on the ink stage, then the receipts print under it one by one,
 * then the title card and the three doors. Skip and Pause are visible from the first frame and go once the sentence is
 * complete; under reduced motion everything renders at once; the full quote stays in the DOM for assistive technology.
 */
export function ColdOpen({ quote, receipts, release, pairingNote }: { quote: StatementRecord | null; receipts: Receipt[]; release: string; pairingNote: string }) {
  const text = quote?.quote_original ?? quote?.quote_en ?? "";
  const [typed, setTyped] = useState(0);
  const [paused, setPaused] = useState(false);
  const [done, setDone] = useState(false);
  // the tick reads the pause flag from a ref so a toggle reaches the running interval without restarting it
  const pausedRef = useRef(false);
  const timer = useRef(0);
  useEffect(() => {
    if (reducedMotion() || !text) {
      setTyped(text.length);
      setDone(true);
      return;
    }
    let i = 0;
    timer.current = window.setInterval(() => {
      if (pausedRef.current) return;
      i += 1;
      setTyped(i);
      if (i >= text.length) {
        window.clearInterval(timer.current);
        setDone(true);
      }
    }, 28);
    return () => window.clearInterval(timer.current);
  }, [text]);
  const togglePause = () => {
    pausedRef.current = !pausedRef.current;
    setPaused(pausedRef.current);
  };
  const skip = () => {
    window.clearInterval(timer.current);
    setTyped(text.length);
    setDone(true);
    document.getElementById("story-start")?.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth" });
  };
  const n = receipts.length;
  return (
    <section className="ink-stage" aria-label="Opening">
      <div className="mx-auto max-w-5xl px-4 pb-10 pt-8 sm:pt-14">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="eyebrow !text-[0.68rem] opacity-80">Said &amp; Paid</span>
          {/* hidden rather than removed once the sentence is complete, so the quote does not jump up when the row empties */}
          <span className={`flex gap-2 ${done ? "invisible" : ""}`}>
            <button type="button" className="rounded-full border border-current px-3 py-1" onClick={togglePause} aria-pressed={paused}>{paused ? "Resume" : "Pause"}</button>
            <button type="button" className="rounded-full border border-current px-3 py-1" onClick={skip}>Skip intro</button>
          </span>
        </div>
        {quote ? (
          <figure className="mt-10 sm:mt-14">
            <blockquote lang={quote.language} className={`serif text-[1.6rem] leading-[1.25] sm:text-[2.4rem] lg:text-[2.9rem] ${done ? "" : "typewriter-caret"}`} aria-hidden={!done}>
              {text.slice(0, typed)}
            </blockquote>
            <p className="sr-only">{text}</p>
            {quote.quote_en && quote.quote_en !== text && <p className={`mt-4 max-w-3xl text-sm transition-opacity duration-700 sm:text-base ${done ? "opacity-80" : "opacity-0"}`}>{quote.quote_en}</p>}
            <figcaption className={`mt-3 text-xs transition-opacity duration-700 ${done ? "opacity-80" : "opacity-0"}`}>
              {quote.speaker.name}, {quote.speaker.role} · {quote.date} · {quote.channel.replace(/_/g, " ")} · {quote.source.name} · {VERIFICATION[quote.source.verification] ?? quote.source.verification} · <span className="font-mono">{quote.id}</span>
            </figcaption>
          </figure>
        ) : (
          <p className="mt-10 serif text-2xl opacity-80">The opening sentence arrives with the next data release; the receipts below are already on record.</p>
        )}
        <ol className="mt-8 space-y-2" aria-live="polite" aria-label="Receipts">
          {receipts.map((r, i) => (
            <li key={r.label} className={`receipt flex flex-wrap items-baseline gap-x-3 gap-y-0.5 transition-opacity duration-700 ${done ? "" : "opacity-0"}`} style={{ transitionDelay: `${i * 900}ms` }}>
              <span className="w-full opacity-70 sm:w-auto sm:min-w-[22rem]">{r.label} · {r.window}</span>
              <span className={`text-base sm:text-lg ${r.outlined ? "receipt-outline" : "font-bold"}`}>{r.value}</span>
              <span className="text-[11px] opacity-60">{r.source}</span>
              {r.href && <Link href={r.href} className="text-[11px] underline opacity-80 pointer-coarse:-my-2.5 pointer-coarse:py-2.5">open</Link>}
            </li>
          ))}
        </ol>
        <p className={`mt-3 max-w-3xl text-[11px] leading-snug transition-opacity duration-700 ${done ? "opacity-60" : "opacity-0"}`} style={{ transitionDelay: `${n * 900}ms` }}>{n ? pairingNote : ""}</p>
        <div className="mt-4 h-px w-24 bg-cn" aria-hidden="true" />
        <div id="story-start" className="mt-10 scroll-mt-4 sm:mt-14">
          <h1 className="serif text-4xl font-bold leading-[1.05] sm:text-6xl">Said &amp; Paid</h1>
          <p className="mt-3 max-w-2xl text-base opacity-85 sm:text-lg">What leaders said, what the money did. Twelve countries, 2008–2026.</p>
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <Door href="#c1" title="Read the case" text="Nine chapters, one question each, about twelve minutes." primary />
            <Door href="/explore" title="Go straight to the evidence" text="The map: index lean, money arcs, trade arcs, every country." />
            <Door href="/country/ARG" title="Argentina's ledger" text="The country behind the sentence, every receipt attached." />
          </div>
          <p className="mt-5 text-xs opacity-70">Every number on this site opens to its source. Facts, model outputs and interpretations are kept apart and labelled.</p>
          <p className="mt-1 font-mono text-[11px] opacity-60">{release}</p>
        </div>
      </div>
    </section>
  );
}
