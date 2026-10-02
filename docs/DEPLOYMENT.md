# Deployment

The site is a Next.js app in `web/`, deployed on Vercel from this repository.
There is no server-side database: the app reads JSON files from
`web/public/data/`, which the pipeline regenerates.

## One-time setup on Vercel (project owner)

1. In Vercel, **Add New Project** and import `DomyB/US_vs_China_AI` from GitHub.
2. Set **Root Directory** to `web`.
3. Framework preset: Next.js (auto-detected). Build command and output are the
   defaults (`next build`).
4. Production branch: `main`. Development happens on a feature branch that is
   fast-forwarded into `main`; ingestion workflows are dispatched from `main` and commit
   their data there, which triggers the production deployment. Pushes to other branches
   create preview deployments with their own URLs.
5. No environment variables are needed for Phase 1.

The Hobby tier is sufficient: static pages, no serverless database, well under
100 GB/month of transfer for a research site.

## Local development

```bash
cd web
pnpm install
pnpm dev          # http://localhost:3000
pnpm lint
pnpm typecheck
pnpm test         # unit tests (vitest)
pnpm build
```

## Regenerating data

```bash
# sample data (Phase 1)
python3 pipeline/scripts/make_sample_data.py
# sources registry -> SOURCES.md and web/public/data/sources.json
python3 pipeline/scripts/build_sources.py
```

## Scheduled pipelines (Phase 2 onward)

GitHub Actions workflows under `.github/workflows/` run on cron (daily news,
weekly parliaments, monthly trade and finance) and commit regenerated data to
the repository, which triggers a Vercel deployment. Public repositories get
unlimited Actions minutes. Note that GitHub disables scheduled workflows after 60
days without repository activity; the monthly data commit prevents this.
