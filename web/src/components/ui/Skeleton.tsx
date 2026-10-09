/** Placeholder shapes shown while a file loads; they shimmer unless motion is reduced. */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden="true" />;
}

export function PanelSkeleton() {
  return (
    <div className="space-y-3 py-1" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>
      <div className="grid grid-cols-3 gap-2">
        <Skeleton className="h-14" />
        <Skeleton className="h-14" />
        <Skeleton className="h-14" />
      </div>
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="h-40" />
      <Skeleton className="h-4 w-1/2" />
      <Skeleton className="h-24" />
    </div>
  );
}

/** The region page's shape while its files load: title, lead, the ranking beside the focus chart, the small multiples. */
export function RegionSkeleton() {
  return (
    <div className="mx-auto max-w-7xl space-y-4 px-4 py-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading the region…</span>
      <Skeleton className="h-8 w-64 max-w-full" />
      <Skeleton className="h-4 w-2/3 max-w-xl" />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <Skeleton className="h-72" />
        <Skeleton className="h-72" />
      </div>
      <Skeleton className="h-80" />
    </div>
  );
}

/** The Insights page's shape: the title, the chip row, the 2030 board, two blocks. */
export function InsightsSkeleton() {
  return (
    <div className="mx-auto max-w-7xl space-y-4 px-4 py-8" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading the insights…</span>
      <Skeleton className="h-10 w-3/4 max-w-2xl" />
      <Skeleton className="h-4 w-1/2 max-w-lg" />
      <div className="flex gap-2">
        <Skeleton className="h-6 w-24" />
        <Skeleton className="h-6 w-28" />
        <Skeleton className="h-6 w-20" />
      </div>
      <Skeleton className="h-72" />
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-64" />
        <Skeleton className="h-64" />
      </div>
    </div>
  );
}

/** A country page's shape: the name, the controls card, the tab strip, then the panel's own skeleton. */
export function CountrySkeleton() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading the country…</span>
      <Skeleton className="mb-3 h-8 w-48" />
      <Skeleton className="mb-3 h-16" />
      <div className="mb-3 flex gap-2">
        {["actions", "politics", "media", "analysis", "forecast"].map((t) => (
          <Skeleton key={t} className="h-9 w-20" />
        ))}
      </div>
      <PanelSkeleton />
    </div>
  );
}
