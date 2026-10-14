import { Suspense } from "react";
import { OverviewPage } from "@/components/overview/OverviewPage";
import { Skeleton } from "@/components/ui/Skeleton";
import { COUNTRY_COUNT, YEAR_MIN, YEAR_MAX } from "@/lib/constants";

const DESCRIPTION = `How China and the United States compete for the critical minerals of ${COUNTRY_COUNT} Latin American countries, ${YEAR_MIN}–${YEAR_MAX}, and how the region responds: the map, four numbers, five ideas and the ways into the evidence.`;

export const metadata = { title: "Strata · China, the United States and Latin America's critical minerals", description: DESCRIPTION, openGraph: { title: "Strata", description: DESCRIPTION, images: ["/og.png"] } };

export default function HomePage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-[1240px] px-4 py-8 sm:px-5"><Skeleton className="h-64 w-full" /></div>}>
      <OverviewPage />
    </Suspense>
  );
}
