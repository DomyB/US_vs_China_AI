import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { Suspense } from "react";
import { ArchiveHub, type ArchiveDownload } from "@/components/archive/ArchiveHub";
import { InsightsSkeleton } from "@/components/ui/Skeleton";

export const metadata = { title: "Archive · Strata", description: "Statements, methods, sources, case files and the flag registry: every record the site reads, kept whole.", openGraph: { title: "Archive · Strata", description: "Statements, methods, sources, case files and the flag registry: every record the site reads, kept whole.", images: ["/og.png"] } };

/**
 * The exports no page draws but the pipeline publishes for download (DECISIONS: the counts live in insights.json and
 * meta.json; the records themselves are here). Size and row count are read from the files when the page is built, so
 * nothing here is typed; a file absent from the checkout is listed as not in this release.
 */
const DOWNLOADS: { file: string; key: string; description: string }[] = [
  { file: "policy.json", key: "documents", description: "US policy documents selected by title: Congress.gov bills and Federal Register notices and rules, each with title, agency, date, topics and the source URL. The documents the Attention block and chapter 1 count by year." },
  { file: "companion/prototype/trade.json", key: "rows", description: "The team's trade panel from the Strata prototype (draft v0.2): exporter × year × mineral × stage × basket × partner group, US$ million FOB, CEPII BACI HS96 v202601 for 2001–2024 and UN Comtrade monthly data for 2025–2026 (team R scripts 01–04); companion/prototype/records.json holds its events, quotes, ladder, pressure cases, coded terms, alignment markers and five acts. The prototype itself is served at /prototype as supplied." },
  { file: "companion/denial/data.json", key: "claims", description: "The companion project \"Denial without Substitution\" as supplied (DECISIONS 94): 31 studies, 951 claims with page citations, 1,076 dated events with sources, 29 findings, 17 mechanisms, 12 disagreements, 20 country verdicts, 34 projects, gaps and the audit; its governments, UN ideal points, mirror trade and survey are in companion/denial/r4.json, its 2026 records and pictures in r3.json, its correlations in synth.json." },
  { file: "routes.json", key: "origins", description: "Where the ore goes, from the reconciled bilateral trade (CEPII BACI): the two buyers' imports by origin, the region's exports by destination, each country's largest destinations and the intermediaries' two legs (imports from the region, exports to each buyer). The rows behind the routes page; the indirect bound is computed in the browser as the smaller leg." },
  { file: "prices.json", key: "series", description: "World price rows per mineral: the World Bank Pink Sheet monthly series and USGS Mineral Commodity Summaries annual averages, each with unit, date and the source URL. The series behind chapter 2's price strip and the Lab's price lever, there as annual averages." },
];

function describe(d: (typeof DOWNLOADS)[number]): ArchiveDownload {
  // the pipeline's exports live under /data/real; an owner-supplied companion file is served from /data as supplied
  const base = d.file.startsWith("companion/") ? "public/data" : "public/data/real";
  const href = d.file.startsWith("companion/") ? `/data/${d.file}` : `/data/real/${d.file}`;
  try {
    const p = path.join(process.cwd(), base, d.file);
    if (!existsSync(p)) return { file: d.file, href, bytes: null, rows: null, description: d.description };
    const bytes = statSync(p).size;
    const parsed = JSON.parse(readFileSync(p, "utf8")) as Record<string, unknown>;
    const rows = Array.isArray(parsed[d.key]) ? (parsed[d.key] as unknown[]).length : null;
    return { file: d.file, href, bytes, rows, description: d.description };
  } catch {
    return { file: d.file, href, bytes: null, rows: null, description: d.description };
  }
}

export default function ArchivePage() {
  return (
    <Suspense fallback={<InsightsSkeleton />}>
      <ArchiveHub downloads={DOWNLOADS.map(describe)} />
    </Suspense>
  );
}
