"use client";

import { DataTable } from "@/components/charts/PlotFigure";
import { COUNTRY_NAMES } from "@/lib/constants";
import type { coverageWall } from "@/lib/story";
import { Exhibit } from "../Chapter";

type Wall = ReturnType<typeof coverageWall>;

/**
 * The coverage wall (chapter 9's first exhibit, in the appendix): one cell per country and record, held or missing, from
 * meta.json's coverage block and the finance rows. `lastYearCN` is flows.meta.last_year.finance_CN, where the Chinese
 * finance source ends.
 */
export function CoverageWall({ wall, lastYearCN }: { wall: Wall; lastYearCN: number | null }) {
  const cells = wall.rows.length * wall.cols.length;
  const held = wall.rows.reduce((s, r) => s + wall.cols.filter((c) => r.cells[c].ok).length, 0);
  const missing = cells - held;
  // the column with the most holes, and the three record columns the money chapters rest on
  const holesBy = wall.cols.map((c) => ({ col: c, n: wall.rows.filter((r) => !r.cells[c].ok).length })).sort((a, b) => b.n - a.n);
  const worst = holesBy[0] ?? null;
  const countHeld = (c: Wall["cols"][number]) => wall.rows.filter((r) => r.cells[c].ok).length;
  const tradeHeld = countHeld("trade"), cnHeld = countHeld("finance CN"), usHeld = countHeld("finance US");
  // The same cells as rows of text, so the reason behind every hatched cell is readable without a mouse.
  const tableRows: Record<string, string>[] = wall.rows.map((r) => ({ country: COUNTRY_NAMES[r.iso3] ?? r.iso3, ...Object.fromEntries(wall.cols.map((c) => [c, `${r.cells[c].ok ? "held" : "missing"}: ${r.cells[c].note}`])) }));
  const tableCols: { key: string; label: string }[] = [{ key: "country", label: "Country" }, ...wall.cols.map((c) => ({ key: c, label: c }))];
  return (
    <Exhibit
      id="c9-wall"
      title="The coverage wall: what each country's record holds"
      layer="facts"
      sources={["un_comtrade", "aiddata_gcdf", "dfc_projects", "exim_authorizations", "manual_statements"]}
      ids={["meta:coverage"]}
      asks="What can this record see, and what can it not? A grid of country by record shows the holes before the charts built on them are read; it is a chart of the data, not of the region."
      how="One row per country, one column per record; a filled cell is a record the site holds and a hatched cell one it does not, the reason on hover, read out by a screen reader, and listed in the text table beneath. A hatched cell is missing, never a zero."
      findings={[
        `${held} of the ${cells} cells are held across ${wall.rows.length} countries; ${missing} are missing.`,
        worst && worst.n > 0 ? `The most holes are in the ${worst.col} column: ${worst.n} of ${wall.rows.length} countries.` : null,
        `${tradeHeld} countries hold reported trade, ${cnHeld} a Chinese finance record and ${usHeld} a US one.`,
      ]}
      findingsKind="facts"
      says="The holes gather in the columns for words and legislatures rather than in trade, and every money column ends at its source's last year. A chapter that rests on a hatched cell is a weaker chapter, which the meters beneath say."
      note={`The largest hole on every money chart is Chinese finance after ${lastYearCN ?? "the source's last year"}: the source ends there, so those years are blank, not zero.`}
    >
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
  );
}
