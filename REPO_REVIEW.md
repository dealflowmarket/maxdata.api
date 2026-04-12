# MaxData API Review

## Overview

`maxdata.api` is the NestJS backend and MongoDB persistence layer for MaxData. It stores sections, TSIC codes, businesses, and financial arrays, and it is the contract point between the scrapers and the Next.js frontend.

Before remediation, the API was mostly CRUD-oriented and did not expose the ingest, ranking, or search endpoints required by the rest of the product.

## Architecture

- `src/section/*`: section schema and CRUD handlers
- `src/tsic/*`: TSIC schema and lookup handlers
- `src/business/*`: business schema, CRUD handlers, and now the cross-repo search/ranking logic
- MongoDB models are wired through NestJS modules with Mongoose

## Verified Issues

- Exact TSIC lookup by code was missing from `GET /tsic`.
  Status: fixed locally by adding `title=<tsic_code>` lookup support.
- `section.title`, `tsic.title`, and `business.businessid` were not protected by uniqueness constraints.
  Status: fixed locally with unique indexed schema fields.
- Idempotent business ingest was missing, so scraper retries risked duplicate writes.
  Status: fixed locally with `POST /business/upsert`.
- Homepage ranking endpoints did not exist.
  Status: fixed locally with `GET /business/top`.
- Admin/business search endpoint did not exist.
  Status: fixed locally with `GET /business/search`.
- Business ID handling is still inconsistent across endpoints.
  Status: documented for later cleanup. `GET /business/:id` uses `businessid`, while update/delete still use Mongo `_id`.

## Additional Blockers

- Ranking queries currently compute from stored arrays and populated references; large datasets may need aggregation-pipeline optimization later.
- ROE depends on clean `net_profit` and `shareholders_equity` tails. Bad historical data can still distort rankings.
- Search behavior currently favors business-code and text matching, but multilingual search quality may need a later pass.

## Difficulty Matrix

- Add exact TSIC lookup by code: `2/5`
- Add unique indexes for core identity fields: `2/5`
- Add idempotent business upsert: `2/5`
- Add top revenue/profit endpoint: `3/5`
- Add top ROE endpoint with data-quality guards: `4/5`
- Add backend search with section/TSIC code filters and pagination: `4/5`
- Normalize mixed `businessid` vs `_id` contracts: `3/5`

## Recommended Fix Order

1. Keep uniqueness and upsert behavior in place first.
2. Preserve exact TSIC lookup so the scraper can resolve section and TSIC IDs by code.
3. Keep homepage ranking endpoints stable.
4. Keep backend search stable for admin pages.
5. Revisit business ID consistency only after scraper and UI contracts are stable.
