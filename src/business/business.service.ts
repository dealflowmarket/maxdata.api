import {
    Injectable,
    NotFoundException,
    BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, isValidObjectId } from 'mongoose';
import { Business, BusinessDocument } from './business.schema';
import { CreateBusinessDto, UpdateBusinessDto } from './business.dto';
import { Section, SectionDocument } from '../section/section.schema';
import { Tsic, TsicDocument } from '../tsic/tsic.schema';
import { PostgresService } from '../database/postgres.service';

type SearchSortOrder = 'asc' | 'desc';
type TopMetric = 'revenue' | 'profit' | 'roe';

interface BusinessSearchParams {
    search?: string;
    type?: string;
    status?: string;
    section?: string;
    tsic?: string;
    page?: number | string;
    limit?: number | string;
    sortBy?: string;
    sortOrder?: string;
}

export interface TopBusinessItem {
    businessid: number;
    name: string;
    sectionCode: string;
    tsicCode: string;
    metricValue: number;
}

export interface PaginatedBusinessResult {
    data: Business[];
    page: number;
    limit: number;
    total: number;
    totalPages: number;
}

const FINANCIAL_FIELDS = [
    'net_trade_receivables',
    'inventories',
    'current_assets',
    'land_buildings_equipment',
    'non_current_assets',
    'total_assets',
    'current_liabilities',
    'non_current_liabilities',
    'total_liabilities',
    'shareholders_equity',
    'total_liabilities_and_equity',
    'main_revenue',
    'total_revenue',
    'cost_of_goods_sold',
    'gross_profit',
    'selling_admin_expenses',
    'total_expenses',
    'interest_expenses',
    'profit_before_tax',
    'income_tax',
    'net_profit',
] as const;

type FinancialField = (typeof FINANCIAL_FIELDS)[number];

@Injectable()
export class BusinessService {
    constructor(
        @InjectModel(Business.name) private businessModel: Model<BusinessDocument>,
        @InjectModel(Section.name) private sectionModel: Model<SectionDocument>,
        @InjectModel(Tsic.name) private tsicModel: Model<TsicDocument>,
        private readonly postgresService: PostgresService,
    ) { }

    async create(createBusinessDto: CreateBusinessDto): Promise<Business> {
        if (this.postgresService.usePostgres()) {
            return this.writePostgresBusiness(createBusinessDto, false);
        }

        try {
            const createdBusiness = new this.businessModel(createBusinessDto);
            return await createdBusiness.save();
        } catch (error: any) {
            throw new BadRequestException(
                `Failed to create business: ${error.message}`,
            );
        }
    }

    async upsert(createBusinessDto: CreateBusinessDto): Promise<Business> {
        if (this.postgresService.usePostgres()) {
            return this.writePostgresBusiness(createBusinessDto, true);
        }

        try {
            const upsertedBusiness = await this.businessModel
                .findOneAndUpdate(
                    { businessid: createBusinessDto.businessid },
                    createBusinessDto,
                    {
                        upsert: true,
                        new: true,
                        setDefaultsOnInsert: true,
                        runValidators: true,
                    },
                )
                .populate('tsic')
                .populate('section')
                .exec();

            if (!upsertedBusiness) {
                throw new BadRequestException('Failed to upsert business');
            }

            return upsertedBusiness;
        } catch (error: any) {
            throw new BadRequestException(
                `Failed to upsert business: ${error.message}`,
            );
        }
    }

    async findAll(): Promise<Business[]> {
        if (this.postgresService.usePostgres()) {
            const result = await this.postgresService.query(
                `
                SELECT
                    b.*,
                    t.description_th AS tsic_description_th,
                    t.description_en AS tsic_description_en,
                    s.description_th AS section_description_th,
                    s.description_en AS section_description_en
                FROM businesses b
                LEFT JOIN tsic_codes t ON t.code = b.tsic_code
                LEFT JOIN sections s ON s.code = b.section_code
                ORDER BY b.businessid ASC
                `,
            );

            return result.rows.map((row: any) => this.toPostgresBusiness(row)) as unknown as Business[];
        }

        try {
            return await this.businessModel
                .find()
                .populate('tsic')
                .populate('section')
                .exec();
        } catch (error: any) {
            throw new BadRequestException(
                `Failed to retrieve businesses: ${error.message}`,
            );
        }
    }

