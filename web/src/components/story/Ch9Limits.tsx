"use client";

import Link from "next/link";
import { DataTable } from "@/components/charts/PlotFigure";
import { COUNTRY_NAMES } from "@/lib/constants";
import type { coverageWall } from "@/lib/story";
import type { EvidenceLevel } from "@/lib/types";
import { Door, Exhibit, Meter, StepCard } from "./Chapter";

type Wall = ReturnType<typeof coverageWall>;

export interface Limit { text: string; ids: string[] }

export function Ch9Limits({ wall, chapters, limits, changes }: { wall: Wall; chapters: { n: number; label: string; level: EvidenceLevel; basis: string }[]; limits: Limit[]; changes: string[] }) {
  // The same cells as rows of text, so the reason behind every hatched cell is readable without a mouse.
  const tableRows: Record<string, string>[] = wall.rows.map((r) => ({ country: COUNTRY_NAMES[r.iso3] ?? r.iso3, ...Object.fromEntries(wall.cols.map((c) => [c, `${r.cells[c].ok ? "held" : "missing"}: ${r.cells[c].note}`])) }));
  const tableCols: { key: string; label: string }[] = [{ key: "country", label: "Country" }, ...wall.cols.map((c) => ({ key: c, label: c }))];
  return (
    <div className="space-y-6">
      <Exhibit title="The coverage wall: what each country's record holds" layer="facts" sources={["un_comtrade", "aiddata_gcdf", "dfc_projects", "exim_authorizations", "manual_statements"]} ids={["meta:coverage"]} note="A filled cell is a record the site holds; a hatched cell is a record it does not, with the reason on hover, read out by a screen reader, and listed in the table beneath. The largest hole on every money chart is Chinese finance after 2021: the source ends there, so those years are blank, not zero.">
        <p className="mb-1 text-[11px] text-ink-3 sm:hidden">The wall is wider than the screen: scroll it sideways for the other columns.</p>
        <div className="scroll-x">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wide text-ink-3">
                <th className="py-1 pr-2">Country</th>
                {wall.cols.map((c) => <th key={c} className="px-1 py-1 text-center">{c}</th>)}
              </tr>
            </thead>
            <tbody>
              {wall.rows.map((r) => (
                <tr key={r.iso3} className="border-t border-rule">
                  <th scope="row" className="py-1 pr-2 text-left font-semibold">{COUNTRY_NAMES[r.iso3] ?? r.iso3}</th>
                  {wall.cols.map((c) => {
                    const cell = r.cells[c];
                    return (
                      <td key={c} className="px-1 py-1 text-center">
                        <span className={`inline-block h-4 w-8 rounded-sm border ${cell.ok ? "border-facts bg-facts/70" : "border-ink-3 bg-[repeating-linear-gradient(45deg,transparent_0_3px,var(--ink-3)_3px_4px)] opacity-60"}`} title={cell.note}>
                          <span className="sr-only">{c}: {cell.ok ? "held" : "missing"}, {cell.note}</span>
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <DataTable rows={tableRows} columns={tableCols} caption="The coverage wall as text: for each country and record, whether the site holds it and the reason when it does not" />
      </Exhibit>
      <Exhibit title="How strong is each chapter" layer="interp" sources={[]} ids={chapters.map((c) => `chapter:${c.n}`)}>
        <ol className="grid gap-2 sm:grid-cols-3">
          {chapters.map((c) => (
            <li key={c.n}>
              <a href={`#c${c.n}`} className="flex items-start gap-2 rounded-md border border-rule p-2 text-xs no-underline hover:bg-surface-2">
                <span className="mt-0.5"><Meter level={c.level} /></span>
                <span><strong>{c.n}. {c.label}</strong> · {c.level}<br /><span className="text-ink-3">{c.basis}</span></span>
              </a>
            </li>
          ))}
        </ol>
      </Exhibit>
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
          <Door href="/explore" title="The map" text="Index lean, money arcs and trade arcs, every year since 2008." primary />
          <Door href="/country" title="The case files" text="Twelve countries, five tabs each, every receipt attached." />
          <Door href="/lab" title="The Lab" text="Your own scenario to 2030, labelled as yours." />
        </div>
      </div>
    </div>
  );
}
