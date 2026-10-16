/**
 * Update the page's query string in place. The browser's own replaceState integrates with the Next.js router (usePathname
 * and useSearchParams follow it) without a server round trip, so a year or filter change never re-renders the route,
 * never shows its loading state and never moves the scroll position; `router.replace` did all three on the data pages.
 */
export function replaceSearch(next: URLSearchParams | Record<string, string | null>, pathname?: string) {
  if (typeof window === "undefined") return;
  const params = next instanceof URLSearchParams ? next : new URLSearchParams(window.location.search);
  if (!(next instanceof URLSearchParams)) {
    for (const [k, v] of Object.entries(next)) {
      if (v === null || v === "") params.delete(k);
      else params.set(k, v);
    }
  }
  const qs = params.toString();
  window.history.replaceState(window.history.state, "", `${pathname ?? window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash}`);
}
