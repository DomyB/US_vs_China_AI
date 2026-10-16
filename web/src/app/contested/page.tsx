import { Suspense } from "react";
import { ContestedView } from "@/components/contested/ContestedView";
import { InsightsSkeleton } from "@/components/ui/Skeleton";

const description = "Eighteen claims that cut against the usual story of the US–China rivalry over Latin America's minerals, each tested on the site's own record: the usual story, the test, the numbers computed from the data, a verdict by a stated rule, and what would overturn it.";

export const metadata = { title: "Against the grain · Strata", description, openGraph: { title: "Against the grain · Strata", description, images: ["/og.png"] } };

export default function ContestedPage() {
  return (
    <Suspense fallback={<InsightsSkeleton />}>
      <ContestedView />
    </Suspense>
  );
}