    async list(tsicId?: string): Promise<any[]> {
        if (this.postgresService.usePostgres()) {
            const params: unknown[] = [];
            const whereSql = tsicId
                ? (() => {
                    params.push(tsicId.trim());
                    return `WHERE b.tsic_code = $${params.length}`;
                })()
                : '';

            const result = await this.postgresService.query(
                `
                SELECT
                    b.businessid,
                    b.name,
                    b.type,
                    b.reg_cap,
                    b.latest_total_revenue,
                    b.latest_net_profit,
                    b.tsic_code,
                    t.description_th AS tsic_description_th,
                    t.description_en AS tsic_description_en,
                    t.section_code,
                    s.description_th AS section_description_th,
                    s.description_en AS section_description_en
                FROM businesses b
                LEFT JOIN tsic_codes t ON t.code = b.tsic_code
                LEFT JOIN sections s ON s.code = b.section_code
                ${whereSql}
                ORDER BY b.businessid ASC
                `,
                params,
            );

            return result.rows.map((row: any) => ({
                businessid: Number(row.businessid),
                name: row.name,
                type: row.type,
                tsic: row.tsic_code
                    ? {
                        _id: row.tsic_code,
                        title: row.tsic_code,
                        description_th: row.tsic_description_th ?? '',
                        description_en: row.tsic_description_en ?? '',
                        section: row.section_code
                            ? {
                                _id: row.section_code,
                                title: row.section_code,
                                description_th: row.section_description_th ?? '',
                                description_en: row.section_description_en ?? '',
                            }
                            : null,
                    }
                    : null,
                reg_cap: this.toNumber(row.reg_cap),
                revenue_last: this.toNumber(row.latest_total_revenue),
                profit_last: this.toNumber(row.latest_net_profit),
            }));
        }

        const filter: Record<string, unknown> = {};
        if (tsicId) {
            filter.tsic = tsicId;
        }

        const businesses = await this.businessModel.find(filter, {
            businessid: 1,
            name: 1,
            type: 1,
            tsic: 1,
            reg_cap: 1,
            total_revenue: 1,
            net_profit: 1,
        }).populate('tsic').exec();

        return businesses.map((business) => {
            const revenueLast = this.getLatestMetricValue(business.total_revenue);
            const profitLast = this.getLatestMetricValue(business.net_profit);

            return {
                businessid: business.businessid,
                name: business.name,
                type: business.type,
                tsic: business.tsic,
                reg_cap: business.reg_cap,
                revenue_last: revenueLast,
                profit_last: profitLast,
            };
        });
    }

    async search(params: BusinessSearchParams): Promise<PaginatedBusinessResult> {
        if (this.postgresService.usePostgres()) {
            return this.searchPostgres(params);
        }

        const page = this.toPositiveInt(params.page, 1);
        const limit = Math.min(this.toPositiveInt(params.limit, 20), 100);
        const sortBy = params.sortBy?.trim();
        const sortOrder = this.toSortOrder(params.sortOrder);
        const filter = await this.buildSearchFilter(params);

        try {
            const query = this.businessModel
                .find(filter)
                .populate('tsic')
                .populate('section')
                .skip((page - 1) * limit)
                .limit(limit);

            const directSort = this.buildDirectSort(sortBy, sortOrder);
            if (directSort) {
                query.sort(directSort);
            } else {
                query.sort({ businessid: 1 });
            }

            const [data, total] = await Promise.all([
                query.exec(),
                this.businessModel.countDocuments(filter),
            ]);

            return {
                data: this.sortInMemory(data, sortBy, sortOrder),
                page,
                limit,
                total,
                totalPages: Math.max(1, Math.ceil(total / limit)),
            };
        } catch (error: any) {
            throw new BadRequestException(
                `Failed to search businesses: ${error.message}`,
            );
        }
    }

