/**
 * Browser checks for the site. Build and serve it (`npm run build && npm run start`, or point BASE at a server),
 * then `node scripts/ui-check.mjs`. Playwright's Chromium (CHROMIUM_PATH names another Chrome binary) opens every
 * page at three viewports in both colour schemes, once more with the stored dark choice, and asserts what the
 * design relies on: no console or page errors, no horizontal overflow, the token colours, 16px inputs on touch
 * screens, the explore page's context bar (its menus, overflow, sentence and height at every width) and its "Who buys"
 * view, the favicon and social metadata, every tour step and its Finish, the Lab anchors the story links to, a 404 for an unknown case file, a still hero drawing under
 * reduced motion, and the social image's size. Screenshots go to OUT (default: a ui-check folder in the system temp
 * directory). Exit code 1 when a check fails.
 */
import { mkdirSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const web = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.BASE ?? "http://localhost:3000";
const OUT = process.env.OUT ?? resolve(tmpdir(), "ui-check");
mkdirSync(OUT, { recursive: true });

const PAGES = ["/", "/story", "/explore", "/country", "/mineral", "/mineral/copper", "/routes", "/denial", "/stage", "/lab", "/votes-and-ore", "/step-by-step", "/step-by-step/words", "/step-by-step/index-geometry", "/step-by-step/classifier", "/what-we-know", "/archive", "/region", "/country/CHL", "/methodology", "/sources", "/does-not-exist"];
const VIEWS = [
  { name: "desktop", viewport: { width: 1366, height: 900 } },
  { name: "laptop", viewport: { width: 1024, height: 768 } },
  { name: "phone", viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
];
// the token values the contrast work settled on (globals.css); a drift here is a regression, not a restyle
const TOKENS = {
  // the prototype's tokens (DECISIONS 96): the muted ink darkened to 4.6:1 on the ground, the outline is the strong rule, the hard shadow is gone
  light: { "--ink-3": "#6f7378", "--danger": "#b42318", "--outline": "#b9b7ad", "--surface": "#f4f3ee" },
  dark: { "--outline": "#484c52", "--shadow-hard": "transparent", "--danger": "#f2857a", "--surface": "#121417" },
};
const themeKey = /const KEY = "([^"]+)"/.exec(readFileSync(resolve(web, "src/lib/theme.ts"), "utf8"))?.[1];
const tourHrefs = [...readFileSync(resolve(web, "src/components/tour/steps.ts"), "utf8").matchAll(/href: "([^"]+)"/g)].map((m) => m[1]);
// every /lab#… anchor the story points at must be an id on the Lab
const storyDir = resolve(web, "src/components/story");
const labAnchors = [...new Set(readdirSync(storyDir).flatMap((f) => [...readFileSync(resolve(storyDir, f), "utf8").matchAll(/\/lab#([\w-]+)/g)].map((m) => m[1])))];

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  if (!ok) console.log(`FAIL  ${name}${detail ? `  (${detail})` : ""}`);
};

async function open(ctx, path) {
  const page = await ctx.newPage();
  const errors = [];
  page.on("console", (m) => {
    // the 404 page's own document request is reported as a console error; so is an optional data file a release has
    // not written yet (investment.json, classifier.json, …), which the page states as an absence: neither is a defect
    const text = m.text();
    const optionalData = /404 \(Not Found\)/.test(text) && /\/data\/real\//.test(m.location()?.url ?? "");
    // the fonts come from Google; the sandbox that runs this check cannot reach it (a certificate error on the stylesheet), so that one resource failure is not a defect
    // the fonts come from Google and the mineral pictures from Wikimedia; the sandbox that runs this check reaches neither (a certificate or tunnel error on the resource), so those resource failures are not defects
    const loc = m.location()?.url ?? "";
    const fontLoad = /ERR_CERT_AUTHORITY_INVALID|ERR_TUNNEL_CONNECTION_FAILED|fonts\.googleapis|fonts\.gstatic/.test(text) || loc.includes("fonts.g") || loc.includes("wikimedia.org");
    if (m.type() === "error" && !(path === "/does-not-exist" && /404/.test(text)) && !optionalData && !fontLoad) errors.push(`console ${text.slice(0, 160)}`);
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
        if (v.name === "desktop" && !run.stored && run.scheme === "light") {
          // every exhibit carries its context lines, and the pages that open without a cover carry a page guide
          const ctx = await page.evaluate(() => {
            const ex = [...document.querySelectorAll(".exhibit")];
            return { exhibits: ex.length, without: ex.filter((e) => !e.querySelector(".reading")).map((e) => e.id || e.querySelector("figcaption")?.textContent?.slice(0, 40)), guide: !!document.querySelector(".page-guide") };
          });
          if (ctx.exhibits > 0) check(`${label}: every exhibit has its reading lines`, ctx.without.length === 0, `${ctx.without.length} of ${ctx.exhibits} without: ${ctx.without.join(", ")}`);
          if (["/routes", "/mineral", "/region", "/lab", "/votes-and-ore", "/methodology", "/sources", "/archive", "/stage", "/denial"].includes(path)) check(`${label}: the page opens with a guide`, ctx.guide);
        }
        if (path === "/") {
          // an overflowing flex row justified to the end clips its start; the first link must be reachable
          const nav = await page.evaluate(() => {
            const n = document.querySelector('nav[aria-label="Primary"]');
            const a = n?.querySelector("a");
            return n && a ? { first: Math.round(a.getBoundingClientRect().left - n.getBoundingClientRect().left), scroll: n.scrollLeft } : null;
          });
          check(`${label}: the first primary link is visible`, (nav?.first ?? -1) >= -1 && nav?.scroll === 0, JSON.stringify(nav));
        }
        if (path === "/explore") {
          const bar = await page.evaluate(() => {
            const root = document.querySelector('[data-tour="dock"]');
            if (!root) return null;
            const r = root.getBoundingClientRect();
            const selects = root.querySelectorAll("select").length;
            const sentence = root.querySelector(".ctx-sentence");
            return { rows: Math.round(r.height), overflow: root.scrollWidth - root.clientWidth, scrolls: getComputedStyle(root).overflowX === "auto", selects, sentence: sentence ? getComputedStyle(sentence).display !== "none" : false };
          });
          check(`${label}: the context bar carries the five menus`, (bar?.selects ?? 0) >= 5, JSON.stringify(bar));
          // on a phone the bar is one row that scrolls sideways; on wider screens it wraps and nothing overflows
          check(`${label}: the context bar ${v.name === "phone" ? "scrolls sideways" : "has no inner overflow"}`, v.name === "phone" ? bar?.scrolls === true : (bar?.overflow ?? 1) <= 0, JSON.stringify(bar));
          check(`${label}: the context bar ${v.name === "phone" ? "hides" : "shows"} the sentence`, bar?.sentence === (v.name !== "phone"), JSON.stringify(bar));
          check(`${label}: the context bar stays short`, (bar?.rows ?? 999) <= (v.name === "phone" ? 64 : 120), JSON.stringify(bar));
          const legend = await page.evaluate(() => !!document.querySelector('[data-tour="legend"] .card'));
          check(`${label}: the legend card is on the map`, legend);
        }
        if (path === "/lab" && v.name === "desktop" && !run.stored && run.scheme === "light") {
          const missing = await page.evaluate((ids) => ids.filter((id) => !document.getElementById(id)), labAnchors);
          check("lab: the story's /lab anchors exist", labAnchors.length >= 3 && missing.length === 0, `anchors ${labAnchors.join(",")}; missing ${missing.join(",") || "none"}`);
        }
        if (path === "/explore" && v.name === "desktop" && !run.stored && run.scheme === "light") {
          await page.goto(`${BASE}/explore?view=buyers&year=2023`, { waitUntil: "networkidle" });
          await page.waitForTimeout(1500);
          const buyers = await page.evaluate(() => ({
            sentence: document.querySelector('[data-tour="dock"] .ctx-sentence')?.textContent ?? "",
            heading: document.querySelector("#rk-h")?.textContent ?? "",
            grid: document.querySelectorAll('[data-tour="legend"] .grid-cols-3 span').length,
            rows: document.querySelectorAll(".rank-list li").length,
          }));
          check("explore: the buyers view says what it shows", buyers.sentence.includes("China's and the US's shares"), buyers.sentence);
          check("explore: the buyers ranking is headed Who buys", buyers.heading.startsWith("Who buys"), buyers.heading);
          check("explore: the bivariate legend has nine cells", buyers.grid === 9, String(buyers.grid));
          check("explore: the buyers ranking has rows", buyers.rows >= 5, String(buyers.rows));
          await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
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

  // 1b. the legacy map links and the old insights address redirect to the new rooms
  {
    const ctx = await browser.newContext({ viewport: VIEWS[0].viewport });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/?view=money&span=3&year=2024`, { waitUntil: "networkidle" });
    check("redirect: a map link on / lands on /explore with its query", page.url().includes("/explore") && page.url().includes("view=money"), page.url());
    await page.goto(`${BASE}/insights`, { waitUntil: "networkidle" });
    check("redirect: /insights lands on /lab", page.url().includes("/lab"), page.url());
    const unknown = await page.goto(`${BASE}/country/XXX`, { waitUntil: "networkidle" });
    check("country: an unknown case file is a 404", unknown?.status() === 404, `status ${unknown?.status()}`);
    // the Lab renders after its data arrives, so a #hash has to be landed by the page itself
    await page.goto(`${BASE}/lab#${labAnchors[0] ?? "ledger"}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(2000);
    const landed = await page.evaluate((id) => document.getElementById(id)?.getBoundingClientRect().top ?? null, labAnchors[0] ?? "ledger");
    check("lab: a #hash lands on its block", landed !== null && landed >= 0 && landed <= 120, `top ${landed}`);
    await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
    const home = await page.evaluate(() => ({ h1: document.querySelector("h1")?.textContent ?? "", stats: document.querySelectorAll(".stat").length, doors: document.querySelectorAll("a.card").length }));
    check("home: the overview opens on the research question, four numbers and the ways in", home.h1.includes("How China and the United States compete") && home.stats === 4 && home.doors >= 5, JSON.stringify(home));
    await page.goto(`${BASE}/story`, { waitUntil: "networkidle" });
    const story = await page.evaluate(() => ({ h1: document.querySelector("h1")?.textContent ?? "", chapters: document.querySelectorAll("section[id^='c']").length, receipts: document.querySelectorAll("ol[aria-label='Receipts'] li").length, skip: !!Array.from(document.querySelectorAll("button")).find((b) => b.textContent?.includes("Skip intro")) }));
    check("story: /story opens on the Strata cover, the whole picture and the nine chapters", story.h1.includes("Strata") && story.chapters >= 10, JSON.stringify(story));
    check("story: the cold open prints receipts and a Skip control", story.receipts >= 3 && story.skip, JSON.stringify(story));
    // the trust layer: the evidence drawer opens from a story exhibit, keeps focus, closes on Escape and hands focus back
    {
      const btn = page.locator(".evidence-btn").first();
      await btn.scrollIntoViewIfNeeded();
      await btn.click();
      await page.waitForTimeout(600);
      const drawer = await page.evaluate(() => {
        const d = document.querySelector("dialog.evidence-drawer");
        return { open: !!d?.open, title: d?.querySelector("h2")?.textContent ?? "", focusOnClose: document.activeElement?.textContent === "Close", sections: d?.querySelectorAll("h3").length ?? 0 };
      });
      check("drawer: opens from a story exhibit with its title and sections, focus on Close", drawer.open && drawer.title.length > 3 && drawer.focusOnClose && drawer.sections >= 1, JSON.stringify(drawer));
      await page.keyboard.press("Escape");
      await page.waitForTimeout(400);
      const closed = await page.evaluate(() => ({ gone: !document.querySelector("dialog.evidence-drawer"), focus: document.activeElement?.classList.contains("evidence-btn") }));
      check("drawer: Escape closes it and focus returns to the button", closed.gone && closed.focus, JSON.stringify(closed));
    }
    // the registry (sources.json) stays out of the home page's first-load scripts
    {
      const html = await (await page.request.get(`${BASE}/`)).text();
      const srcs = Array.from(html.matchAll(/src="(\/_next\/static\/chunks\/[^"]+\.js)"/g)).map((m) => m[1]);
      let hit = null;
      for (const src of srcs) {
        const body = await (await page.request.get(`${BASE}${src}`)).text();
        if (body.includes("comtradeplus.un.org")) { hit = src; break; }
      }
      check("bundle: the sources registry is not in the home page's first-load scripts", srcs.length > 0 && hit === null, hit ? `found in ${hit}` : `${srcs.length} scripts checked`);
    }
    await page.goto(`${BASE}/methodology`, { waitUntil: "networkidle" });
    const glossary = await page.evaluate(() => ({ section: !!document.getElementById("glossary"), entries: document.querySelectorAll(".glossary-entry").length, anchored: !!document.getElementById("glossary-crps") }));
    check("methods: the glossary renders with anchors", glossary.section && glossary.entries >= 20 && glossary.anchored, JSON.stringify(glossary));
    await ctx.close();
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
    const { page } = await open(ctx, "/does-not-exist"); // the hero drawing lives on the 404 and error pages since the story became the home
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
