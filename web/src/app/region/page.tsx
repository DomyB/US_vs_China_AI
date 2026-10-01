import { Suspense } from "react";
import { RegionView } from "@/components/region/RegionView";

export const metadata = { title: "Regional overview · US–China Critical Minerals Tracker" };

export default function RegionPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-ink-3">Loading…</div>}>
      <RegionView />
    </Suspense>
  );
}