    async top(metric: TopMetric, limitValue: number, sectionCode?: string): Promise<TopBusinessItem[]> {
        if (this.postgresService.usePostgres()) {
            return this.topPostgres(metric, limitValue, sectionCode);
        }

        if (!['revenue', 'profit', 'roe'].includes(metric)) {
            throw new BadRequestException('Unsupported top metric');
        }

        const filter: Record<string, unknown> = {};
        if (sectionCode) {
            const section = await this.sectionModel.findOne({ title: sectionCode.trim() }).exec();
            if (!section) {
                return [];
            }
            filter.section = section._id;
        }

        const projection = {
            businessid: 1,
            name: 1,
            total_revenue: 1,
            net_profit: 1,
            shareholders_equity: 1,
            tsic: 1,
            section: 1,
        };

        try {
            const businesses = await this.businessModel
                .find(filter, projection)
                .populate('tsic')
                .populate('section')
                .exec();

            return businesses
                .map((business) => this.toTopBusinessItem(business, metric))
                .filter((item): item is TopBusinessItem => item !== null)
                .sort((left, right) => right.metricValue - left.metricValue)
                .slice(0, Math.max(1, Math.min(limitValue, 50)));
        } catch (error: any) {
            throw new BadRequestException(
                `Failed to retrieve top businesses: ${error.message}`,
            );
        }
    }

    async findByTsic(tsicId: string): Promise<Business[]> {
        if (this.postgresService.usePostgres()) {
            const result = await this.postgresService.query(
                `
                SELECT
                    b.*,
                    t.description_th AS tsic_description_th,
                    t.description_en AS tsic_description_en,
                    s.description_th AS section_description_th,
                    s.description_en AS section_description_en
                FROM businesses b
                LEFT JOIN tsic_codes t ON t.code = b.tsic_code
                LEFT JOIN sections s ON s.code = b.section_code
                WHERE b.tsic_code = $1
                ORDER BY b.businessid ASC
                `,
                [tsicId.trim()],
            );

            return result.rows.map((row: any) => this.toPostgresBusiness(row)) as unknown as Business[];
        }

        if (!isValidObjectId(tsicId)) {
            throw new BadRequestException('Invalid TSIC ID format');
        }

        try {
            return await this.businessModel
                .find({ tsic: tsicId })
                .populate('tsic')
                .populate('section')
                .exec();
        } catch (error: any) {
            throw new BadRequestException(
                `Failed to retrieve businesses by TSIC: ${error.message}`,
            );
        }
    }

    async findOne(id: string): Promise<Business> {
        if (this.postgresService.usePostgres()) {
            return this.findOnePostgres(id);
        }

        const businessId = Number(id);
        if (!id || Number.isNaN(businessId)) {
            throw new BadRequestException('Invalid business ID format');
        }

        try {
            const business = await this.businessModel
                .findOne({ businessid: businessId })
                .populate('tsic')
                .populate('section')
                .exec();
            if (!business) {
                throw new NotFoundException(`Business with ID "${id}" not found`);
            }
            return business;
        } catch (error: any) {
            if (error instanceof NotFoundException) {
                throw error;
            }
            throw new BadRequestException(
                `Failed to retrieve business: ${error.message}`,
            );
        }
    }

    async update(
        id: string,
        updateBusinessDto: UpdateBusinessDto,
    ): Promise<Business> {
        if (this.postgresService.usePostgres()) {
            const existing = await this.findOne(id);
            const merged = { ...existing, ...updateBusinessDto, businessid: Number(id) } as CreateBusinessDto;
            return this.writePostgresBusiness(merged, true);
        }

        if (!isValidObjectId(id)) {
            throw new BadRequestException('Invalid business ID format');
        }

        try {
            const updatedBusiness = await this.businessModel
                .findByIdAndUpdate(id, updateBusinessDto, { new: true })
                .populate('tsic')
                .populate('section')
                .exec();

            if (!updatedBusiness) {
                throw new NotFoundException(`Business with ID "${id}" not found`);
            }

            return updatedBusiness;
        } catch (error: any) {
            if (error instanceof NotFoundException) {
                throw error;
            }
            throw new BadRequestException(
                `Failed to update business: ${error.message}`,
            );
        }
    }

