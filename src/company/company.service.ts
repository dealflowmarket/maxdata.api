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

  async list(options: DirectoryOptions) {
    const normalized = this.normalizeDirectoryOptions(options);
    if (normalized.rejectShortQuery) {
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

    const params: Array<string | number> = [];
    const where: string[] = [];
    let searchCte = '';
    let searchJoin = '';

    if (normalized.q) {
      const pattern = `%${normalized.q}%`;
      params.push(pattern);
      const patternParam = `$${params.length}`;
      const exactBusinessId =
        /^\d+$/.test(normalized.q) && Number.isSafeInteger(Number(normalized.q))
          ? Number(normalized.q)
          : undefined;

      let exactUnion = '';
      if (exactBusinessId !== undefined) {
        params.push(exactBusinessId);
        exactUnion = `
          UNION
          SELECT businessid FROM businesses WHERE businessid = $${params.length}
        `;
      }

      searchCte = `
        WITH matched_businesses AS (
          SELECT businessid FROM businesses WHERE search_text ILIKE ${patternParam}
          UNION
          SELECT businessid FROM businesses WHERE name ILIKE ${patternParam}
          UNION
          SELECT businessid FROM businesses WHERE name_en ILIKE ${patternParam}
          ${exactUnion}
        )
      `;
      searchJoin = 'JOIN matched_businesses mb ON mb.businessid = b.businessid';
    }

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
      ${searchJoin}
      LEFT JOIN tsic_codes t ON t.code = b.tsic_code
      LEFT JOIN sections s ON s.code = b.section_code
      ${whereSql}
    `;

    const { rows } = await this.pool.query(
      `
        ${searchCte}
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
          s.description_en AS section_name_en
        ${baseSelect}
        ORDER BY ${orderSql}
        LIMIT ${limitParam} OFFSET ${offsetParam}
      `,
      params,
    );

    const countResult = await this.pool.query(
      `
        ${searchCte}
        SELECT COUNT(*) AS total
        FROM businesses b
        ${searchJoin}
        ${whereSql}
      `,
      params.slice(0, params.length - 2),
    );

    return {
      data: rows,
      total: parseInt(countResult.rows[0].total, 10),
      page: normalized.page,
      limit: normalized.limit,
      offset: normalized.offset,
      sort: normalized.sort,
      order: normalized.order,
    };
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
    const params: Array<string | number> = [this.normalizeLimit(limit, 20)];
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

    return {
      data: rows,
      type: normalizedMetric,
      limit: params[0],
    };
  }

  async sections() {
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

    return { data: rows };
  }

  async tsics(section?: string) {
    const params: string[] = [];
    const where = section ? `WHERE t.section_code = $1` : '';

    if (section) {
      params.push(section.toUpperCase());
    }

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

    return { data: rows };
  }

  async findOne(id: string) {
    const businessid = parseInt(id, 10);
    if (Number.isNaN(businessid)) {
      throw new NotFoundException('Invalid business ID');
    }

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
    const { rows: financials } = await this.pool.query(
      `
        SELECT *
        FROM business_financials
        WHERE businessid = $1
        ORDER BY statement_year ASC
      `,
      [businessid],
    );

    return { ...company, financials };
  }

  async stats() {
    const { rows } = await this.pool.query(`
      SELECT
        COUNT(*) AS total_companies,
        COUNT(*) FILTER (WHERE status ILIKE '%ดำเนิน%') AS active_companies,
        COUNT(*) FILTER (WHERE latest_statement_year IS NOT NULL) AS with_financials,
        COUNT(*) FILTER (WHERE base_last_synced_at IS NOT NULL) AS registry_complete,
        MAX(updated_at) AS last_updated
      FROM businesses
    `);

    return rows[0];
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

  private escapeLike(value: string) {
    return value.replace(/[%_]/g, '\\$&');
  }

  private sqlString(value: string) {
    return `'${value.replace(/'/g, "''")}'`;
  }
}
