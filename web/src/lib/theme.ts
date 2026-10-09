"use client";

import { useEffect, useState } from "react";

export type Theme = "light" | "dark";
export type ThemeSetting = Theme | "system";
const KEY = "theme";

/** The stored choice for this browser: an explicit scheme, or "system" when nothing is stored. */
export function readSetting(): ThemeSetting {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

/** Store the choice and write it to html[data-theme]; "system" clears both so the media query decides. */
export function applySetting(setting: ThemeSetting): void {
  try {
    if (setting === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, setting);
  } catch {
    // storage unavailable: the choice lasts for the page
  }
  const root = document.documentElement;
  if (setting === "system") delete root.dataset.theme;
  else root.dataset.theme = setting;
}

/** The scheme in effect: the explicit choice if any, else the system preference. */
export function resolveTheme(): Theme {
  if (typeof document === "undefined") return "light";
  const forced = document.documentElement.dataset.theme;
  if (forced === "dark" || forced === "light") return forced;
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** The effective scheme, following html[data-theme] and the system preference; used where colours are
 *  painted outside CSS (the MapLibre canvas and the d3 scales that feed it). */
export function useTheme(): Theme {
  const [theme, setTheme] = useState<Theme>("light");
  useEffect(() => {
    const update = () => setTheme(resolveTheme());
    update();
    const mo = new MutationObserver(update);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    mq?.addEventListener("change", update);
    return () => {
      mo.disconnect();
      mq?.removeEventListener("change", update);
    };
  }, []);
  return theme;
}

/** Inline bootstrap run before paint so a stored choice never flashes the other scheme. */
export const THEME_BOOTSTRAP = `(function(){try{var t=localStorage.getItem("${KEY}");if(t==="light"||t==="dark"){document.documentElement.dataset.theme=t}}catch(e){}})();`;
