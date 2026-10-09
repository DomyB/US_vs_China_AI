"use client";

import { useEffect, useState } from "react";
import { Icon } from "./Icons";
import { applySetting, readSetting, type ThemeSetting } from "@/lib/theme";

const ORDER: ThemeSetting[] = ["system", "light", "dark"];
const LABEL: Record<ThemeSetting, string> = { system: "Theme: follows your system", light: "Theme: light", dark: "Theme: dark" };

/** Cycles system → light → dark; the choice is kept in this browser only. */
export function ThemeToggle() {
  const [setting, setSetting] = useState<ThemeSetting>("system");
  useEffect(() => {
    setSetting(readSetting());
  }, []);
  const next = ORDER[(ORDER.indexOf(setting) + 1) % ORDER.length];
  return (
    <button
      type="button"
      onClick={() => {
        applySetting(next);
        setSetting(next);
      }}
      className="btn btn-sm shrink-0 gap-1.5"
      aria-label={`${LABEL[setting]}. Switch to ${next}`}
      title={`${LABEL[setting]} · click for ${next}`}
    >
      <Icon name={setting === "dark" ? "moon" : setting === "light" ? "sun" : "system"} />
      <span className="hidden sm:inline">{setting === "system" ? "Auto" : setting === "dark" ? "Dark" : "Light"}</span>
    </button>
  );
}
