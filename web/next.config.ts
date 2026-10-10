import type { NextConfig } from "next";

// The home is the story; the map lives at /explore. Links shared from the map's days as the home carry its query keys and
// keep working; /insights became /lab.
const MAP_KEYS = ["view", "year", "country", "tab", "span", "compare", "actor", "mineral", "tour"];

const nextConfig: NextConfig = {
  async redirects() {
    return [
      ...MAP_KEYS.map((key) => ({ source: "/", has: [{ type: "query" as const, key }], destination: "/explore", permanent: false })),
      { source: "/insights", destination: "/lab", permanent: true },
    ];
  },
};

export default nextConfig;
