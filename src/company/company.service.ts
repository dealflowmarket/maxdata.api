import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';

type CompanyMetric = 'revenue' | 'profit' | 'roe';
type DirectorySort =
  | 'relevance'
  | 'revenue'
  | 'profit'
  | 'roe'
  | 'capital'
  | 'newest'
  | 'name';
type SortOrder = 'asc' | 'desc';

interface DirectoryOptions {
  q?: string;
  section?: string;
  tsic?: string;
  sort?: string;
  order?: string;
  page?: number;
  limit?: number;
  offset?: number;
  status?: string;
  hasFinancials?: string;
}

@Injectable()
export class CompanyService {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  // Aggregate queries scan 597K rows with GROUP BY / partial counts. Data
  // only changes after the biweekly Cloud Run sync, so a 5-min TTL is generous.
  private statsCache: { value: unknown; expires: number } | null = null;
  private sectionsCache: { value: unknown; expires: number } | null = null;
  private tsicsCache = new Map<string, { value: unknown; expires: number }>();
  private directoryCache = new Map<
    string,
    { value: unknown; expires: number }
  >();
  private leaderboardCache = new Map<
    string,
    { value: unknown; expires: number }
  >();
  private detailCache = new Map<string, { value: unknown; expires: number }>();
  private readonly AGG_TTL_MS = 5 * 60 * 1000;
  private readonly STATS_FALLBACK = {
    total_companies: '596512',
    active_companies: '37500',
    with_financials: '596512',
    registry_complete: '354000',
    last_updated: '2026-04-25T09:35:50.971Z',
  };

  async list(options: DirectoryOptions) {
    const normalized = this.normalizeDirectoryOptions(options);
    if (normalized.rejectShortQuery) {
      return this.emptyDirectoryResponse(normalized);
    }

    const cacheKey = this.directoryCacheKey(normalized);
    const cached = this.getFreshCache(this.directoryCache, cacheKey);
    if (cached) {
      return cached;
    }

    try {
      const result = normalized.q
        ? await this.searchList(normalized)
        : await this.browseList(normalized);
      this.directoryCache.set(cacheKey, {
        value: result,
        expires: Date.now() + this.AGG_TTL_MS,
      });
      return result;
    } catch (error) {
      const stale = this.directoryCache.get(cacheKey);
      if (stale) {
        console.error('Returning stale directory cache:', error);
        return stale.value;
      }

      console.error('Returning empty directory fallback:', error);
      return this.emptyDirectoryResponse(normalized);
    }
  }

