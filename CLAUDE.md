# maxdata.api — Thai Company Data API

## What This Is

A NestJS REST API serving Thai company data (profiles, financial statements, directors) from PostgreSQL. Part of a three-repo system:

| Repo | Purpose |
|------|---------|
| `maxdata.script` | Data collection pipeline (scrapers) |
| `maxdata.api` | **This repo** — NestJS backend API |
| `maxdata.web2.0` | Next.js frontend website |

## Tech Stack

- **Runtime:** Node.js + NestJS
- **Database:** Supabase Postgres (direct `pg` Pool, no ORM). Connection via `DATABASE_URL`; session pooler on port 5432 works reliably, transaction pooler on 6543 often times out for long queries.
- **Auth:** None (public API)
- **Port:** 3001 (configured in `.env`)

## Project Structure

```
src/
  app.module.ts          # Root module
  main.ts                # Bootstrap (port from env, binds 0.0.0.0)
  company/               # Main module — search, detail, leaderboard, stats
    company.controller.ts
    company.service.ts
    company.module.ts
  database/              # PostgreSQL connection pool
    database.module.ts   # Auto-detects localhost vs remote — disables SSL for local
  section/               # Industry sections (A-U)
  tsic/                  # TSIC industry codes
  business/              # Legacy business module (being replaced by company/)
  scripts/               # One-off DB scripts
```

## API Endpoints

All under `/company`:

| Method | Path | Description |
|--------|------|-------------|
| `GET /company` | Browse/list companies with filters | Supports `q`, `section`, `tsic`, `sort`, `order`, `page`, `limit`, `status`, `has_financials` |
| `GET /company/search` | Search companies by name | Returns `{ data, total, limit, offset }` |
| `GET /company/leaderboard/:metric` | Top companies by metric | `metric`: `revenue`, `profit`, `assets`, `roe`. Filters: `section`, `tsic`, `limit` |
| `GET /company/sections` | List all industry sections | 21 sections (A-U) |
| `GET /company/tsics` | List TSIC codes | Filter by `section` |
| `GET /company/stats` | Database statistics | Total companies, active, with financials, etc. |
| `GET /company/:id` | Company detail by businessid | Includes profile + all financial records + directors |

## Database

PostgreSQL (local or Supabase). Connection via `DATABASE_URL` env var.

SSL behaviour in `database.module.ts`: SSL is disabled automatically when connecting to `localhost` or `127.0.0.1`, and enabled (`rejectUnauthorized: false`) for remote connections (Supabase etc.).

### Key Tables

**businesses** — One row per company (597K+ rows)
- `businessid` (bigint PK) — 13-digit DBD registration number
- Profile: `name`, `name_en`, `type`, `status`, `reg_date`, `reg_cap`, `province`
- Industry: `tsic_code`, `section_code`, `objective_code`, `objective_text`
- Location: `address`, `district`, `city`, `province`, `postal_code`
- `directors` (text[]) — Array of director names
- Summary: `latest_total_revenue`, `latest_net_profit`, `latest_roe`, `latest_statement_year`
- `search_text` — Used for full-text search
- `detail_last_scraped_at` — Timestamp of last successful scrape

**business_financials** — One row per company per year
- PK: `(businessid, statement_year)` — year in Thai Buddhist Era (e.g. 2567 = 2024 CE)
- Balance sheet: `total_assets`, `current_assets`, `shareholders_equity`, etc.
- Income statement: `total_revenue`, `net_profit`, `cost_of_goods_sold`, etc.

**ingest_queue** — Job queue for the scraper pipeline (not used by API)
- `job_type = 'financial_scrape'`, statuses: `pending` / `running` / `done` / `failed`
- `priority` (int) — higher = processed first. High-cap companies boosted to 9. Biweekly-stale re-syncs use priority 7.

**tsic_codes** / **sections** — Industry classification reference tables

**registry_events** — Event log for registrations/dissolutions from DBD monthly CSVs. Populated by the biweekly sync job.

### Known data issues (see AUDIT_REPORT.md, 2026-04-23)

- **Duplicate indexes** on `businesses` and `business_financials` — ~420 MB wasted. Drop SQL is in the audit report.
- **Denorm drift**: ~46% of detail-scraped rows have `businesses.latest_statement_year` out of sync with `business_financials`. Reconcile SQL in the audit report; the biweekly Cloud Run job (`maxdata.script/cloudrun/sync_job.py`) now runs this reconcile at the end of every run.

## Running Locally

```bash
npm install
# .env already set to postgresql://maxsolutions@localhost/maxdata
npm run start:dev     # Starts on port 3001, watch mode
```

The frontend (`maxdata.web2.0`) runs on port 3000 and expects the API on `localhost:3001` (set in `.env.local`).

## How Data Gets In

Data is populated by scripts in `maxdata.script` repo:
1. Company IDs bulk-loaded from DBD CSV exports + enumerated from creden.co
2. `scrape_financials_api.py` processes `ingest_queue`, calls DBD's reverse-engineered encrypted API
   - Uses HKDF-SHA256 + AES-256-GCM + gzip decryption
   - JWT auth (~30 min expiry) + Imperva WAF cookies (~2 hr expiry, fetched via Playwright)
   - HTTP/2 required — server rejects HTTP/1.1
   - Saves: financial statements, profile fields, directors array
3. **Biweekly Cloud Run Job** (`maxdata.script/cloudrun/`) — runs 1st & 15th of each month:
   - Ingests DBD monthly CSVs (new registrations + dissolutions)
   - Re-queues the top `STALE_BATCH_SIZE` existing companies whose `detail_last_scraped_at` is older than `STALE_DAYS` (priority 7)
   - Drains the queue via `scrape_financials_api.py`
   - Reconciles `businesses.latest_*` against `business_financials` at the end

**Supabase pool:** session pooler (5432) allows ~60 connections. `WORKERS=20` is the safe ceiling for a single Cloud Run Job instance.

## Current Data State (April 2026)

- **597K+ companies** in DB
- **67K** with financial statements (~11%)
- **61K** active companies
- **358K** with registry data synced
- ~532K jobs still pending in queue
- Financial years covered: mainly 2566–2567 (2023–2024 CE)
- Average revenue of scraped companies: ~224M THB
