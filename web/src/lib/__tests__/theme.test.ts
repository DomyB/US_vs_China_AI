import { beforeEach, describe, expect, it } from "vitest";
import { THEME_BOOTSTRAP, applySetting, readSetting, resolveTheme } from "@/lib/theme";

describe("theme setting", () => {
  beforeEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset.theme;
  });
  it("stores an explicit choice on the html element and clears it for system", () => {
    applySetting("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(readSetting()).toBe("dark");
    expect(resolveTheme()).toBe("dark");
    applySetting("light");
    expect(resolveTheme()).toBe("light");
    applySetting("system");
    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(readSetting()).toBe("system");
    expect(resolveTheme()).toBe("light"); // jsdom has no matchMedia: the system preference reads as light
  });
  it("ignores unknown stored values", () => {
    localStorage.setItem("theme", "sepia");
    expect(readSetting()).toBe("system");
  });
  it("bootstrap script restores a stored choice before paint and survives a missing store", () => {
    localStorage.setItem("theme", "dark");
    new Function(THEME_BOOTSTRAP)();
    expect(document.documentElement.dataset.theme).toBe("dark");
    delete document.documentElement.dataset.theme;
    localStorage.removeItem("theme");
    new Function(THEME_BOOTSTRAP)();
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });
});
