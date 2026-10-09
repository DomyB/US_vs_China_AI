/**
 * Browser checks for the site. Build and serve it (`npm run build && npm run start`, or point BASE at a server),
 * then `node scripts/ui-check.mjs`. Playwright's Chromium (CHROMIUM_PATH names another Chrome binary) opens every
 * page at three viewports in both colour schemes, once more with the stored dark choice, and asserts what the
 * design relies on: no console or page errors, no horizontal overflow, the token colours, 16px inputs on touch
 * screens, the dock in one column beside the open panel at 1024px, the favicon and social metadata, every tour
 * step and its Finish, a still hero drawing under reduced motion, and the social image's size. Screenshots go to
 * OUT (default: a ui-check folder in the system temp directory). Exit code 1 when a check fails.
 */
import { mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const web = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.BASE ?? "http://localhost:3000";
const OUT = process.env.OUT ?? resolve(tmpdir(), "ui-check");
mkdirSync(OUT, { recursive: true });

const PAGES = ["/", "/region", "/insights", "/country/CHL", "/methodology", "/sources", "/does-not-exist"];
const VIEWS = [
  { name: "desktop", viewport: { width: 1366, height: 900 } },
  { name: "laptop", viewport: { width: 1024, height: 768 } },
  { name: "phone", viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
];
// the token values the contrast work settled on (globals.css); a drift here is a regression, not a restyle
const TOKENS = {
  light: { "--ink-3": "#666b74", "--danger": "#b42318", "--outline": "#26292e" },
  dark: { "--outline": "#626873", "--shadow-hard": "#343940", "--danger": "#f2857a" },
};
const themeKey = /const KEY = "([^"]+)"/.exec(readFileSync(resolve(web, "src/lib/theme.ts"), "utf8"))?.[1];
const tourHrefs = [...readFileSync(resolve(web, "src/components/tour/steps.ts"), "utf8").matchAll(/href: "([^"]+)"/g)].map((m) => m[1]);

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  if (!ok) console.log(`FAIL  ${name}${detail ? `  (${detail})` : ""}`);
};

