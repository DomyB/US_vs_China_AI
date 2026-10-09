import { Suspense } from "react";
import { InsightsView } from "@/components/insights/InsightsView";

export const metadata = { title: "Insights and scenarios · US–China Critical Minerals Tracker", description: "What governments say against what the money and the minerals do, and scenarios to 2030 driven by the reader's own choices." };

export default function InsightsPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-ink-3">Loading…</div>}>
      <InsightsView />
    </Suspense>
  );
}