    async remove(id: string): Promise<Business> {
        if (this.postgresService.usePostgres()) {
            const existing = await this.findOne(id);
            await this.postgresService.query(`DELETE FROM business_financials WHERE businessid = $1`, [Number(id)]);
            await this.postgresService.query(`DELETE FROM businesses WHERE businessid = $1`, [Number(id)]);
            return existing;
        }

        if (!isValidObjectId(id)) {
            throw new BadRequestException('Invalid business ID format');
        }

        try {
            const deletedBusiness = await this.businessModel
                .findByIdAndDelete(id)
                .populate('tsic')
                .populate('section')
                .exec();

            if (!deletedBusiness) {
                throw new NotFoundException(`Business with ID "${id}" not found`);
            }

            return deletedBusiness;
        } catch (error: any) {
            if (error instanceof NotFoundException) {
                throw error;
            }
            throw new BadRequestException(
                `Failed to delete business: ${error.message}`,
            );
        }
    }

    private async writePostgresBusiness(
        createBusinessDto: CreateBusinessDto,
        allowUpdate: boolean,
    ): Promise<Business> {
        const businessid = Number(createBusinessDto.businessid);
        if (!Number.isFinite(businessid)) {
            throw new BadRequestException('Invalid business ID format');
        }

        const tsicCode = this.extractCode(createBusinessDto.tsic);
        if (!tsicCode) {
            throw new BadRequestException('TSIC is required');
        }

        const sectionCode =
            this.extractCode(createBusinessDto.section)?.toUpperCase() ||
            (await this.lookupSectionCodeFromTsic(tsicCode));

        const searchText = [
            businessid,
            createBusinessDto.name,
            createBusinessDto.address,
            createBusinessDto.regno_old,
            tsicCode,
            sectionCode,
        ]
            .filter(Boolean)
            .join(' ');

        const latestRevenue = this.getLatestMetricValue(createBusinessDto.total_revenue);
        const latestProfit = this.getLatestMetricValue(createBusinessDto.net_profit);
        const latestEquity = this.getLatestMetricValue(createBusinessDto.shareholders_equity);
        const latestRoe = latestEquity > 0 ? Number(((latestProfit / latestEquity) * 100).toFixed(2)) : null;

        const insertSql = allowUpdate
            ? `
                INSERT INTO businesses (
                    businessid,
                    name,
                    type,
                    status,
                    reg_date,
                    reg_cap,
                    regno_old,
                    section_code,
                    tsic_code,
                    size,
                    address,
                    website,
                    directors,
                    search_text,
                    latest_statement_year,
                    latest_total_revenue,
                    latest_net_profit,
                    latest_roe,
                    detail_last_scraped_at,
                    base_last_synced_at
                )
                VALUES (
                    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
                    $11, $12, $13, $14, $15, $16, $17, $18, NOW(), NOW()
                )
                ON CONFLICT (businessid) DO UPDATE SET
                    name = EXCLUDED.name,
                    type = EXCLUDED.type,
                    status = EXCLUDED.status,
                    reg_date = EXCLUDED.reg_date,
                    reg_cap = EXCLUDED.reg_cap,
                    regno_old = EXCLUDED.regno_old,
                    section_code = COALESCE(EXCLUDED.section_code, businesses.section_code),
                    tsic_code = COALESCE(EXCLUDED.tsic_code, businesses.tsic_code),
                    size = EXCLUDED.size,
                    address = EXCLUDED.address,
                    website = EXCLUDED.website,
                    directors = EXCLUDED.directors,
                    search_text = EXCLUDED.search_text,
                    latest_statement_year = EXCLUDED.latest_statement_year,
                    latest_total_revenue = EXCLUDED.latest_total_revenue,
                    latest_net_profit = EXCLUDED.latest_net_profit,
                    latest_roe = EXCLUDED.latest_roe,
                    detail_last_scraped_at = NOW(),
                    base_last_synced_at = NOW()
                RETURNING businessid
              `
            : `
                INSERT INTO businesses (
                    businessid,
                    name,
                    type,
                    status,
                    reg_date,
                    reg_cap,
                    regno_old,
                    section_code,
                    tsic_code,
                    size,
                    address,
                    website,
                    directors,
                    search_text,
                    latest_statement_year,
                    latest_total_revenue,
                    latest_net_profit,
                    latest_roe,
                    detail_last_scraped_at,
                    base_last_synced_at
                )
                VALUES (
                    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
                    $11, $12, $13, $14, $15, $16, $17, $18, NOW(), NOW()
                )
                RETURNING businessid
              `;

        try {
            await this.postgresService.query(insertSql, [
                businessid,
                createBusinessDto.name,
                createBusinessDto.type,
                createBusinessDto.status,
                createBusinessDto.reg_date ? new Date(createBusinessDto.reg_date) : null,
                createBusinessDto.reg_cap ?? null,
                createBusinessDto.regno_old ?? null,
                sectionCode || null,
                tsicCode,
                createBusinessDto.size ?? null,
                createBusinessDto.address ?? null,
                createBusinessDto.website ?? null,
                createBusinessDto.directors ?? [],
                searchText,
                this.pickLatestYear(createBusinessDto.years),
                latestRevenue || null,
                latestProfit || null,
                latestRoe,
            ]);

            const financialRows = this.toFinancialRows(createBusinessDto);
            if (financialRows.length > 0) {
                await this.postgresService.query(
                    `DELETE FROM business_financials WHERE businessid = $1`,
                    [businessid],
                );

                for (const row of financialRows) {
                    await this.postgresService.query(
                        `
                        INSERT INTO business_financials (
                            businessid,
                            statement_year,
                            net_trade_receivables,
                            inventories,
                            current_assets,
                            land_buildings_equipment,
                            non_current_assets,
                            total_assets,
                            current_liabilities,
                            non_current_liabilities,
                            total_liabilities,
                            shareholders_equity,
                            total_liabilities_and_equity,
                            main_revenue,
                            total_revenue,
                            cost_of_goods_sold,
                            gross_profit,
                            selling_admin_expenses,
                            total_expenses,
                            interest_expenses,
                            profit_before_tax,
                            income_tax,
                            net_profit
                        )
                        VALUES (
                            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
                            $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23
                        )
                        `,
                        [
                            businessid,
                            row.statement_year,
                            row.net_trade_receivables,
                            row.inventories,
                            row.current_assets,
                            row.land_buildings_equipment,
                            row.non_current_assets,
                            row.total_assets,
                            row.current_liabilities,
                            row.non_current_liabilities,
                            row.total_liabilities,
                            row.shareholders_equity,
                            row.total_liabilities_and_equity,
                            row.main_revenue,
                            row.total_revenue,
                            row.cost_of_goods_sold,
                            row.gross_profit,
                            row.selling_admin_expenses,
                            row.total_expenses,
                            row.interest_expenses,
                            row.profit_before_tax,
                            row.income_tax,
                            row.net_profit,
                        ],
                    );
                }
            }

            return this.findOne(String(businessid));
        } catch (error: any) {
            throw new BadRequestException(`Failed to ${allowUpdate ? 'upsert' : 'create'} business: ${error.message}`);
        }
    }

