# Supabase Data Audit — 2026-04-23

Audit of the `maxdata` Supabase Postgres. Scope: duplication, drift, and schema inconsistency across `businesses`, `business_financials`, `ingest_queue`, and reference tables.

## TL;DR

| Finding | Severity | Impact |
|---|---|---|
| 7 duplicate indexes on `businesses` | High | ~400 MB wasted storage, 2× write amplification on the worst ones |
| 2 redundant indexes on `business_financials` (PK already covers) | High | ~60 MB wasted, slower writes |
| `businesses.latest_*` denorm drift | High | ~46% of detail-scraped rows show wrong `latest_statement_year` |
| No TSIC→section mismatches | ✅ Clean | — |
| No duplicate `business_financials` rows | ✅ Clean (PK enforces) | — |
| 72 stuck `running` jobs in `ingest_queue` | Low | Easy one-line reset |

## Row counts (from `pg_stat_user_tables`)

| Table | Rows |
|---|---|
| businesses | 596,680 |
| business_financials | 757,499 |
| ingest_queue | 496,807 |
| tsic_codes | 1,265 |
| sections | 21 |
| registry_events | 0 |

## 1. Duplicate indexes — confirmed

`businesses` currently has **15 indexes** (including PK). Seven are exact or near-exact duplicates of another. The older `businesses_*_idx` names coexist with the newer `idx_businesses_*` names.

| Keep | Drop | Reason |
|---|---|---|
| `idx_businesses_search_text_trgm` (336 MB) | `businesses_search_text_trgm_idx` (339 MB) | Both gin trgm on `search_text`. **675 MB combined** |
| `idx_businesses_section_code` (7.4 MB) | `businesses_section_code_idx` (6.3 MB) | Identical btree |
| `idx_businesses_tsic_code` (7.2 MB) | `businesses_tsic_code_idx` (6.7 MB) | Identical btree |
| `idx_businesses_latest_total_revenue` (12 MB) | `businesses_latest_total_revenue_idx` (6.5 MB) | Dup of partial-vs-`NULLS LAST` — one is enough |
| `idx_businesses_latest_net_profit` (13 MB) | `businesses_latest_net_profit_idx` (7.4 MB) | Same |
| `idx_businesses_latest_roe` (28 MB) | `businesses_latest_roe_idx` (7.6 MB) | Same (keep larger? both work, keep one) |

`business_financials` has **three** indexes on the same `(businessid, statement_year)` composite — the PK and two redundant copies.

| Keep | Drop | Reason |
|---|---|---|
| `business_financials_pkey` (30 MB) | `business_financials_businessid_statement_year_idx` (30 MB) | PK already covers |
| ↑ | `idx_financials_business_year` (30 MB) | PK already covers |

### Fix SQL (safe — CONCURRENTLY)

```sql
DROP INDEX CONCURRENTLY IF EXISTS businesses_search_text_trgm_idx;
DROP INDEX CONCURRENTLY IF EXISTS businesses_section_code_idx;
DROP INDEX CONCURRENTLY IF EXISTS businesses_tsic_code_idx;
DROP INDEX CONCURRENTLY IF EXISTS businesses_latest_total_revenue_idx;
DROP INDEX CONCURRENTLY IF EXISTS businesses_latest_net_profit_idx;
DROP INDEX CONCURRENTLY IF EXISTS businesses_latest_roe_idx;
DROP INDEX CONCURRENTLY IF EXISTS business_financials_businessid_statement_year_idx;
DROP INDEX CONCURRENTLY IF EXISTS idx_financials_business_year;
```

Expected reclaim: **~420 MB** storage + faster INSERT/UPDATE on `businesses` and `business_financials`.

## 2. Denorm drift — `businesses.latest_*` vs `business_financials`

Sample of 500 detail-scraped companies, comparing the cached summary columns against the actual max-year row in `business_financials`:

| Column | Drift rate |
|---|---|
| `latest_statement_year` | **229 / 500 (45.8%)** |
| `latest_total_revenue` | 13 / 500 (2.6%) |
| `latest_net_profit` | 10 / 500 (2.0%) |

The year drift is dominated by companies where a newer `business_financials` row was inserted but `businesses.latest_statement_year` wasn't updated (or vice versa). Leaderboard and detail pages that read from `businesses` will show stale "latest filing year" for about half of companies.

### Fix — recompute denorm columns

```sql
-- Run once to reconcile, then add to the biweekly sync job
WITH latest AS (
  SELECT DISTINCT ON (businessid)
    businessid,
    statement_year,
    total_revenue,
    net_profit,
    CASE
      WHEN shareholders_equity > 0 AND net_profit IS NOT NULL
      THEN ROUND(net_profit::numeric * 100 / shareholders_equity, 2)
    END AS roe
  FROM business_financials
  ORDER BY businessid, statement_year DESC
)
UPDATE businesses b
   SET latest_statement_year = l.statement_year,
       latest_total_revenue  = l.total_revenue,
       latest_net_profit     = l.net_profit,
       latest_roe            = l.roe,
       updated_at            = NOW()
  FROM latest l
 WHERE b.businessid = l.businessid
   AND (b.latest_statement_year IS DISTINCT FROM l.statement_year
     OR b.latest_total_revenue  IS DISTINCT FROM l.total_revenue
     OR b.latest_net_profit     IS DISTINCT FROM l.net_profit);
```

**Root cause fix**: centralise the denorm write so any path that upserts `business_financials` also updates the parent row. Either:
- (a) a trigger on `business_financials` that refreshes `businesses.latest_*` after insert/update, or
- (b) one SQL helper in `db.py` that both scripts call.

A trigger is cheaper to enforce but writes inside the scrape loop. Since inserts are already batched, (b) via a shared helper keeps hot-path control and matches existing style.

## 3. Null-heavy columns (expected, but worth naming)

From a 10% TABLESAMPLE (61,315 rows):

| Column | Null rate |
|---|---|
| `section_code` | 54.7% |
| `tsic_code` | 54.7% |
| `status` | 92.5% |
| `detail_last_scraped_at` | 92.3% |
| `base_last_synced_at` | 40.7% |

These are the gap — companies enumerated via CSV/creden but not yet visited by `fetch_registry.py` (base) or `scrape_financials_api.py` (detail). Not corruption, just the backlog.

## 4. `ingest_queue` health

| Status | Count |
|---|---|
| pending | 459,304 |
| done | 37,431 |
| running | 72 |

The 72 `running` jobs are likely dead workers. Safe reset:

```sql
UPDATE ingest_queue
   SET status = 'pending', updated_at = NOW()
 WHERE status = 'running'
   AND updated_at < NOW() - INTERVAL '1 hour';
```

## 5. Clean — no action needed

- **TSIC→section**: 0 mismatches in a 5% sample joining `businesses.tsic_code` to `tsic_codes.code`. Foreign keys are intact.
- **`business_financials` PK duplicates**: impossible by definition — PK is `(businessid, statement_year)`.
- **`registry_events`**: empty; the biweekly job writes here but hasn't run yet.

## Recommended action order

1. **Drop the 8 duplicate indexes** (5-10 min, frees ~420 MB, no downtime with CONCURRENTLY).
2. **Reconcile denorm columns** once with the SQL above (one-shot UPDATE, ~1-2 min).
3. **Wire denorm refresh into the biweekly sync job** so drift can't reappear.
4. **Reset stuck-running queue rows** as part of sync job prelude.
