# gethome-backend

Apartment-listing aggregator for Tel Aviv. Scrapes Yad2 + Facebook groups, classifies posts via Groq LLM, dedups, and pushes matching listings to users via Telegram.

## Architecture (production)

```
Vercel (UI) → Render (Express API) → Turso (libSQL)
                                         ▲
                                         │ writes
              GitHub Actions (hourly) ───┘
                       │
                       └──► Telegram bot
```

- **Frontend** (separate repo): Vercel Hobby
- **Backend API**: Render Free Web Service — `index.js`, read-only against Turso
- **DB**: Turso (libSQL) — fully managed SQLite-compatible
- **Scrapers**: GitHub Actions cron — `scripts/scrape-once.js` (`scrape.yml` workflow)
- **Notifications**: Telegram bot (channel-wide + per-user matching)

## Setup

The full step-by-step deployment plan lives in [`PRODUCTION_PLAN.md`](./PRODUCTION_PLAN.md). Start there.

## Local development

```bash
npm install
cp .env.example .env
# Edit .env — minimum: FB_EMAIL, FB_PASSWORD, FB_GROUPS, GROQ_API_KEY.
# TURSO_DATABASE_URL can stay blank → uses local SQLite file.

npm run setup-db        # creates schema
npm run login-fb        # one-time: opens a browser for FB login
npm run scrape:once     # run a full scrape cycle
npm start               # run the API
```

## Project structure

```
db/         libSQL client + schema + query functions (all async)
routes/     Express handlers (auth, listings, preferences)
scraper/    Source-specific scrapers (yad2, facebook)
pipeline/   normalize → fingerprint → insert → geocode
notifications/  matchingEngine + telegram
tasks/      scanManager (orchestrates a single scrape cycle)
scripts/    scrape-once, upload-fb-session (CLI entrypoints)
.github/workflows/scrape.yml  hourly cron
```
