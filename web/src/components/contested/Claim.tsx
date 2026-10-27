"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { LayerLabel } from "@/components/ui/Badges";
import { Picture } from "@/components/ui/Picture";
import { Reading, type ReadingKind } from "@/components/ui/Reading";
import { COUNTRY_NAMES } from "@/lib/constants";
import { CLAIMS, claimNumber, VERDICT_LABEL, type Verdict } from "@/lib/contested";
import { fmtMusd } from "@/lib/format";
import type { Picture as Pic } from "@/lib/pictures";

export const name = (iso: string) => COUNTRY_NAMES[iso] ?? iso;
export const pp = (v: number) => `${v > 0 ? "+" : ""}${(v * 100).toFixed(1)} pts`;
export const ORI: Record<string, string> = { L: "left", C: "centre", R: "right" };

/** The picture beside each claim (an id in /data/pictures.json); an illustration of the subject, never evidence for the claim. */
export const CLAIM_PICTURES: Record<string, string> = { turns: "casa_rosada", lending: "cdb", capital: "wall_street", minerals: "battery", panel: "planalto", votes: "votes", talk: "white_house", hedge: "moneda", attention: "congress", pressure: "denial_lasbambas", route: "container_ship", three: "copper_mine", prices: "haul_truck", echoes: "long_beach", flips: "la_paz", warm: "buenos_aires", hongkong: "shanghai_port", fans: "ev" };

/**
 * One claim against the grain: the usual story, the test, the findings, the record, the verdict, what would overturn it.
 * The heading and the number come from CLAIMS, so every page that lists the claim prints the same wording and number.
 * `findings` are two or three descriptive bullets carrying the record's own numbers, in the record's layer; the "so what"
 * line is the interpretation.
 */
export function Claim({ id, verdict, matters, usual, test, findings, findingsKind = "facts", record, soWhat, overturn, links, pictures, children }: { id: string; verdict: Verdict; matters: ReactNode; usual: ReactNode; test: ReactNode; findings: ReactNode[]; findingsKind?: ReadingKind; pictures: Map<string, Pic> | null; record: { text: ReactNode; kind: "facts" | "model" }[]; soWhat: ReactNode; overturn: ReactNode; links: { href: string; label: string }[]; children?: ReactNode }) {
  const entry = CLAIMS.find((c) => c.id === id);
  const n = claimNumber(id);
  return (
    <section id={id} className="card mt-5 scroll-mt-14 px-4 py-4 sm:px-6 sm:py-5" aria-labelledby={`${id}-h`}>
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_14rem] sm:items-start">
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <div className="min-w-0">
            <p className="eyebrow">{String(n).padStart(2, "0")}</p>
            <h2 id={`${id}-h`} className="serif mt-0.5 text-xl font-bold leading-tight sm:text-2xl">{entry?.headline ?? id}</h2>
          </div>
          <span className={`verdict verdict-${verdict}`}>{VERDICT_LABEL[verdict]}</span>
        </div>
        {CLAIM_PICTURES[id] && <Picture id={CLAIM_PICTURES[id]} pictures={pictures} ratio="card" />}
      </div>
      <p className="claim-matters mt-2 max-w-3xl text-sm leading-relaxed text-ink-2"><span className="reading-label">Why it matters</span> {matters}</p>
      <Reading findings={findings} findingsKind={findingsKind} compact />
      <dl className="claim-grid mt-3">
        <dt>The usual story</dt>
        <dd>{usual}</dd>
        <dt>The test</dt>
        <dd>{test}</dd>
        <dt>The record</dt>
        <dd>
          <ul className="space-y-1">
            {record.map((r, i) => (
              <li key={i}>{r.text} <LayerLabel layer={r.kind} /></li>
            ))}
          </ul>
          {children}
        </dd>
        <dt>So what</dt>
        <dd>{soWhat} <LayerLabel layer="interpretation" /></dd>
        <dt>What would overturn it</dt>
        <dd>{overturn}</dd>
      </dl>
      <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {links.map((l) => (
          <Link key={l.href} href={l.href} className="underline decoration-dotted">{l.label} →</Link>
        ))}
      </p>
    </section>
  );
}

/** Tiny bars by year, for a series that must be read as a shape. */
export function Bars({ rows, max, color }: { rows: { year: number; v: number }[]; max: number; color: string }) {
  const w = 10, gap = 3, h = 44;
  return (
    <svg width={rows.length * (w + gap)} height={h + 14} role="img" aria-label="Bars by year" className="mt-2 block max-w-full">
      {rows.map((r, i) => {
        const bh = max > 0 ? Math.max(1, (r.v / max) * h) : 1;
        return <rect key={r.year} x={i * (w + gap)} y={h - bh} width={w} height={bh} fill={color} rx={1}><title>{`${r.year}: ${fmtMusd(r.v)}`}</title></rect>;
      })}
      {rows.filter((r) => r.year % 5 === 0).map((r) => (
        <text key={`t${r.year}`} x={rows.indexOf(r) * (w + gap)} y={h + 11} fontSize="9" fill="var(--ink-3)">{r.year}</text>
      ))}
    </svg>
  );
}

/** The rules every verdict follows, printed at the foot of both pages of claims. */
export function VerdictRules() {
  return (
    <p className="mt-8 text-xs text-ink-3">Verdict rules: &ldquo;holds&rdquo; when the computed numbers meet the rule stated in the test and its code (web/src/components/contested/useContested.ts), &ldquo;in part&rdquo; when they meet it in one direction only, &ldquo;fails&rdquo; when they contradict it, &ldquo;cannot be settled&rdquo; when the record lacks the rows or the claim is a bound. The claims, the findings&apos; wording and the &ldquo;so what&rdquo; lines are the team&apos;s, AI-drafted and unreviewed until the owner signs them; the numbers in the findings are the record&apos;s own and carry its label.</p>
  );
}
