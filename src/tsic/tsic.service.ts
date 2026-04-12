import {
    Injectable,
    NotFoundException,
    BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, isValidObjectId } from 'mongoose';
import { Tsic, TsicDocument } from './tsic.schema';
import { CreateTsicDto, UpdateTsicDto } from './tsic.dto';

@Injectable()
export class TsicService {
    constructor(
        @InjectModel(Tsic.name) private tsicModel: Model<TsicDocument>,
    ) { }

    async create(createTsicDto: CreateTsicDto): Promise<Tsic> {
        try {
            const createdTsic = new this.tsicModel(createTsicDto);
            return await createdTsic.save();
        } catch (error) {
            throw new BadRequestException(
                `Failed to create TSIC: ${error.message}`,
            );
        }
    }

    async findAll(filters?: { section?: string; title?: string }): Promise<Tsic[]> {
        const query: Record<string, unknown> = {};

        if (filters?.section) {
            if (!isValidObjectId(filters.section)) {
                throw new BadRequestException('Invalid section ID format');
            }
            query.section = filters.section;
        }

        if (filters?.title) {
            query.title = filters.title;
        }

        try {
            return await this.tsicModel.find(query).populate('section').exec();
        } catch (error) {
            throw new BadRequestException(
                `Failed to retrieve TSICs: ${error.message}`,
            );
        }
    }

    async findBySection(sectionId: string): Promise<Tsic[]> {
        return this.findAll({ section: sectionId });
    }

    async findByTitle(title: string): Promise<Tsic[]> {
        if (!title) {
            return [];
        }
        return this.findAll({ title: title.trim() });
    }

    async findOne(id: string): Promise<Tsic> {
        if (!isValidObjectId(id)) {
            throw new BadRequestException('Invalid TSIC ID format');
        }

        try {
            const tsic = await this.tsicModel.findById(id).populate('section').exec();
            if (!tsic) {
                throw new NotFoundException(`TSIC with ID "${id}" not found`);
            }
            return tsic;
        } catch (error) {
            if (error instanceof NotFoundException) {
                throw error;
            }
            throw new BadRequestException(
                `Failed to retrieve TSIC: ${error.message}`,
            );
        }
    }

    async update(id: string, updateTsicDto: UpdateTsicDto): Promise<Tsic> {
        if (!isValidObjectId(id)) {
            throw new BadRequestException('Invalid TSIC ID format');
        }

        try {
            const updatedTsic = await this.tsicModel
                .findByIdAndUpdate(id, updateTsicDto, { new: true })
                .populate('section')
                .exec();

            if (!updatedTsic) {
                throw new NotFoundException(`TSIC with ID "${id}" not found`);
            }

            return updatedTsic;
        } catch (error) {
            if (error instanceof NotFoundException) {
                throw error;
            }
            throw new BadRequestException(
                `Failed to update TSIC: ${error.message}`,
            );
        }
    }

    async remove(id: string): Promise<Tsic> {
        if (!isValidObjectId(id)) {
            throw new BadRequestException('Invalid TSIC ID format');
        }

        try {
            const deletedTsic = await this.tsicModel
                .findByIdAndDelete(id)
                .populate('section')
                .exec();

            if (!deletedTsic) {
                throw new NotFoundException(`TSIC with ID "${id}" not found`);
            }

            return deletedTsic;
        } catch (error) {
            if (error instanceof NotFoundException) {
                throw error;
            }
            throw new BadRequestException(
                `Failed to delete TSIC: ${error.message}`,
            );
        }
    }
}
