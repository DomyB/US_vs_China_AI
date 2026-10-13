import { COUNTRY_COUNT_WORD } from "@/lib/constants";
import { Suspense } from "react";
import { RegionView } from "@/components/region/RegionView";
import { RegionSkeleton } from "@/components/ui/Skeleton";

export const metadata = { title: "Regional overview · Strata", description: `The ${COUNTRY_COUNT_WORD} countries ranked by the influence index, the mineral shares and the regional synthesis.`, openGraph: { title: "Regional overview · Strata", description: `The ${COUNTRY_COUNT_WORD} countries ranked by the influence index, the mineral shares and the regional synthesis.`, images: ["/og.png"] } };

export default function RegionPage() {
  return (
    <Suspense fallback={<RegionSkeleton />}>
      <RegionView />
    </Suspense>
  );
}
