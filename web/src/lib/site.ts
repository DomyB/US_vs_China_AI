/** The site's public origin: the deploy's own URL on Vercel, NEXT_PUBLIC_SITE_URL when set, localhost otherwise. */
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000");

/** The routes a crawler may index, with their change rhythm (the data moves monthly). */
export const SITE_ROUTES: { path: string; priority: number }[] = [
  { path: "/", priority: 1 },
  { path: "/story", priority: 0.9 },
  { path: "/explore", priority: 0.9 },
  { path: "/routes", priority: 0.8 },
  { path: "/stage", priority: 0.8 },
  { path: "/denial", priority: 0.8 },
  { path: "/country", priority: 0.8 },
  { path: "/mineral", priority: 0.8 },
  { path: "/mineral/lithium", priority: 0.7 },
  { path: "/mineral/copper", priority: 0.7 },
  { path: "/lab", priority: 0.8 },
  { path: "/votes-and-ore", priority: 0.8 },
  { path: "/step-by-step", priority: 0.7 },
  { path: "/step-by-step/words", priority: 0.7 },
  { path: "/step-by-step/index-geometry", priority: 0.7 },
  { path: "/step-by-step/classifier", priority: 0.7 },
  { path: "/what-we-know", priority: 0.8 },
  { path: "/archive", priority: 0.6 },
  { path: "/region", priority: 0.6 },
  { path: "/methodology", priority: 0.5 },
  { path: "/sources", priority: 0.5 },
];
