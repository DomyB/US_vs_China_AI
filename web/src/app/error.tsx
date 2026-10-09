"use client";

import Link from "next/link";

/** The error boundary of a page: says the page broke, shows the digest that names the error in the logs, offers a retry. */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <div className="card p-6">
        <p className="eyebrow">Error</p>
        <h1 className="mt-1 text-2xl sm:text-[1.75rem]">Something broke on this page</h1>
        <p className="mt-2 text-sm text-ink-2">The rest of the site still works. If it happens again, the identifier below names the error in the logs.</p>
        <p className="mt-2 font-mono text-xs text-ink-3">{error.digest ?? error.message}</p>
        <div className="mt-5 flex flex-wrap gap-2">
          <button type="button" onClick={reset} className="btn btn-md btn-primary">Try again</button>
          <Link href="/" className="btn btn-md">Back to the map</Link>
        </div>
      </div>
    </div>
  );
}
