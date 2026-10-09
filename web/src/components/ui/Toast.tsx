"use client";

/** A short confirmation at the bottom of the viewport; the caller decides when it shows and hides. */
export function Toast({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div role="status" className="toast card px-3 py-2 text-sm">
      {message}
    </div>
  );
}
