import { Suspense } from "react";
import { MapPage } from "@/components/home/MapPage";
import { sourceNameMap } from "@/lib/sources";

export default function HomePage() {
  const names = sourceNameMap();
  return (
    <Suspense fallback={<div className="p-6 text-sm text-ink-3">Loading…</div>}>
      <MapPage sourceNames={names} />
    </Suspense>
  );
}
