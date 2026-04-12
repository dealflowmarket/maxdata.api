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

interface TopBusinessItem {
    businessid: number;
    name: string;
    sectionCode: string;
    tsicCode: string;
    metricValue: number;
}

interface PaginatedBusinessResult {
    data: Business[];
    page: number;
    limit: number;
    total: number;
    totalPages: number;
}

@Injectable()
export class BusinessService {
    constructor(
        @InjectModel(Business.name) private businessModel: Model<BusinessDocument>,
        @InjectModel(Section.name) private sectionModel: Model<SectionDocument>,
        @InjectModel(Tsic.name) private tsicModel: Model<TsicDocument>,
    ) { }

    async create(createBusinessDto: CreateBusinessDto): Promise<Business> {
        try {
            const createdBusiness = new this.businessModel(createBusinessDto);
            return await createdBusiness.save();
        } catch (error) {
            throw new BadRequestException(
                `Failed to create business: ${error.message}`,
            );
        }
    }

    async upsert(createBusinessDto: CreateBusinessDto): Promise<Business> {
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
        } catch (error) {
            throw new BadRequestException(
                `Failed to upsert business: ${error.message}`,
            );
        }
    }

    async findAll(): Promise<Business[]> {
        try {
            return await this.businessModel
                .find()
                .populate('tsic')
                .populate('section')
                .exec();
        } catch (error) {
            throw new BadRequestException(
                `Failed to retrieve businesses: ${error.message}`,
            );
        }
    }

    async list(tsicId?: string): Promise<any[]> {
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
        } catch (error) {
            throw new BadRequestException(
                `Failed to search businesses: ${error.message}`,
            );
        }
    }

    async top(metric: TopMetric, limitValue: number, sectionCode?: string): Promise<TopBusinessItem[]> {
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
        } catch (error) {
            throw new BadRequestException(
                `Failed to retrieve top businesses: ${error.message}`,
            );
        }
    }

    async findByTsic(tsicId: string): Promise<Business[]> {
        if (!isValidObjectId(tsicId)) {
            throw new BadRequestException('Invalid TSIC ID format');
        }

        try {
            return await this.businessModel
                .find({ tsic: tsicId })
                .populate('tsic')
                .populate('section')
                .exec();
        } catch (error) {
            throw new BadRequestException(
                `Failed to retrieve businesses by TSIC: ${error.message}`,
            );
        }
    }

    async findOne(id: string): Promise<Business> {
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
        } catch (error) {
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
        } catch (error) {
            if (error instanceof NotFoundException) {
                throw error;
            }
            throw new BadRequestException(
                `Failed to update business: ${error.message}`,
            );
        }
    }

    async remove(id: string): Promise<Business> {
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
        } catch (error) {
            if (error instanceof NotFoundException) {
                throw error;
            }
            throw new BadRequestException(
                `Failed to delete business: ${error.message}`,
            );
        }
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
}
