import { Suspense } from "react";
import { MapPage } from "@/components/home/MapPage";
import { sourceNameMap } from "@/lib/sources";

export const metadata = { title: "The evidence room · US–China Critical Minerals Tracker", description: "The map: every country coloured by the influence index, money arcs and trade arcs to Washington and Beijing, and a drawer with the country's five tabs." };

export default function ExplorePage() {
  const names = sourceNameMap();
  return (
    <Suspense fallback={<div className="p-6 text-sm text-ink-3">Loading…</div>}>
      <MapPage sourceNames={names} />
    </Suspense>
  );
}
