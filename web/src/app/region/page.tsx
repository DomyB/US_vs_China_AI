import { Suspense } from "react";
import { RegionView } from "@/components/region/RegionView";
import { RegionSkeleton } from "@/components/ui/Skeleton";

export const metadata = { title: "Regional overview · US–China Critical Minerals Tracker", description: "The twelve countries ranked by the influence index, the mineral shares and the regional synthesis.", openGraph: { title: "Regional overview · US–China Critical Minerals Tracker", description: "The twelve countries ranked by the influence index, the mineral shares and the regional synthesis.", images: ["/og.png"] } };

export default function RegionPage() {
  return (
    <Suspense fallback={<RegionSkeleton />}>
      <RegionView />
    </Suspense>
  );
}
