import { Suspense } from "react";
import { ContestedView } from "@/components/contested/ContestedView";
import { InsightsSkeleton } from "@/components/ui/Skeleton";
import { countWord } from "@/lib/constants";
import { MAIN_CLAIMS, MORE_CLAIMS } from "@/lib/contested";

const description = `${countWord(MAIN_CLAIMS.length, true)} claims that cut against the usual story of the US–China rivalry over Latin America's minerals, each tested on the site's own record: the usual story, the test, the findings and numbers computed from the data, a verdict by a stated rule, and what would overturn it; ${countWord(MORE_CLAIMS.length)} further claims on their own page.`;

export const metadata = { title: "Against the grain · Strata", description, openGraph: { title: "Against the grain · Strata", description, images: ["/og.png"] } };

export default function ContestedPage() {
  return (
    <Suspense fallback={<InsightsSkeleton />}>
      <ContestedView />
    </Suspense>
  );
}
