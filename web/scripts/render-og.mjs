/**
 * Renders the social image (public/og.png, 1200×630) and the Apple touch icon (src/app/apple-icon.png, 180×180)
 * with Playwright's Chromium: `npm run og`. The drawing is sliced out of components/ui/HeroArt.tsx so it has one
 * source, the colours are the light-scheme tokens of app/globals.css, the tile is the geometry of app/icon.svg, and
 * the fonts are whatever the machine has for the stacks named in scripts/og/template.html (Liberation Serif and
 * Liberation Sans in the project's container). Set CHROMIUM_PATH to a Chrome binary when Playwright's own browser
 * is not installed.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const web = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(resolve(web, p), "utf8");

/** The <svg> of HeroArt.tsx as plain SVG: JSX attribute names to SVG names, the land path inlined, the class prop dropped. */
function heroSvg() {
  const tsx = read("src/components/ui/HeroArt.tsx");
  const land = /const land = "([^"]+)"/.exec(tsx)?.[1];
  const svg = /<svg[\s\S]*?<\/svg>/.exec(tsx)?.[0];
  if (!land || !svg) throw new Error("HeroArt.tsx: the svg or the land path was not found");
  return svg
    .replace(/\s*className=\{className\}/, "")
    .replace(/className=/g, "class=")
    .replace(/d=\{land\}/, `d="${land}"`)
    .replace(/\b(stroke|font|text|clip|stop)([A-Z][a-zA-Z]*)=/g, (_, a, b) => `${a}-${b.toLowerCase()}=`);
}

/** The light-scheme token block of globals.css (the first `:root {` block). */
function lightTokens() {
  const m = /:root \{[\s\S]*?\n\}/.exec(read("src/app/globals.css"));
  if (!m) throw new Error("globals.css: the :root token block was not found");
  return m[0];
}

const og = read("scripts/og/template.html").replace("/*TOKENS*/", lightTokens()).replace("<!--HERO-->", heroSvg());
// iOS masks its own corners and shows black where the icon is transparent, so the touch icon is the tile without rounding
const apple = `<!doctype html><html><body style="margin:0">${read("src/app/icon.svg").replace(/ rx="\d+"/g, "").replace("<svg ", '<svg width="180" height="180" ')}</body></html>`;

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1, colorScheme: "light" });
  await page.setContent(og, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: resolve(web, "public/og.png"), clip: { x: 0, y: 0, width: 1200, height: 630 } });
  const icon = await browser.newPage({ viewport: { width: 180, height: 180 }, deviceScaleFactor: 1, colorScheme: "light" });
  await icon.setContent(apple, { waitUntil: "load" });
  await icon.screenshot({ path: resolve(web, "src/app/apple-icon.png"), clip: { x: 0, y: 0, width: 180, height: 180 } });
  console.log("wrote public/og.png (1200×630) and src/app/apple-icon.png (180×180)");
} finally {
  await browser.close();
}
