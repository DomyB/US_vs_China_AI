"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { STORY_RESTART_EVENT } from "./Chapter";
import { reducedMotion } from "@/lib/motion";
import { COUNTRY_COUNT_WORD, YEAR_MAX, YEAR_MIN } from "@/lib/constants";
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

/** An amount, a year range or a share never breaks across lines on a narrow screen; a value still wraps between its phrases. */
const ATOM = /(US\$[\d.,]+(?: (?:k|m|bn|tn))?|\d{4}–\d{4}|\d+(?:\.\d+)?%)/g;
function unbreakable(value: string) {
  return value.split(ATOM).map((part, i) => (i % 2 ? <span key={i} className="whitespace-nowrap">{part}</span> : part));
}

/**
 * The opening: a politician's sentence sets letter by letter on the ink stage, then the receipts print under it one by one,
 * then the title card and the three doors. Skip and Pause are visible from the first frame and go once the sentence is
 * complete; under reduced motion everything renders at once; the full quote stays in the DOM for assistive technology.
 */
export function ColdOpen({ quote, absence, receipts, release, pairingNote }: { quote: StatementRecord | null; /** printed in the quote's place when the record is not in the release: names the missing file */ absence: string; receipts: Receipt[]; release: string; pairingNote: string }) {
  const text = quote?.quote_original ?? quote?.quote_en ?? "";
  const [typed, setTyped] = useState(0);
  const [paused, setPaused] = useState(false);
  const [done, setDone] = useState(false);
  // the tick reads the pause flag from a ref so a toggle reaches the running interval without restarting it
  const pausedRef = useRef(false);
  const timer = useRef(0);
  const [run, setRun] = useState(0); // bumped by "Replay the opening", so the sequence can be watched again
  useEffect(() => {
    window.clearInterval(timer.current);
    pausedRef.current = false;
    setPaused(false);
    if (reducedMotion() || !text) {
      setTyped(text.length);
      setDone(true);
      return;
    }
    let i = 0;
    setTyped(0);
    setDone(false);
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
  }, [text, run]);
  const replay = () => {
    setRun((r) => r + 1);
    window.scrollTo({ top: 0, behavior: reducedMotion() ? "auto" : "smooth" });
  };
  // "Start the story over" (chapter 9) replays the opening and resets every guess through one window event
  useEffect(() => {
    window.addEventListener(STORY_RESTART_EVENT, replay);
    return () => window.removeEventListener(STORY_RESTART_EVENT, replay);
  }, []);
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
          {/* the row keeps its height once the sentence is complete (the quote must not jump up): it then offers a replay, except under reduced motion where nothing animates */}
          <span className="flex gap-2">
            {done ? (
              <button type="button" className={`rounded-full border border-current px-3 py-1 pointer-coarse:py-2 ${reducedMotion() || !text ? "invisible" : ""}`} onClick={replay}>Replay the opening</button>
            ) : (
              <>
                <button type="button" className="rounded-full border border-current px-3 py-1 pointer-coarse:py-2" onClick={togglePause} aria-pressed={paused}>{paused ? "Resume" : "Pause"}</button>
                <button type="button" className="rounded-full border border-current px-3 py-1 pointer-coarse:py-2" onClick={skip}>Skip intro</button>
              </>
            )}
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
          <p className="mt-10 serif text-2xl opacity-80">{absence}</p>
        )}
        {/* inert until the sentence is complete: the receipts are invisible until then and must not take keyboard focus */}
        <ol className="mt-8 space-y-2" aria-live="polite" aria-label="Receipts" inert={!done || undefined}>
          {receipts.map((r, i) => (
            <li key={r.label} className={`receipt flex flex-wrap items-baseline gap-x-3 gap-y-0.5 transition-opacity duration-700 ${done ? "" : "opacity-0"}`} style={{ transitionDelay: `${i * 900}ms` }}>
              <span className="w-full opacity-70 sm:w-auto sm:min-w-[22rem]">{r.label} · {r.window}</span>
              <span className={`text-base sm:text-lg ${r.outlined ? "receipt-outline" : "font-bold"}`}>{unbreakable(r.value)}</span>
              {/* the link follows the source with no break opportunity, so "open" never sits alone on a line */}
              <span className="text-[11px]"><span className="opacity-60">{r.source}</span>{r.href && <Link href={r.href} className="ml-2 underline opacity-80 pointer-coarse:-my-2.5 pointer-coarse:py-2.5">open</Link>}</span>
            </li>
          ))}
        </ol>
        <p className={`mt-3 max-w-3xl text-[11px] leading-snug transition-opacity duration-700 ${done ? "opacity-60" : "opacity-0"}`} style={{ transitionDelay: `${n * 900}ms` }}>{n ? pairingNote : ""}</p>
        <div className="mt-4 h-px w-24 bg-cn" aria-hidden="true" />
        <div id="story-start" className="mt-10 scroll-mt-4 sm:mt-14">
          <h1 className="serif text-4xl font-bold leading-[1.05] sm:text-6xl">Said &amp; Paid</h1>
          <p className="mt-3 max-w-2xl text-base opacity-85 sm:text-lg">What leaders said, what the money did. {COUNTRY_COUNT_WORD[0].toUpperCase()}{COUNTRY_COUNT_WORD.slice(1)} countries, {YEAR_MIN}–{YEAR_MAX}.</p>
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <Door href="#c1" title="Read the case" text="Ten chapters and a conclusion, one question each, about twelve minutes." primary />
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
