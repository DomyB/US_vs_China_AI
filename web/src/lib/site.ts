/** The site's public origin: the deploy's own URL on Vercel, NEXT_PUBLIC_SITE_URL when set, localhost otherwise. */
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000");

/** The routes a crawler may index, with their change rhythm (the data moves monthly). */
export const SITE_ROUTES: { path: string; priority: number }[] = [
  { path: "/", priority: 1 },
  { path: "/explore", priority: 0.9 },
  { path: "/country", priority: 0.8 },
  { path: "/lab", priority: 0.8 },
  { path: "/votes-and-ore", priority: 0.8 },
  { path: "/archive", priority: 0.6 },
  { path: "/region", priority: 0.6 },
  { path: "/methodology", priority: 0.5 },
  { path: "/sources", priority: 0.5 },
];