    private async searchPostgres(params: BusinessSearchParams): Promise<PaginatedBusinessResult> {
        const page = this.toPositiveInt(params.page, 1);
        const limit = Math.min(this.toPositiveInt(params.limit, 20), 100);
        const sortOrder = this.toSortOrder(params.sortOrder);
        const orderDirection = sortOrder === 'asc' ? 'ASC' : 'DESC';

        const clauses: string[] = [];
        const queryParams: unknown[] = [];

        if (params.type?.trim()) {
            queryParams.push(params.type.trim());
            clauses.push(`b.type = $${queryParams.length}`);
        }

        if (params.status?.trim()) {
            queryParams.push(params.status.trim());
            clauses.push(`b.status = $${queryParams.length}`);
        }

        if (params.section?.trim()) {
            queryParams.push(params.section.trim().toUpperCase());
            clauses.push(`b.section_code = $${queryParams.length}`);
        }

        if (params.tsic?.trim()) {
            queryParams.push(params.tsic.trim());
            clauses.push(`b.tsic_code = $${queryParams.length}`);
        }

        if (params.search?.trim()) {
            const term = params.search.trim();
            if (/^\d+$/.test(term)) {
                queryParams.push(Number(term));
                queryParams.push(`%${term}%`);
                clauses.push(`(b.businessid = $${queryParams.length - 1} OR b.search_text ILIKE $${queryParams.length})`);
            } else {
                queryParams.push(`%${term}%`);
                clauses.push(`b.search_text ILIKE $${queryParams.length}`);
            }
        }

        const whereSql = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
        const offset = (page - 1) * limit;
        const orderBy = this.toPostgresSortColumn(params.sortBy);

        const baseSelect = `
            SELECT
                b.*,
                t.description_th AS tsic_description_th,
                t.description_en AS tsic_description_en,
                s.description_th AS section_description_th,
                s.description_en AS section_description_en
            FROM businesses b
            LEFT JOIN tsic_codes t ON t.code = b.tsic_code
            LEFT JOIN sections s ON s.code = b.section_code
            ${whereSql}
        `;

        const [dataResult, totalResult] = await Promise.all([
            this.postgresService.query(
                `
                ${baseSelect}
                ORDER BY ${orderBy} ${orderDirection}, b.businessid ASC
                LIMIT ${limit}
                OFFSET ${offset}
                `,
                queryParams,
            ),
            this.postgresService.query(
                `
                SELECT COUNT(*)::int AS total
                FROM businesses b
                ${whereSql}
                `,
                queryParams,
            ),
        ]);

        const total = Number(totalResult.rows[0]?.total ?? 0);
        return {
            data: dataResult.rows.map((row: any) => this.toPostgresBusiness(row)) as unknown as Business[],
            page,
            limit,
            total,
            totalPages: Math.max(1, Math.ceil(total / limit)),
        };
    }

