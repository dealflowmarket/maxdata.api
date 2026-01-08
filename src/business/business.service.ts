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
                `Failed to create business: ${error.message}`,
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
}
