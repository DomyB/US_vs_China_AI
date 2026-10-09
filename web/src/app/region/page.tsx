import { Suspense } from "react";
import { RegionView } from "@/components/region/RegionView";
import { RegionSkeleton } from "@/components/ui/Skeleton";

export const metadata = { title: "Regional overview · US–China Critical Minerals Tracker" };

export default function RegionPage() {
  return (
    <Suspense fallback={<RegionSkeleton />}>
      <RegionView />
    </Suspense>
  );
}
