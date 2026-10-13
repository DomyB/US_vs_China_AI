import { Suspense } from "react";
import { RoutesView } from "@/components/routes/RoutesView";
import { InsightsSkeleton } from "@/components/ui/Skeleton";

const description = "Where the United States and China get the region's minerals: imports by origin, the countries' exports by destination, and the ceiling on what could have passed through an intermediary such as Canada, from reconciled bilateral trade.";

export const metadata = { title: "Where the ore goes · Strata", description, openGraph: { title: "Where the ore goes · Strata", description, images: ["/og.png"] } };

export default function RoutesPage() {
  return (
    <Suspense fallback={<InsightsSkeleton />}>
      <RoutesView />
    </Suspense>
  );
}
