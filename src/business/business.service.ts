import {
    Injectable,
    NotFoundException,
    BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, isValidObjectId } from 'mongoose';
import { Business, BusinessDocument } from './business.schema';
import { CreateBusinessDto, UpdateBusinessDto } from './business.dto';

@Injectable()
export class BusinessService {
    constructor(
        @InjectModel(Business.name) private businessModel: Model<BusinessDocument>,
    ) { }

    async create(createBusinessDto: CreateBusinessDto): Promise<Business> {
        try {
            const createdBusiness = new this.businessModel(createBusinessDto);
            return await createdBusiness.save();
        } catch (error) {
            throw new BadRequestException(
                `Failed to create business: ${(error as Error).message}`,
            );
        }
    }

    async findAll(tsicId?: string, page = 1, limit = 10): Promise<{ data: any[]; total: number; page: number; limit: number }> {
        const filter: any = {};
        if (tsicId) {
            if (!isValidObjectId(tsicId)) {
                throw new BadRequestException('Invalid TSIC ID format');
            }
            filter.tsic = tsicId;
        }

        const skip = (page - 1) * limit;

        const [businesses, total] = await Promise.all([
            this.businessModel.find(filter, {
                businessid: 1,
                name: 1,
                type: 1,
                tsic: 1,
                reg_cap: 1,
                total_revenue: 1,
                net_profit: 1,
            }).populate('tsic').skip(skip).limit(limit).exec(),
            this.businessModel.countDocuments(filter).exec(),
        ]);

        const data = businesses.map(business => {
            const revenue_last = business.total_revenue?.length
                ? business.total_revenue[business.total_revenue.length - 1]
                : 0;
            const profit_last = business.net_profit?.length
                ? business.net_profit[business.net_profit.length - 1]
                : 0;
            return {
                businessid: business.businessid,
                name: business.name,
                type: business.type,
                tsic: business.tsic,
                reg_cap: business.reg_cap,
                revenue_last,
                profit_last,
            };
        });

        return { data, total, page, limit };
    }

    async findOne(id: string): Promise<Business> {
        if (!isValidObjectId(id)) {
            throw new BadRequestException('Invalid business ID format');
        }

        try {
            const business = await this.businessModel
                .findById(id)
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
                `Failed to retrieve business: ${(error as Error).message}`,
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
                `Failed to update business: ${(error as Error).message}`,
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
                `Failed to delete business: ${(error as Error).message}`,
            );
        }
    }
}