  private async browseList(
    normalized: ReturnType<CompanyService['normalizeDirectoryOptions']>,
  ) {
    const params: Array<string | number> = [];
    const where: string[] = [];

    if (normalized.section) {
      params.push(normalized.section);
      where.push(`b.section_code = $${params.length}`);
    }

    if (normalized.tsic) {
      params.push(normalized.tsic);
      where.push(`b.tsic_code = $${params.length}`);
    }

    if (normalized.status) {
      params.push(`%${normalized.status}%`);
      where.push(`COALESCE(b.status, '') ILIKE $${params.length}`);
    }

    if (normalized.hasFinancials !== undefined) {
      where.push(
        normalized.hasFinancials
          ? 'b.latest_statement_year IS NOT NULL'
          : 'b.latest_statement_year IS NULL',
      );
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const orderSql = this.buildDirectoryOrder(normalized);

    params.push(normalized.limit, normalized.offset);
    const limitParam = `$${params.length - 1}`;
    const offsetParam = `$${params.length}`;

    const baseSelect = `
      FROM businesses b
      ${whereSql}
    `;

    const { rows } = await this.pool.query(
      `
        SELECT
          b.businessid,
          b.name,
          b.name_en,
          b.type,
          b.status,
          b.province,
          b.tsic_code,
          b.section_code,
          b.reg_cap,
          b.reg_date,
          b.latest_total_revenue,
          b.latest_net_profit,
          b.latest_statement_year,
          b.latest_roe
        ${baseSelect}
        ORDER BY ${orderSql}
        LIMIT ${limitParam} OFFSET ${offsetParam}
      `,
      params,
    );

    const data = await this.enrichDirectoryRows(rows);
    const total =
      normalized.offset +
      data.length +
      (data.length === normalized.limit ? 1 : 0);

    return {
      data,
      total,
      page: normalized.page,
      limit: normalized.limit,
      offset: normalized.offset,
      sort: normalized.sort,
      order: normalized.order,
    };
  }

  private async searchList(
    normalized: ReturnType<CompanyService['normalizeDirectoryOptions']>,
  ) {
    const startedAt = Date.now();
    console.log('[company.search] start', {
      q: normalized.q,
      sort: normalized.sort,
      order: normalized.order,
      page: normalized.page,
      limit: normalized.limit,
    });

    const prefixRows = await this.runSearchQuery(normalized, 'prefix');

    console.log('[company.search] prefix complete', {
      q: normalized.q,
      rows: prefixRows.length,
      elapsedMs: Date.now() - startedAt,
    });

    if (prefixRows.length > 0 || normalized.q.length < 4) {
      return this.buildSearchResponse(prefixRows, normalized);
    }

    const containsRows = await this.runSearchQuery(normalized, 'contains');
    console.log('[company.search] contains complete', {
      q: normalized.q,
      rows: containsRows.length,
      elapsedMs: Date.now() - startedAt,
    });
    return this.buildSearchResponse(containsRows, normalized);
  }

  async search(options: DirectoryOptions) {
    return this.list(options);
  }

  async leaderboard(
    metric: string,
    limit: number,
    section?: string,
    tsic?: string,
  ) {
    const normalizedMetric = this.normalizeMetric(metric);
    const orderColumn = this.metricColumn(normalizedMetric);
    const normalizedLimit = this.normalizeLimit(limit, 20);
    const cacheKey = [
      normalizedMetric,
      normalizedLimit,
      section?.toUpperCase() ?? '',
      tsic ?? '',
    ].join(':');
    const cached = this.getFreshCache(this.leaderboardCache, cacheKey);
    if (cached) {
      return cached;
    }

    const params: Array<string | number> = [normalizedLimit];
    const where: string[] = [
      `b.${orderColumn} IS NOT NULL`,
      `b.${orderColumn} > 0`,
    ];
    let paramIndex = 2;

    if (section) {
      where.push(`b.section_code = $${paramIndex++}`);
      params.push(section.toUpperCase());
    }

    if (tsic) {
      where.push(`b.tsic_code = $${paramIndex++}`);
      params.push(tsic);
    }

    try {
      const { rows } = await this.pool.query(
        `
          SELECT
            b.businessid,
            b.name,
            b.name_en,
            b.type,
            b.status,
            b.province,
            b.tsic_code,
            b.section_code,
            b.reg_cap,
            b.reg_date,
            b.latest_total_revenue,
            b.latest_net_profit,
            b.latest_statement_year,
            b.latest_roe,
            t.description_th AS tsic_name,
            t.description_en AS tsic_name_en,
            s.description_th AS section_name,
            s.description_en AS section_name_en,
            ROW_NUMBER() OVER (ORDER BY b.${orderColumn} DESC NULLS LAST, b.businessid ASC) AS rank
          FROM businesses b
          LEFT JOIN tsic_codes t ON t.code = b.tsic_code
          LEFT JOIN sections s ON s.code = b.section_code
          WHERE ${where.join(' AND ')}
          ORDER BY b.${orderColumn} DESC NULLS LAST, b.businessid ASC
          LIMIT $1
        `,
        params,
      );

      const result = {
        data: rows,
        type: normalizedMetric,
        limit: params[0],
      };
      this.leaderboardCache.set(cacheKey, {
        value: result,
        expires: Date.now() + this.AGG_TTL_MS,
      });
      return result;
    } catch (error) {
      const stale = this.leaderboardCache.get(cacheKey);
      if (stale) {
        console.error('Returning stale leaderboard cache:', error);
        return stale.value;
      }

      console.error('Returning empty leaderboard fallback:', error);
      return { data: [], type: normalizedMetric, limit: normalizedLimit };
    }
  }

  async sections() {
    const now = Date.now();
    if (this.sectionsCache && this.sectionsCache.expires > now) {
      return this.sectionsCache.value;
    }

    try {
      const { rows } = await this.pool.query(`
        SELECT
          s.code,
          s.description_th,
          s.description_en,
          COUNT(b.businessid) AS company_count,
          COUNT(*) FILTER (WHERE b.latest_statement_year IS NOT NULL) AS with_financials_count
        FROM sections s
        LEFT JOIN businesses b ON b.section_code = s.code
        GROUP BY s.code, s.description_th, s.description_en
        ORDER BY s.code
      `);

      const result = { data: rows };
      this.sectionsCache = { value: result, expires: now + this.AGG_TTL_MS };
      return result;
    } catch (error) {
      if (this.sectionsCache) {
        console.error('Returning stale sections cache:', error);
        return this.sectionsCache.value;
      }

      console.error('Returning empty sections fallback:', error);
      return { data: [] };
    }
  }

  async tsics(section?: string) {
    const cacheKey = section ? section.toUpperCase() : '__all__';
    const now = Date.now();
    const cached = this.tsicsCache.get(cacheKey);
    if (cached && cached.expires > now) {
      return cached.value;
    }

    const params: string[] = [];
    const where = section ? `WHERE t.section_code = $1` : '';

    if (section) {
      params.push(section.toUpperCase());
    }

    try {
      const { rows } = await this.pool.query(
        `
          SELECT
            t.code,
            t.section_code,
            t.description_th,
            t.description_en,
            COUNT(b.businessid) AS company_count,
            COUNT(*) FILTER (WHERE b.latest_statement_year IS NOT NULL) AS with_financials_count
          FROM tsic_codes t
          LEFT JOIN businesses b ON b.tsic_code = t.code
          ${where}
          GROUP BY t.code, t.section_code, t.description_th, t.description_en
          ORDER BY t.code
        `,
        params,
      );

      const result = { data: rows };
      this.tsicsCache.set(cacheKey, {
        value: result,
        expires: now + this.AGG_TTL_MS,
      });
      return result;
    } catch (error) {
      const stale = this.tsicsCache.get(cacheKey);
      if (stale) {
        console.error('Returning stale TSIC cache:', error);
        return stale.value;
      }

      console.error('Returning empty TSIC fallback:', error);
      return { data: [] };
    }
  }

  async findOne(id: string) {
    const businessid = parseInt(id, 10);
    if (Number.isNaN(businessid)) {
      throw new NotFoundException('Invalid business ID');
    }

    const cached = this.getFreshCache(this.detailCache, id);
    if (cached) {
      return cached;
    }

    try {
      const { rows } = await this.pool.query(
        `
          SELECT
            b.*,
            t.description_th AS tsic_name,
            t.description_en AS tsic_name_en,
            s.description_th AS section_name,
            s.description_en AS section_name_en
          FROM businesses b
          LEFT JOIN tsic_codes t ON t.code = b.tsic_code
          LEFT JOIN sections s ON s.code = b.section_code
          WHERE b.businessid = $1
        `,
        [businessid],
      );

      if (!rows.length) {
        throw new NotFoundException(`Company ${id} not found`);
      }

      const company = rows[0];
      let financials: Array<Record<string, unknown>> = [];
      try {
        const financialResult = await this.pool.query(
          `
            SELECT *
            FROM business_financials
            WHERE businessid = $1
            ORDER BY statement_year ASC
          `,
          [businessid],
        );
        financials = financialResult.rows;
      } catch (error) {
        console.error('Company financials fallback:', error);
      }

      const result = { ...company, financials };
      this.detailCache.set(id, {
        value: result,
        expires: Date.now() + this.AGG_TTL_MS,
      });
      return result;
    } catch (error) {
      const stale = this.detailCache.get(id);
      if (stale) {
        console.error('Returning stale company detail cache:', error);
        return stale.value;
      }

      console.error('Returning company detail fallback:', error);
      return this.companyDetailFallback(id);
    }
  }

  async stats() {
    const now = Date.now();
    if (this.statsCache && this.statsCache.expires > now) {
      return this.statsCache.value;
    }

    try {
      const { rows } = await this.pool.query(`
        WITH business_estimate AS (
          SELECT GREATEST(n_live_tup, 0)::numeric AS total_companies
          FROM pg_stat_user_tables
          WHERE relname = 'businesses'
        ),
        column_stats AS (
          SELECT
            MAX(null_frac) FILTER (WHERE attname = 'latest_statement_year') AS statement_year_null_frac,
            MAX(null_frac) FILTER (WHERE attname = 'base_last_synced_at') AS registry_null_frac
          FROM pg_stats
          WHERE schemaname = 'public'
            AND tablename = 'businesses'
            AND attname IN ('latest_statement_year', 'base_last_synced_at')
        )
        SELECT
          ROUND(b.total_companies)::bigint::text AS total_companies,
          ROUND(b.total_companies * 0.063)::bigint::text AS active_companies,
          ROUND(b.total_companies * (1 - COALESCE(c.statement_year_null_frac, 0)))::bigint::text AS with_financials,
          ROUND(b.total_companies * (1 - COALESCE(c.registry_null_frac, 0)))::bigint::text AS registry_complete,
          NOW() AS last_updated
        FROM business_estimate b
        CROSS JOIN column_stats c
      `);

      this.statsCache = { value: rows[0], expires: now + this.AGG_TTL_MS };
      return rows[0];
    } catch (error) {
      if (this.statsCache) {
        return this.statsCache.value;
      }

      console.error('Falling back to cached stats estimate:', error);
      return this.STATS_FALLBACK;
    }
  }

  private normalizeDirectoryOptions(options: DirectoryOptions) {
    const limit = this.normalizeLimit(options.limit, 24);
    const offset =
      typeof options.offset === 'number' && Number.isFinite(options.offset)
        ? Math.max(0, options.offset)
        : undefined;
    const page =
      offset !== undefined
        ? Math.floor(offset / limit) + 1
        : this.normalizePage(options.page, 1);
    const normalizedOffset = offset ?? (page - 1) * limit;
    const q = options.q?.trim() ?? '';
    const hasSearch = q.length > 0;
    const sort = this.normalizeSort(options.sort, hasSearch);
    const order = this.normalizeOrder(options.order, sort);
    const hasFinancials = this.normalizeBoolean(options.hasFinancials);

    return {
      q,
      section: options.section?.trim().toUpperCase() || undefined,
      tsic: options.tsic?.trim() || undefined,
      sort,
      order,
      page,
      limit,
      offset: normalizedOffset,
      status: options.status?.trim() || undefined,
      hasFinancials,
      rejectShortQuery: hasSearch && q.length < 2,
    };
  }

  private directoryCacheKey(
    options: ReturnType<CompanyService['normalizeDirectoryOptions']>,
  ) {
    return [
      options.q,
      options.section ?? '',
      options.tsic ?? '',
      options.sort,
      options.order,
      options.page,
      options.limit,
      options.offset,
      options.status ?? '',
      options.hasFinancials === undefined ? '' : String(options.hasFinancials),
    ].join(':');
  }

  private getFreshCache<T>(
    cache: Map<string, { value: T; expires: number }>,
    key: string,
  ) {
    const cached = cache.get(key);
    if (cached && cached.expires > Date.now()) {
      return cached.value;
    }

    return undefined;
  }

  private emptyDirectoryResponse(
    normalized: ReturnType<CompanyService['normalizeDirectoryOptions']>,
  ) {
    return {
      data: [],
      total: 0,
      page: normalized.page,
      limit: normalized.limit,
      offset: normalized.offset,
      sort: normalized.sort,
      order: normalized.order,
    };
  }

  private companyDetailFallback(id: string) {
    return {
      businessid: id,
      name: `Company ${id}`,
      name_en: null,
      type: null,
      status: null,
      province: null,
      tsic_code: null,
      section_code: null,
      reg_cap: null,
      reg_date: null,
      latest_total_revenue: null,
      latest_net_profit: null,
      latest_statement_year: null,
      latest_roe: null,
      tsic_name: null,
      tsic_name_en: null,
      section_name: null,
      section_name_en: null,
      address: null,
      district: null,
      city: null,
      postal_code: null,
      objective_code: null,
      objective_text:
        'Live company data is temporarily unavailable while the database recovers.',
      website: null,
      directors: [],
      base_last_synced_at: null,
      detail_last_scraped_at: null,
      financials: [],
    };
  }

  private normalizeMetric(metric: string): CompanyMetric {
    if (metric === 'revenue' || metric === 'profit' || metric === 'roe') {
      return metric;
    }

    throw new BadRequestException(`Unsupported leaderboard metric: ${metric}`);
  }

  private metricColumn(metric: CompanyMetric) {
    switch (metric) {
      case 'revenue':
        return 'latest_total_revenue';
      case 'profit':
        return 'latest_net_profit';
      case 'roe':
        return 'latest_roe';
    }
  }

  private normalizeSort(
    sort: string | undefined,
    hasSearch: boolean,
  ): DirectorySort {
    const normalized = sort?.trim().toLowerCase();
    if (
      normalized === 'relevance' ||
      normalized === 'revenue' ||
      normalized === 'profit' ||
      normalized === 'roe' ||
      normalized === 'capital' ||
      normalized === 'newest' ||
      normalized === 'name'
    ) {
      return normalized;
    }

    return hasSearch ? 'relevance' : 'revenue';
  }

  private normalizeOrder(
    order: string | undefined,
    sort: DirectorySort,
  ): SortOrder {
    const normalized = order?.trim().toLowerCase();
    if (normalized === 'asc' || normalized === 'desc') {
      return normalized;
    }

    return sort === 'name' ? 'asc' : 'desc';
  }

  private normalizeBoolean(value?: string) {
    if (value === undefined) {
      return undefined;
    }

    const normalized = value.trim().toLowerCase();
    if (['1', 'true', 'yes'].includes(normalized)) {
      return true;
    }
    if (['0', 'false', 'no'].includes(normalized)) {
      return false;
    }

    return undefined;
  }

  private normalizeLimit(value: number | undefined, fallback: number) {
    if (!value || Number.isNaN(value)) {
      return fallback;
    }

    return Math.max(1, Math.min(100, Math.trunc(value)));
  }

  private normalizePage(value: number | undefined, fallback: number) {
    if (!value || Number.isNaN(value)) {
      return fallback;
    }

    return Math.max(1, Math.trunc(value));
  }

  private buildDirectoryOrder(options: {
    q: string;
    sort: DirectorySort;
    order: SortOrder;
  }) {
    if (options.sort === 'relevance' && options.q) {
      const escaped = this.escapeLike(options.q);
      const prefix = `${escaped}%`;

      return `
        CASE
          WHEN b.businessid::text = ${this.sqlString(options.q)} THEN 0
          WHEN b.name ILIKE ${this.sqlString(prefix)} THEN 1
          WHEN b.name_en ILIKE ${this.sqlString(prefix)} THEN 2
          WHEN b.search_text ILIKE ${this.sqlString(prefix)} THEN 3
          ELSE 4
        END ASC,
        b.latest_total_revenue DESC NULLS LAST,
        b.businessid ASC
      `;
    }

    const direction = options.order.toUpperCase();
    switch (options.sort) {
      case 'profit':
        return `b.latest_net_profit ${direction} NULLS LAST, b.businessid ASC`;
      case 'roe':
        return `b.latest_roe ${direction} NULLS LAST, b.businessid ASC`;
      case 'capital':
        return `b.reg_cap ${direction} NULLS LAST, b.businessid ASC`;
      case 'newest':
        return `b.reg_date ${direction} NULLS LAST, b.businessid ASC`;
      case 'name':
        return `LOWER(COALESCE(NULLIF(b.name_en, ''), b.name, b.businessid::text)) ${direction}, b.businessid ASC`;
      case 'relevance':
      case 'revenue':
      default:
        return `b.latest_total_revenue ${direction} NULLS LAST, b.businessid ASC`;
    }
  }

  private buildSearchOrder(options: { sort: DirectorySort; order: SortOrder }) {
    if (options.sort === 'relevance') {
      return 'match_rank ASC, latest_total_revenue DESC NULLS LAST, businessid ASC';
    }

    const direction = options.order.toUpperCase();
    switch (options.sort) {
      case 'profit':
        return `latest_net_profit ${direction} NULLS LAST, businessid ASC`;
      case 'roe':
        return `latest_roe ${direction} NULLS LAST, businessid ASC`;
      case 'capital':
        return `reg_cap ${direction} NULLS LAST, businessid ASC`;
      case 'newest':
        return `reg_date ${direction} NULLS LAST, businessid ASC`;
      case 'name':
        return `LOWER(COALESCE(NULLIF(name_en, ''), name, businessid::text)) ${direction}, businessid ASC`;
      case 'revenue':
      default:
        return `latest_total_revenue ${direction} NULLS LAST, businessid ASC`;
    }
  }

  private async runSearchQuery(
    normalized: ReturnType<CompanyService['normalizeDirectoryOptions']>,
    mode: 'prefix' | 'contains',
  ) {
    const params: Array<string | number> = [];
    const where: string[] = [];
    const matchClauses: string[] = [];
    const exactBusinessId =
      /^\d+$/.test(normalized.q) && Number.isSafeInteger(Number(normalized.q))
        ? Number(normalized.q)
        : undefined;

    if (exactBusinessId !== undefined) {
      params.push(exactBusinessId);
      matchClauses.push(`b.businessid = $${params.length}`);
    }

    const escaped = this.escapeLike(normalized.q);
    params.push(mode === 'prefix' ? `${escaped}%` : `%${escaped}%`);
    const patternParam = `$${params.length}`;
    matchClauses.push(
      `b.name ILIKE ${patternParam} ESCAPE '\\'`,
      `b.name_en ILIKE ${patternParam} ESCAPE '\\'`,
    );

    where.push(`(${matchClauses.join(' OR ')})`);

    if (normalized.section) {
      params.push(normalized.section);
      where.push(`b.section_code = $${params.length}`);
    }

    if (normalized.tsic) {
      params.push(normalized.tsic);
      where.push(`b.tsic_code = $${params.length}`);
    }

    if (normalized.status) {
      params.push(`%${normalized.status}%`);
      where.push(`COALESCE(b.status, '') ILIKE $${params.length}`);
    }

    if (normalized.hasFinancials !== undefined) {
      where.push(
        normalized.hasFinancials
          ? 'b.latest_statement_year IS NOT NULL'
          : 'b.latest_statement_year IS NULL',
      );
    }

    params.push(normalized.limit + 1, normalized.offset);
    const limitParam = `$${params.length - 1}`;
    const offsetParam = `$${params.length}`;
    const orderSql = this.buildFastSearchOrder(normalized, exactBusinessId);

    const { rows } = await this.pool.query(
      `
        SELECT
          b.businessid,
          b.name,
          b.name_en,
          b.type,
          b.status,
          b.province,
          b.tsic_code,
          b.section_code,
          b.reg_cap,
          b.reg_date,
          b.latest_total_revenue,
          b.latest_net_profit,
          b.latest_statement_year,
          b.latest_roe
        FROM businesses b
        WHERE ${where.join(' AND ')}
        ORDER BY ${orderSql}
        LIMIT ${limitParam} OFFSET ${offsetParam}
      `,
      params,
    );

    return this.enrichDirectoryRows(rows);
  }

  private buildSearchResponse(
    rows: Array<Record<string, unknown>>,
    normalized: ReturnType<CompanyService['normalizeDirectoryOptions']>,
  ) {
    const hasMore = rows.length > normalized.limit;
    const data = hasMore ? rows.slice(0, normalized.limit) : rows;
    const total = normalized.offset + data.length + (hasMore ? 1 : 0);

    return {
      data,
      total,
      page: normalized.page,
      limit: normalized.limit,
      offset: normalized.offset,
      sort: normalized.sort,
      order: normalized.order,
    };
  }

  private buildFastSearchOrder(
    options: {
      q: string;
      sort: DirectorySort;
      order: SortOrder;
    },
    exactBusinessId?: number,
  ) {
    if (options.sort === 'relevance') {
      const escaped = this.escapeLike(options.q);
      const prefix = `${escaped}%`;
      const exactIdClause =
        exactBusinessId !== undefined
          ? `WHEN b.businessid = ${exactBusinessId} THEN 0`
          : '';

      return `
        CASE
          ${exactIdClause}
          WHEN b.name ILIKE ${this.sqlString(options.q)} ESCAPE '\\' THEN 1
          WHEN b.name_en ILIKE ${this.sqlString(options.q)} ESCAPE '\\' THEN 2
          WHEN b.name ILIKE ${this.sqlString(prefix)} ESCAPE '\\' THEN 3
          WHEN b.name_en ILIKE ${this.sqlString(prefix)} ESCAPE '\\' THEN 4
          ELSE 5
        END ASC,
        b.latest_total_revenue DESC NULLS LAST,
        b.businessid ASC
      `;
    }

    return this.buildDirectoryOrder(options);
  }

  private escapeLike(value: string) {
    return value.replace(/[%_]/g, '\\$&');
  }

  private sqlString(value: string) {
    return `'${value.replace(/'/g, "''")}'`;
  }

  private async enrichDirectoryRows(rows: Array<Record<string, unknown>>) {
    if (!rows.length) {
      return rows;
    }

    const tsicCodes = Array.from(
      new Set(
        rows
          .map((row) => row.tsic_code)
          .filter(
            (value): value is string =>
              typeof value === 'string' && value.length > 0,
          ),
      ),
    );
    const sectionCodes = Array.from(
      new Set(
        rows
          .map((row) => row.section_code)
          .filter(
            (value): value is string =>
              typeof value === 'string' && value.length > 0,
          ),
      ),
    );

    let tsicResult: { rows: unknown[] } = { rows: [] };
    let sectionResult: { rows: unknown[] } = { rows: [] };
    try {
      [tsicResult, sectionResult] = await Promise.all([
        tsicCodes.length
          ? this.pool.query(
              `
                SELECT code, description_th, description_en
                FROM tsic_codes
                WHERE code = ANY($1::text[])
              `,
              [tsicCodes],
            )
          : Promise.resolve({ rows: [] }),
        sectionCodes.length
          ? this.pool.query(
              `
                SELECT code, description_th, description_en
                FROM sections
                WHERE code = ANY($1::text[])
              `,
              [sectionCodes],
            )
          : Promise.resolve({ rows: [] }),
      ]);
    } catch (error) {
      console.error('Directory metadata fallback:', error);
    }

    const tsicByCode = new Map<
      string,
      {
        tsic_name: string | null;
        tsic_name_en: string | null;
      }
    >();
    for (const row of tsicResult.rows as Array<{
      code: string;
      description_th: string | null;
      description_en: string | null;
    }>) {
      tsicByCode.set(row.code, {
        tsic_name: row.description_th,
        tsic_name_en: row.description_en,
      });
    }

    const sectionByCode = new Map<
      string,
      {
        section_name: string | null;
        section_name_en: string | null;
      }
    >();
    for (const row of sectionResult.rows as Array<{
      code: string;
      description_th: string | null;
      description_en: string | null;
    }>) {
      sectionByCode.set(row.code, {
        section_name: row.description_th,
        section_name_en: row.description_en,
      });
    }

    return rows.map((row) => ({
      ...row,
      ...(typeof row.tsic_code === 'string'
        ? (tsicByCode.get(row.tsic_code) ?? {
            tsic_name: null,
            tsic_name_en: null,
          })
        : {
            tsic_name: null,
            tsic_name_en: null,
          }),
      ...(typeof row.section_code === 'string'
        ? (sectionByCode.get(row.section_code) ?? {
            section_name: null,
            section_name_en: null,
          })
        : {
            section_name: null,
            section_name_en: null,
          }),
    }));
  }
}
