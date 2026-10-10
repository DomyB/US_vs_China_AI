import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { MAP_PALETTE, NET_LEAN_MAX, divergingScale, legendStops, sequentialScale } from "@/components/map/scales";

describe("map scales", () => {
  it("diverging scale is neutral at zero and clamps", () => {
    const s = divergingScale();
    expect(s(0)).toBe("rgb(240, 239, 236)");
    expect(s(100)).toBe(s(60));
    expect(s(-100)).toBe(s(-60));
  });
  it("sequential scales go light to dark", () => {
    const s = sequentialScale("CN");
    expect(s(0)).toBe("rgb(240, 239, 236)");
    expect(s(100)).not.toBe(s(0));
  });
  it("dark scheme starts from the dark neutral and ends on the dark-mode actor hue", () => {
    const s = sequentialScale("US", "dark");
    expect(s(0)).toBe("rgb(42, 45, 50)");
    expect(s(100)).toBe("rgb(79, 143, 220)");
    expect(divergingScale("dark")(0)).toBe("rgb(42, 45, 50)");
    expect(MAP_PALETTE.dark.noData).toBe("#2a2d32");
  });
  it("legend stops have the requested count", () => {
    expect(legendStops("both", 9)).toHaveLength(9);
    expect(legendStops("US", 5)).toHaveLength(5);
    expect(legendStops("US", 5, "dark")[0].color).toBe("rgb(42, 45, 50)");
  });
  it("net lean runs on one ±60 range everywhere", () => {
    expect(NET_LEAN_MAX).toBe(60);
    const region = readFileSync(path.join(__dirname, "../../components/region/RegionView.tsx"), "utf8");
    expect(region).toContain("max={NET_LEAN_MAX}");
    expect(region).not.toContain("max={80}");
  });
});
