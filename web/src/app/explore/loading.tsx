import { PanelSkeleton } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-6" aria-busy="true" aria-live="polite">
      <p className="sr-only">Loading…</p>
      <PanelSkeleton />
    </div>
  );
}
