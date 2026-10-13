import { InsightsSkeleton } from "@/components/ui/Skeleton";

/** Shown by the router while the page's code loads; the page shows the same shape while its data loads. */
export default function Loading() {
  return <InsightsSkeleton />;
}
