import {
    Injectable,
    NotFoundException,
    BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, isValidObjectId } from 'mongoose';
import { Section, SectionDocument } from './section.schema';
import { CreateSectionDto, UpdateSectionDto } from './section.dto';

@Injectable()
export class SectionService {
    constructor(
        @InjectModel(Section.name) private sectionModel: Model<SectionDocument>,
    ) { }

    async create(createSectionDto: CreateSectionDto): Promise<Section> {
        try {
            const createdSection = new this.sectionModel(createSectionDto);
            return await createdSection.save();
        } catch (error) {
            throw new BadRequestException(
                `Failed to create section: ${error.message}`,
            );
        }
    }

    async findAll(): Promise<Section[]> {
        try {
            return await this.sectionModel.find().exec();
        } catch (error) {
            throw new BadRequestException(
                `Failed to retrieve sections: ${error.message}`,
            );
        }
    }

    async findOne(id: string): Promise<Section> {
        if (!isValidObjectId(id)) {
            throw new BadRequestException('Invalid section ID format');
        }

        try {
            const section = await this.sectionModel.findById(id).exec();
            if (!section) {
                throw new NotFoundException(`Section with ID "${id}" not found`);
            }
            return section;
        } catch (error) {
            if (error instanceof NotFoundException) {
                throw error;
            }
            throw new BadRequestException(
                `Failed to retrieve section: ${error.message}`,
            );
        }
    }

    async update(id: string, updateSectionDto: UpdateSectionDto): Promise<Section> {
        if (!isValidObjectId(id)) {
            throw new BadRequestException('Invalid section ID format');
        }

        try {
            const updatedSection = await this.sectionModel
                .findByIdAndUpdate(id, updateSectionDto, { new: true })
                .exec();

            if (!updatedSection) {
                throw new NotFoundException(`Section with ID "${id}" not found`);
            }

            return updatedSection;
        } catch (error) {
            if (error instanceof NotFoundException) {
                throw error;
            }
            throw new BadRequestException(
                `Failed to update section: ${error.message}`,
            );
        }
    }

    async remove(id: string): Promise<Section> {
        if (!isValidObjectId(id)) {
            throw new BadRequestException('Invalid section ID format');
        }

        try {
            const deletedSection = await this.sectionModel.findByIdAndDelete(id).exec();

            if (!deletedSection) {
                throw new NotFoundException(`Section with ID "${id}" not found`);
            }

            return deletedSection;
        } catch (error) {
            if (error instanceof NotFoundException) {
                throw error;
            }
            throw new BadRequestException(
                `Failed to delete section: ${error.message}`,
            );
        }
    }
}