    private async topPostgres(metric: TopMetric, limitValue: number, sectionCode?: string): Promise<TopBusinessItem[]> {
        if (!['revenue', 'profit', 'roe'].includes(metric)) {
            throw new BadRequestException('Unsupported top metric');
        }

        const sortColumn =
            metric === 'revenue'
                ? 'b.latest_total_revenue'
                : metric === 'profit'
                    ? 'b.latest_net_profit'
                    : 'b.latest_roe';

        const params: unknown[] = [];
        const whereClauses = [`${sortColumn} IS NOT NULL`];
        if (sectionCode?.trim()) {
            params.push(sectionCode.trim().toUpperCase());
            whereClauses.push(`b.section_code = $${params.length}`);
        }

        const result = await this.postgresService.query(
            `
            SELECT
                b.businessid,
                b.name,
                b.section_code,
                b.tsic_code,
                ${sortColumn} AS metric_value
            FROM businesses b
            WHERE ${whereClauses.join(' AND ')}
            ORDER BY ${sortColumn} DESC, b.businessid ASC
            LIMIT ${Math.max(1, Math.min(limitValue, 50))}
            `,
            params,
        );

        return result.rows.map((row: any) => ({
            businessid: Number(row.businessid),
            name: row.name,
            sectionCode: row.section_code ?? '',
            tsicCode: row.tsic_code ?? '',
            metricValue: this.toNumber(row.metric_value),
        }));
    }

    private async findOnePostgres(id: string): Promise<Business> {
        const businessId = Number(id);
        if (!id || Number.isNaN(businessId)) {
            throw new BadRequestException('Invalid business ID format');
        }

        const [businessResult, financialResult] = await Promise.all([
            this.postgresService.query(
                `
                SELECT
                    b.*,
                    t.description_th AS tsic_description_th,
                    t.description_en AS tsic_description_en,
                    s.description_th AS section_description_th,
                    s.description_en AS section_description_en
                FROM businesses b
                LEFT JOIN tsic_codes t ON t.code = b.tsic_code
                LEFT JOIN sections s ON s.code = b.section_code
                WHERE b.businessid = $1
                LIMIT 1
                `,
                [businessId],
            ),
            this.postgresService.query(
                `
                SELECT *
                FROM business_financials
                WHERE businessid = $1
                ORDER BY statement_year ASC
                `,
                [businessId],
            ),
        ]);

        if (businessResult.rowCount === 0) {
            throw new NotFoundException(`Business with ID "${id}" not found`);
        }

        return this.toPostgresBusiness(businessResult.rows[0], financialResult.rows) as unknown as Business;
    }

