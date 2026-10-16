/**
 * Crawl every internal link and anchor the site renders: start from the sitemap routes, open each page, collect the
 * internal hrefs, follow the new ones, and report a link whose page is not 200 or whose #anchor has no element.
 * Run against a running build: node scripts/link-check.mjs (BASE, CHROMIUM_PATH as in ui-check.mjs).
 */
import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:3000";
const START = ["/", "/story", "/explore", "/routes", "/mineral", "/country", "/votes-and-ore", "/contested", "/lab", "/region", "/methodology", "/sources", "/archive", "/stage", "/denial", "/what-we-know", "/step-by-step", "/country/CHL", "/mineral/copper"];
const SKIP = /^(mailto:|https?:|#$)/;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
const seen = new Map(); // path -> { status, anchors:Set, from:Set }
const queue = [...START];
const links = new Map(); // "path#hash" -> Set(from)
while (queue.length) {
  const path = queue.shift();
  if (seen.has(path)) continue;
  const res = await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" }).catch(() => null);
  await page.waitForTimeout(1200);
  const status = res?.status() ?? 0;
  const info = await page.evaluate(() => ({
    ids: Array.from(document.querySelectorAll("[id]")).map((e) => e.id),
    hrefs: Array.from(document.querySelectorAll("a[href]")).map((a) => a.getAttribute("href")),
    title: document.title,
    h1: document.querySelector("h1")?.textContent?.trim() ?? "",
    errorText: document.body.innerText.includes("Something broke") || document.body.innerText.includes("could not be loaded"),
  }));
  seen.set(path, { status, anchors: new Set(info.ids), title: info.title, h1: info.h1, errorText: info.errorText });
  for (const h of info.hrefs) {
    if (!h || SKIP.test(h)) continue;
    const url = new URL(h, `${BASE}${path}`);
    if (url.origin !== new URL(BASE).origin) continue;
    const p = url.pathname.replace(/\/$/, "") || "/";
    const key = `${p}${url.hash}`;
    if (!links.has(key)) links.set(key, new Set());
    links.get(key).add(path);
    // a dynamic page is visited once per distinct path; query strings are not separate pages
    if (!seen.has(p) && !queue.includes(p)) queue.push(p);
  }
}
let bad = 0;
for (const [key, from] of links) {
  const [p, hash] = key.split("#");
  const target = seen.get(p);
  if (!target || target.status !== 200) { bad++; console.log(`BROKEN ${key} (status ${target?.status ?? "unvisited"}) from ${[...from].join(", ")}`); continue; }
  if (hash && !target.anchors.has(hash)) { bad++; console.log(`NO ANCHOR ${key} from ${[...from].slice(0, 3).join(", ")}`); }
}
for (const [p, t] of seen) if (t.errorText) { bad++; console.log(`ERROR TEXT on ${p}`); }
for (const [p, t] of seen) if (!t.h1) console.log(`note: no h1 on ${p} (${t.title})`);
console.log(`${seen.size} pages, ${links.size} distinct link targets, ${bad} problems`);
await browser.close();
process.exit(bad ? 1 : 0);
