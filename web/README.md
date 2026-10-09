# The site

The public interface of the tracker: a Next.js 15 app (React 19, Tailwind v4, Observable Plot, MapLibre) that reads the JSON files the pipeline exports into `public/data/real/` and, for anything the export has not produced yet, the seeded sample set in `public/data/sample/`. Every block says which layer it shows: facts, model output, interpretation or sample. Deployed on Vercel (Hobby tier) from `main`, root directory `web`.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Development server at http://localhost:3000 (copies MapLibre's worker into `public/vendor/` first) |
| `npm run build`, `npm run start` | Production build and server; what Vercel runs |
| `npm run lint`, `npm run typecheck`, `npm test` | ESLint, `tsc --noEmit`, Vitest (tests under `src/**/__tests__/`) |
| `npm run og` | Renders `public/og.png` (1200×630) and `src/app/apple-icon.png` with Playwright's Chromium from the hero drawing and the light tokens; `CHROMIUM_PATH=…` names a Chrome binary when Playwright's own is not installed |
| `node scripts/ui-check.mjs` | Browser checks against a running build (`BASE`, default http://localhost:3000): console and page errors, horizontal overflow, the token colours, 16px inputs on touch screens, the dock beside the open panel at 1024px, favicon and social metadata, every tour step, reduced motion, the social image's size; screenshots to `OUT` |

Before a push: `npm run lint && npm run typecheck && npm test && npm run build`, then the ui-check on `npm run start`.

## Where things are

- `src/app/`: the routes (`/` is the map, then `/region`, `/insights`, `/country/[iso3]`, `/methodology`, `/sources`), `not-found.tsx`, `error.tsx`, a `loading.tsx` per data route, `icon.svg` and `apple-icon.png`, and `globals.css` with the design tokens for both colour schemes, Tailwind's layers and the three blocks kept outside them on purpose (MapLibre's controls, coarse-pointer sizes, reduced motion).
- `src/components/`: `home/` (map page, dock, drawer, intro card, overview, comparison), `panel/` (the country tabs), `region/`, `insights/`, `charts/`, `controls/`, `tour/`, `ui/` (buttons and pills live in CSS; icons, skeletons, status strip, theme toggle, logo tile, release line here).
- `src/lib/`: `data.ts` (loaders: one request per file and page load, revalidated by the browser), `types.ts`, `constants.ts`, `format.ts`, `scenario.ts`, `sources.ts`, `motion.ts`, `theme.ts`, `useRealMeta.ts`, `useMediaQuery.ts`.
- `public/data/real/` is written by the pipeline's export step in GitHub Actions and committed by the workflow; never edit it by hand. `public/data/sample/` comes from `pipeline/scripts/make_sample_data.py` (seeded).
- `scripts/`: `copy-maplibre-worker.mjs` (runs before dev and build), `render-og.mjs` with `og/template.html`, `ui-check.mjs`, `build_geo.sh` (the basemap).

## Conventions

- Facts, model outputs and interpretation stay visually separate (`LayerLabel`, `DataLayerTag`); every number keeps its source; nothing is estimated silently and missing data is shown as missing.
- Colours are the tokens in `globals.css`. US blue and China vermilion mean the two actors and nothing else; the interface accent is the ink; `--danger` marks errors.
- Element rules go in `@layer base`, our classes in `@layer components`, so Tailwind utilities keep the last word; a rule left outside the layers must say why.
- Motion carries information and is off under `prefers-reduced-motion` (`src/lib/motion.ts`).
- Text is sentence case, including buttons; numbers are tabular; headings are the serif at the base-layer sizes unless a page says otherwise.
