import { COUNTRY_COUNT_WORD } from "@/lib/constants";
import { Suspense } from "react";
import { CaseFilesIndex } from "@/components/archive/CaseFilesIndex";
import { InsightsSkeleton } from "@/components/ui/Skeleton";

export const metadata = { title: "Case files · Strata", description: `The ${COUNTRY_COUNT_WORD} country files: actions, words, press, analysis and forecast, each number with its source.`, openGraph: { title: "Case files · Strata", description: `The ${COUNTRY_COUNT_WORD} country files: actions, words, press, analysis and forecast, each number with its source.`, images: ["/og.png"] } };

export default function CaseFilesPage() {
  return (
    <Suspense fallback={<InsightsSkeleton />}>
      <CaseFilesIndex />
    </Suspense>
  );
}
