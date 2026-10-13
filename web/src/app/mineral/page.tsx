import { Suspense } from "react";
import { MineralsIndex } from "@/components/mineral/MineralsIndex";
import { InsightsSkeleton } from "@/components/ui/Skeleton";

const description = "One case file per tracked mineral: why it matters, who produces it, who buys it, where it is and what it costs, every number from the sourced record.";

export const metadata = { title: "Minerals · Strata", description, openGraph: { title: "Minerals · Strata", description, images: ["/og.png"] } };

export default function MineralsPage() {
  return (
    <Suspense fallback={<InsightsSkeleton />}>
      <MineralsIndex />
    </Suspense>
  );
}
