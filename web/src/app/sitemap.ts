import type { MetadataRoute } from "next";
import { IN_SCOPE } from "@/lib/constants";
import { SITE_ROUTES, SITE_URL } from "@/lib/site";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  const pages = SITE_ROUTES.map((r) => ({ url: `${SITE_URL}${r.path}`, changeFrequency: "monthly" as const, priority: r.priority }));
  const files = IN_SCOPE.map((iso3) => ({ url: `${SITE_URL}/country/${iso3}`, changeFrequency: "monthly" as const, priority: 0.7 }));
  return [...pages, ...files];
}
