# maxdata.api

NestJS REST API serving Thai company data — profiles, financial statements, and directors — sourced from the Thai Department of Business Development (DBD).

## Stack

- **NestJS** (Node.js) — API framework
- **PostgreSQL** — primary database, direct `pg` pool (no ORM)
- **Next.js frontend** — `maxdata.web2.0` repo, runs on port 3000

## Setup

```bash
npm install
cp .env.example .env   # set DATABASE_URL and PORT
npm run start:dev      # http://localhost:3001
```

`.env` example:
```
PORT=3001
DATABASE_URL=postgresql://maxsolutions@localhost/maxdata
PG_POOL_MAX=10
```

For Supabase, replace `DATABASE_URL` with the Supabase connection string — SSL is handled automatically.

## API

All endpoints under `/company`:

| Endpoint | Description |
|----------|-------------|
| `GET /company` | Browse with filters: `q`, `section`, `tsic`, `sort`, `order`, `page`, `limit`, `status`, `has_financials` |
| `GET /company/search` | Search by name |
| `GET /company/stats` | DB summary stats |
| `GET /company/:id` | Full company detail (profile + financials + directors) |
| `GET /company/leaderboard/:metric` | Top companies by `revenue`, `profit`, `assets`, or `roe` |
| `GET /company/sections` | All 21 industry sections (A–U) |
| `GET /company/tsics` | TSIC codes, filterable by `section` |

## Data

Data is scraped from DBD by `maxdata.script`. The API is read-only.

- 597K+ companies total
- 67K with financial statements
- Financial data in Thai Buddhist Era years (2567 = 2024 CE)

## Project Structure

```
src/
  company/        # Main module (search, detail, leaderboard, stats)
  database/       # pg Pool provider — auto-disables SSL for localhost
  section/        # Industry sections
  tsic/           # TSIC codes
```
