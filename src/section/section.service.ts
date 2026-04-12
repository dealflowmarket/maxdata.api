import {
    Injectable,
    NotFoundException,
    BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, isValidObjectId } from 'mongoose';
import { Section, SectionDocument } from './section.schema';
import { CreateSectionDto, UpdateSectionDto } from './section.dto';
import { PostgresService } from '../database/postgres.service';

@Injectable()
export class SectionService {
    constructor(
        @InjectModel(Section.name) private sectionModel: Model<SectionDocument>,
        private readonly postgresService: PostgresService,
    ) { }

    async create(createSectionDto: CreateSectionDto): Promise<Section> {
        if (this.postgresService.usePostgres()) {
            return this.createPostgres(createSectionDto);
        }

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
        if (this.postgresService.usePostgres()) {
            const result = await this.postgresService.query(
                `
                SELECT
                    code,
                    description_th,
                    description_en
                FROM sections
                ORDER BY code ASC
                `,
            );

            return result.rows.map((row: any) => this.toPostgresSection(row)) as unknown as Section[];
        }

        try {
            return await this.sectionModel.find().exec();
        } catch (error) {
            throw new BadRequestException(
                `Failed to retrieve sections: ${error.message}`,
            );
        }
    }

    async findOne(id: string): Promise<Section> {
        if (this.postgresService.usePostgres()) {
            const result = await this.postgresService.query(
                `
                SELECT
                    code,
                    description_th,
                    description_en
                FROM sections
                WHERE code = $1
                LIMIT 1
                `,
                [id.trim().toUpperCase()],
            );

            if (result.rowCount === 0) {
                throw new NotFoundException(`Section with ID "${id}" not found`);
            }

            return this.toPostgresSection(result.rows[0]) as unknown as Section;
        }

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
        if (this.postgresService.usePostgres()) {
            const code = id.trim().toUpperCase();
            const payload = {
                title: updateSectionDto.title?.trim().toUpperCase() || code,
                description_th: updateSectionDto.description_th,
                description_en: updateSectionDto.description_en,
            };

            const result = await this.postgresService.query(
                `
                UPDATE sections
                SET
                    code = $2,
                    description_th = COALESCE($3, description_th),
                    description_en = COALESCE($4, description_en)
                WHERE code = $1
                RETURNING code, description_th, description_en
                `,
                [code, payload.title, payload.description_th, payload.description_en],
            );

            if (result.rowCount === 0) {
                throw new NotFoundException(`Section with ID "${id}" not found`);
            }

            return this.toPostgresSection(result.rows[0]) as unknown as Section;
        }

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
        if (this.postgresService.usePostgres()) {
            const result = await this.postgresService.query(
                `
                DELETE FROM sections
                WHERE code = $1
                RETURNING code, description_th, description_en
                `,
                [id.trim().toUpperCase()],
            );

            if (result.rowCount === 0) {
                throw new NotFoundException(`Section with ID "${id}" not found`);
            }

            return this.toPostgresSection(result.rows[0]) as unknown as Section;
        }

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

    private async createPostgres(createSectionDto: CreateSectionDto): Promise<Section> {
        const title = createSectionDto.title.trim().toUpperCase();

        try {
            const result = await this.postgresService.query(
                `
                INSERT INTO sections (code, description_th, description_en)
                VALUES ($1, $2, $3)
                RETURNING code, description_th, description_en
                `,
                [title, createSectionDto.description_th, createSectionDto.description_en],
            );

            return this.toPostgresSection(result.rows[0]) as unknown as Section;
        } catch (error: any) {
            throw new BadRequestException(`Failed to create section: ${error.message}`);
        }
    }

    private toPostgresSection(row: any) {
        return {
            _id: row.code,
            title: row.code,
            description_th: row.description_th,
            description_en: row.description_en,
        };
    }
}
