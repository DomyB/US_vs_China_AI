"use client";

import Link from "next/link";
import { LayerLabel } from "@/components/ui/Badges";
import { HeaderPicture } from "@/components/ui/Picture";
import { COUNTRY_COUNT, YEAR_MAX, YEAR_MIN } from "@/lib/constants";
import { COMPANION_PROJECTS, COURSE, COVER_VERSION, RESEARCH_QUESTION, SITE_NAME, SITE_TAGLINE, TEAM } from "@/lib/team";

/** Eight ways into the evidence by question, each a link to the exhibit or page that answers it. */
const QUESTIONS = [
  { k: "H1", q: "Which announced projects were actually built?", href: "/stage#s-ladder" },
  { k: "$", q: "Who wrote the cheques: China or the US?", href: "/story#c4" },
  { k: "Li", q: "Where does the lithium triangle's lithium go?", href: "/mineral/lithium" },
  { k: "Ore", q: "Who buys the ore, and who buys the metal?", href: "/stage#s-trade" },
  { k: "Via", q: "How much reaches the US through Canada?", href: "/routes" },
  { k: "MX", q: "Why is Mexico the counter-case?", href: "/country/MEX" },
  { k: "Text", q: "Who talks about the rivalry, and who doesn't?", href: "/country/CHL?tab=politics" },
  { k: "Why", q: "Why does China keep its ground while Washington talks louder?", href: "/denial" },
];

/**
 * The cover: the project's name, question and course, the team, how claims are labelled and where the data comes from,
 * then a question to start from. Everything typed here is the owner's identity for the project; a name not yet given
 * prints as such.
 */
export function Cover({ release, sourcesLine }: { release: string; sourcesLine: string | null }) {
  return (
    <section id="cover" className="ink-stage" aria-labelledby="cover-title">
      <div className="mx-auto max-w-5xl px-4 py-14 sm:px-6 sm:py-20">
        <p className="eyebrow">{COURSE.name} · {COURSE.school} · {COURSE.year}</p>
        <h1 id="cover-title" className="serif mt-4 text-6xl font-bold leading-none tracking-tight sm:text-8xl">{SITE_NAME}</h1>
        <p className="serif mt-4 max-w-3xl text-2xl leading-snug sm:text-3xl">{SITE_TAGLINE}.</p>
        <p className="mt-4 max-w-3xl text-base opacity-85 sm:text-lg">A research platform on the competition between China and the United States for the critical minerals of {COUNTRY_COUNT} Latin American countries, {YEAR_MIN}–{YEAR_MAX}: what the record shows, by country, mineral and year, with every number linked to its source.</p>
        <p className="mt-3 max-w-3xl text-sm opacity-85"><strong>Research question.</strong> {RESEARCH_QUESTION} Three actors, not two: the region&apos;s governments set the rules, choose partners and bargain over terms. The team&apos;s own framing of the question, its five acts and its hypothesis cards are on the <Link href="/stage" className="underline">Two powers, one stage</Link> page.</p>
        <HeaderPicture id="lithium_field" ratio="header" className="chapter-picture mt-6 max-w-3xl" caption="The Salar de Atacama, where the record begins: brine, lithium and two buyers" />
        <div className="mt-8 grid gap-6 sm:grid-cols-[1fr_1fr]">
          <div>
            <p className="eyebrow">Team</p>
            <ol className="mt-2 space-y-1 text-sm">
              {TEAM.map((r, i) => (
                <li key={i} className="flex items-baseline gap-2">
                  <span className="font-mono text-[11px] opacity-60">{String(i + 1).padStart(2, "0")}</span>
                  <span className={r.name ? "" : "opacity-60"}>{r.name ?? "name to be added"}{r.contribution ? <span className="opacity-70"> · {r.contribution}</span> : null}</span>
                </li>
              ))}
            </ol>
          </div>
          <div className="space-y-3 text-sm">
            <div>
              <p className="eyebrow">How claims are labelled</p>
              <p className="mt-1 opacity-85">Every block says whether it states a fact, a model output or an interpretation; the three layers are kept apart and never added together.</p>
              <div className="mt-2 flex flex-wrap gap-1.5"><LayerLabel layer="facts" /><LayerLabel layer="model" /><LayerLabel layer="interpretation" /></div>
            </div>
            <div>
              <p className="eyebrow">Data</p>
              <p className="mt-1 opacity-85">{sourcesLine ?? "Sourced trade, finance, debt, UN votes, legislative and press records; the registry on the sources page names each with its reliability."} Trade figures are own calculations on UN Comtrade and, from the release of 13 October 2026, on CEPII BACI (reconciled, 2001–2024). {COMPANION_PROJECTS.map((p, i) => `${i === 0 ? p.what[0].toUpperCase() + p.what.slice(1) : p.what} come from ${p.name ?? "a companion project, to be named"}`).join("; ")}, credited where used.</p>
            </div>
          </div>
        </div>
        <div className="mt-8">
          <p className="eyebrow">Start with a question</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {QUESTIONS.map((q) => (
              <Link key={q.q} href={q.href} className="inline-flex items-center gap-2 rounded-full border border-current/30 px-3 py-1.5 text-sm no-underline opacity-90 hover:border-current hover:opacity-100"><span className="font-mono text-[10px] opacity-60">{q.k}</span>{q.q}</Link>
            ))}
          </div>
        </div>
        <p className="mt-8 font-mono text-[11px] opacity-60">{COVER_VERSION.label} · {COVER_VERSION.date}{release ? ` · ${release}` : ""}</p>
      </div>
    </section>
  );
}