async function open(ctx, path) {
  const page = await ctx.newPage();
  const errors = [];
  page.on("console", (m) => {
    // the 404 page's own document request is reported as a console error; nothing else is expected
    if (m.type() === "error" && !(path === "/does-not-exist" && /404/.test(m.text()))) errors.push(m.text().slice(0, 160));
  });
  page.on("pageerror", (e) => errors.push(`pageerror ${String(e).slice(0, 160)}`));
  const res = await page.goto(BASE + path, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  return { page, errors, status: res?.status() };
}

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  // 1. every page at three viewports: the system preference light and dark, and the stored dark choice on the desktop
  for (const run of [{ scheme: "light" }, { scheme: "dark" }, { scheme: "light", stored: "dark" }]) {
    for (const v of VIEWS) {
      if (run.stored && v.name !== "desktop") continue;
      const tag = run.stored ? "stored-dark" : run.scheme;
      const effective = run.stored ?? run.scheme;
      const ctx = await browser.newContext({ viewport: v.viewport, isMobile: v.isMobile, hasTouch: v.hasTouch, deviceScaleFactor: v.deviceScaleFactor ?? 1, colorScheme: run.scheme });
      if (run.stored && themeKey) await ctx.addInitScript(([k, t]) => localStorage.setItem(k, t), [themeKey, run.stored]);
      for (const path of PAGES) {
        const label = `${tag} ${v.name} ${path}`;
        const { page, errors, status } = await open(ctx, path);
        check(`${label}: loads`, status === (path === "/does-not-exist" ? 404 : 200), `status ${status}`);
        check(`${label}: no console or page errors`, errors.length === 0, errors.join(" | "));
        const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        check(`${label}: no horizontal overflow`, over <= 0, `${over}px`);
        const tokens = await page.evaluate((names) => Object.fromEntries(names.map((n) => [n, getComputedStyle(document.documentElement).getPropertyValue(n).trim()])), [...Object.keys(TOKENS[effective]), "--accent", "--ink"]);
        for (const [n, want] of Object.entries(TOKENS[effective])) check(`${label}: ${n} is ${want}`, tokens[n] === want, tokens[n]);
        // the browser reports custom properties with var() substituted, so the accent is compared with the ink it should resolve to
        check(`${label}: the accent is the ink`, tokens["--accent"] !== "" && tokens["--accent"] === tokens["--ink"], `${tokens["--accent"]} vs ${tokens["--ink"]}`);
        if (v.name === "phone" && path === "/country/CHL") {
          const size = await page.evaluate(() => {
            const el = document.querySelector(".input");
            return el ? getComputedStyle(el).fontSize : null;
          });
          check(`${label}: .input text is 16px on a touch screen`, size === "16px", String(size));
        }
        if (v.name === "laptop" && path === "/") {
          const dock = await page.evaluate(() => {
            const root = document.querySelector('[data-tour="dock"]');
            const grid = root?.querySelector(".grid");
            return root && grid ? { columns: getComputedStyle(grid).gridTemplateColumns.split(" ").length, overflow: root.scrollWidth - root.clientWidth } : null;
          });
          check(`${label}: the dock is one column beside the open panel`, dock?.columns === 1, JSON.stringify(dock));
          check(`${label}: the dock has no inner overflow`, (dock?.overflow ?? 1) <= 0, JSON.stringify(dock));
        }
        if (path === "/" && v.name === "desktop" && !run.stored && run.scheme === "light") {
          const head = await page.evaluate(() => ({
            icon: document.querySelector('link[rel="icon"]')?.getAttribute("href") ?? "",
            apple: !!document.querySelector('link[rel="apple-touch-icon"]'),
            og: document.querySelector('meta[property="og:image"]')?.getAttribute("content") ?? "",
          }));
          check("head: the favicon is icon.svg", head.icon.includes("icon.svg"), head.icon);
          check("head: an Apple touch icon is linked", head.apple);
          check("head: og:image names og.png", head.og.endsWith("/og.png"), head.og);
        }
        await page.screenshot({ path: resolve(OUT, `${tag}-${v.name}${path === "/" ? "-home" : path.replace(/\//g, "-")}.png`), fullPage: path !== "/" });
        await page.close();
      }
      await ctx.close();
    }
  }

  // 2. the tour: every step finds its target and shows its card; Finish drops the parameter
  {
    const ctx = await browser.newContext({ viewport: VIEWS[0].viewport });
    const page = await ctx.newPage();
    check("tour: steps.ts lists the steps", tourHrefs.length >= 10, String(tourHrefs.length));
    for (let n = 1; n <= tourHrefs.length; n++) {
      const href = tourHrefs[n - 1];
      await page.goto(`${BASE}${href}${href.includes("?") ? "&" : "?"}tour=${n}`, { waitUntil: "networkidle" });
      let ok = true;
      try {
        await page.locator(`[role="dialog"][aria-label^="Tour, step ${n} "]`).waitFor({ timeout: 10000 });
        await page.locator(".tour-ring").first().waitFor({ timeout: 10000 });
      } catch {
        ok = false;
      }
      check(`tour: step ${n} resolves (${href})`, ok);
    }
    await page.getByRole("button", { name: "Finish" }).click();
    await page.waitForTimeout(800);
    check("tour: Finish drops the parameter", !page.url().includes("tour="), page.url());
    await ctx.close();
  }

  // 3. reduced motion: the hero drawing does not animate
  {
    const ctx = await browser.newContext({ viewport: VIEWS[0].viewport, reducedMotion: "reduce" });
    const { page } = await open(ctx, "/");
    const anim = await page.evaluate(() => Array.from(document.querySelectorAll(".hero-route, .hero-shine")).map((el) => `${getComputedStyle(el).animationName}/${getComputedStyle(el).animationDuration}`));
    check("reduced motion: the hero drawing is still", anim.length > 0 && anim.every((a) => a.startsWith("none/") || a.endsWith("/0s") || a.endsWith("/0.01ms")), anim.join(","));
    await ctx.close();
  }

  // 4. the social image file
  {
    const png = readFileSync(resolve(web, "public/og.png"));
    const w = png.readUInt32BE(16);
    const h = png.readUInt32BE(20);
    check("og.png is 1200×630", w === 1200 && h === 630, `${w}×${h}`);
  }
} finally {
  await browser.close();
}
const failed = results.filter((r) => !r.ok).length;
console.log(`${results.length - failed} of ${results.length} checks passed; screenshots in ${OUT}`);
process.exit(failed ? 1 : 0);