    private async buildSearchFilter(params: BusinessSearchParams): Promise<Record<string, unknown>> {
        const filter: Record<string, unknown> = {};

        if (params.type?.trim()) {
            filter.type = params.type.trim();
        }

        if (params.status?.trim()) {
            filter.status = params.status.trim();
        }

        if (params.section?.trim()) {
            const section = await this.sectionModel.findOne({ title: params.section.trim() }).exec();
            if (!section) {
                return { _id: { $in: [] } };
            }
            filter.section = section._id;
        }

        if (params.tsic?.trim()) {
            const tsic = await this.tsicModel.findOne({ title: params.tsic.trim() }).exec();
            if (!tsic) {
                return { _id: { $in: [] } };
            }
            filter.tsic = tsic._id;
        }

        if (params.search?.trim()) {
            const term = params.search.trim();
            const safeRegex = new RegExp(this.escapeRegex(term), 'i');
            const searchFilters: Record<string, unknown>[] = [
                { name: safeRegex },
                { regno_old: safeRegex },
                { address: safeRegex },
            ];

            if (/^\d+$/.test(term)) {
                searchFilters.unshift({ businessid: Number(term) });
            }

            filter.$or = searchFilters;
        }

        return filter;
    }

    private buildDirectSort(
        sortBy: string | undefined,
        sortOrder: SearchSortOrder,
    ): Record<string, 1 | -1> | null {
        const direction = sortOrder === 'asc' ? 1 : -1;
        switch (sortBy) {
            case 'businessid':
            case 'name':
            case 'status':
            case 'type':
            case 'reg_date':
            case 'reg_cap':
            case 'regno_old':
            case 'size':
                return { [sortBy]: direction };
            default:
                return null;
        }
    }

    private sortInMemory(
        businesses: Business[],
        sortBy: string | undefined,
        sortOrder: SearchSortOrder,
    ): Business[] {
        if (!sortBy || !['section.title', 'tsic.title'].includes(sortBy)) {
            return businesses;
        }

        const direction = sortOrder === 'asc' ? 1 : -1;
        return [...businesses].sort((left, right) => {
            const leftValue = this.getNestedValue(left, sortBy);
            const rightValue = this.getNestedValue(right, sortBy);
            if (leftValue === rightValue) {
                return 0;
            }
            if (leftValue == null) {
                return 1;
            }
            if (rightValue == null) {
                return -1;
            }
            return leftValue < rightValue ? -direction : direction;
        });
    }

    private getNestedValue(target: unknown, path: string): string | number | null {
        const parts = path.split('.');
        let current: any = target;
        for (const part of parts) {
            current = current?.[part];
        }
        if (current == null) {
            return null;
        }
        return current;
    }

    private toTopBusinessItem(business: BusinessDocument, metric: TopMetric): TopBusinessItem | null {
        const sectionCode = (business.section as any)?.title ?? '';
        const tsicCode = (business.tsic as any)?.title ?? '';
        let metricValue = 0;

        if (metric === 'revenue') {
            metricValue = this.getLatestMetricValue(business.total_revenue);
        } else if (metric === 'profit') {
            metricValue = this.getLatestMetricValue(business.net_profit);
        } else {
            const equity = this.getLatestMetricValue(business.shareholders_equity);
            const profit = this.getLatestMetricValue(business.net_profit);
            if (equity <= 0) {
                return null;
            }
            metricValue = Number(((profit / equity) * 100).toFixed(2));
        }

        if (!business.businessid || !business.name || !sectionCode || !tsicCode) {
            return null;
        }

        return {
            businessid: business.businessid,
            name: business.name,
            sectionCode,
            tsicCode,
            metricValue,
        };
    }

    private getLatestMetricValue(values?: number[]): number {
        if (!values || values.length === 0) {
            return 0;
        }
        return values[values.length - 1] ?? 0;
    }

