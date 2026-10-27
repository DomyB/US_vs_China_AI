"use client";

import { useEffect, useState } from "react";
import { RoutesView } from "@/components/routes/RoutesView";
import { COUNTRY_COUNT_WORD } from "@/lib/constants";
import { loadRoutes } from "@/lib/data";
import { fmtMusd, fmtPct } from "@/lib/format";
import { economyName, indirectFor, latestRouteYear, type RoutesFile } from "@/lib/routes";
import { Exhibit } from "../Chapter";

/**
 * Where the United States gets it (chapter 0's routes exhibit, in the appendix): the embedded routes view, with the
 * buyer and year chosen in the exhibit. The findings are read for the view it opens on (the United States, all tracked
 * minerals, the latest reconciled year) from the same routes.json the view reads: lib/data.ts requests a file once per
 * page load, so this is a second read of one promise, not a second download.
 */
export function RoutesExhibit() {
  const [file, setFile] = useState<RoutesFile | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    loadRoutes()
      .then((f) => {
        if (alive) setFile(f);
      })
      .catch(() => {
        if (alive) setFile(null);
      });
    return () => {
      alive = false;
    };
  }, []);
  const latest = file ? latestRouteYear(file, "USA", "all") : null;
  const indirect = file && latest !== null ? indirectFor(file, "USA", "all", latest) : null;
  const directShare = indirect && indirect.direct !== null && indirect.world ? indirect.direct / indirect.world : null;
  const boundShare = indirect && indirect.world ? indirect.bound_total / indirect.world : null;
  const topLeg = indirect?.legs.find((l) => l.bound !== null) ?? null;
  const findings = indirect
    ? [
        indirect.world !== null ? `The United States imported ${fmtMusd(indirect.world)} of the tracked minerals in ${indirect.year}, the latest reconciled year.` : null,
        directShare !== null ? `${fmtPct(directShare, 0)} of it came straight from the ${COUNTRY_COUNT_WORD} countries.` : `No origin row for the ${COUNTRY_COUNT_WORD} countries in ${indirect.year}: the direct share is absent, not zero.`,
        boundShare !== null ? `At most ${fmtPct(boundShare, 0)} could have come through an intermediary${topLeg ? `; the largest ceiling is ${economyName(topLeg.iso3)}'s, ${fmtMusd(topLeg.bound ?? 0)}` : ""}.` : null,
      ]
    : undefined;
  return (
    <Exhibit
      id="c0-routes"
      title="Where the United States gets it, and what passes through Canada"
      layer="facts"
      asks="If the region reports selling its ore mostly to China, where does the United States get what it buys, and could part of it arrive through a third country? The reconciled bilateral record, read from the buyer's side, answers the first and can only bound the second."
      how="Choose the buyer and the year. The first bars are that buyer's imports by origin, the region in green and the intermediaries in gold; the table gives each intermediary's two legs, what it took from the region and what it sold on, with the smaller as the ceiling; the last bars are the region's exports by destination."
      findings={findings}
      findingsKind="facts"
      says="Read the three figures at the top first: what the buyer imported, the share that came straight from the region, and the most that could have come through an intermediary. The ceiling is not a trace of any shipment, and a cell that reads no row is absent, not zero."
      saysKind="facts"
      sources={["cepii_baci"]}
      ids={["trade_flow:USA:M:all"]}
      explore={{ href: "/routes", label: "Open the routes page" }}
      note={`The story's trade exhibit is what the ${COUNTRY_COUNT_WORD} countries report selling to each buyer. This one turns it round, from the reconciled bilateral record (CEPII BACI): what the United States imports of the tracked minerals by origin, and the ceiling on what could have come from the region through an intermediary such as Canada, bounded by the smaller of the two legs. It is a ceiling, not a trace: processing changes the product code and no record follows a shipment.${file === null ? " The reconciled record is not in this release, so the findings are absent." : ""}`}
    >
      <RoutesView embedded />
    </Exhibit>
  );
}
