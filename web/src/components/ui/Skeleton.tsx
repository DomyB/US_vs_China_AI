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