    private toPositiveInt(value: number | string | undefined, fallback: number): number {
        const parsed = Number(value);
        if (!Number.isFinite(parsed) || parsed < 1) {
            return fallback;
        }
        return Math.floor(parsed);
    }

    private toSortOrder(value?: string): SearchSortOrder {
        return value === 'asc' ? 'asc' : 'desc';
    }

    private escapeRegex(term: string): string {
        return term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    private toPostgresSortColumn(sortBy?: string): string {
        switch (sortBy) {
            case 'name':
                return 'b.name';
            case 'status':
                return 'b.status';
            case 'type':
                return 'b.type';
            case 'reg_date':
                return 'b.reg_date';
            case 'reg_cap':
                return 'b.reg_cap';
            case 'regno_old':
                return 'b.regno_old';
            case 'size':
                return 'b.size';
            case 'section.title':
                return 'b.section_code';
            case 'tsic.title':
                return 'b.tsic_code';
            case 'total_revenue':
                return 'b.latest_total_revenue';
            case 'net_profit':
                return 'b.latest_net_profit';
            case 'businessid':
            default:
                return 'b.businessid';
        }
    }

    private toPostgresBusiness(row: any, financialRows: any[] = []) {
        const years = financialRows.map((item) => Number(item.statement_year));
        const business: Record<string, unknown> = {
            _id: String(row.businessid),
            name: row.name,
            type: row.type ?? '',
            status: row.status ?? '',
            businessid: Number(row.businessid),
            reg_date: row.reg_date ? new Date(row.reg_date) : null,
            reg_cap: this.toNumber(row.reg_cap),
            regno_old: row.regno_old ?? '',
            section: row.section_code
                ? {
                    _id: row.section_code,
                    title: row.section_code,
                    description_th: row.section_description_th ?? '',
                    description_en: row.section_description_en ?? '',
                }
                : null,
            size: row.size ?? '',
            years,
            address: row.address ?? '',
            website: row.website ?? '',
            directors: Array.isArray(row.directors) ? row.directors : [],
            tsic: row.tsic_code
                ? {
                    _id: row.tsic_code,
                    title: row.tsic_code,
                    description_th: row.tsic_description_th ?? '',
                    description_en: row.tsic_description_en ?? '',
                    section: row.section_code
                        ? {
                            _id: row.section_code,
                            title: row.section_code,
                            description_th: row.section_description_th ?? '',
                            description_en: row.section_description_en ?? '',
                        }
                        : null,
                }
                : null,
        };

        for (const field of FINANCIAL_FIELDS) {
            business[field] = financialRows.map((item) => this.toNumber(item[field]));
        }

        return business;
    }

    private toNumber(value: unknown): number {
        if (value == null) {
            return 0;
        }

        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : 0;
    }

    private pickLatestYear(years?: number[]): number | null {
        if (!years || years.length === 0) {
            return null;
        }

        return years[years.length - 1] ?? null;
    }

    private async lookupSectionCodeFromTsic(tsicCode: string): Promise<string | null> {
        const result = await this.postgresService.query(
            `SELECT section_code FROM tsic_codes WHERE code = $1 LIMIT 1`,
            [tsicCode],
        );

        return result.rows[0]?.section_code ?? null;
    }

    private extractCode(value: unknown): string | null {
        if (!value) {
            return null;
        }

        if (typeof value === 'string') {
            return value.trim();
        }

        if (typeof value === 'object') {
            const title = (value as { title?: string }).title;
            const id = (value as { _id?: string })._id;
            return (title || id || '').trim() || null;
        }

        return null;
    }

    private toFinancialRows(createBusinessDto: CreateBusinessDto): Array<Record<string, number | null>> {
        const years = createBusinessDto.years ?? [];
        if (years.length === 0) {
            return [];
        }

        return years.map((statementYear, index) => {
            const row: Record<string, number | null> = {
                statement_year: statementYear,
            };

            for (const field of FINANCIAL_FIELDS) {
                const source = (createBusinessDto as any)[field];
                row[field] = Array.isArray(source) ? this.toNumber(source[index]) : null;
            }

            return row;
        });
    }
}
