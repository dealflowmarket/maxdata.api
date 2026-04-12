import {
    Injectable,
    NotFoundException,
    BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, isValidObjectId } from 'mongoose';
import { Tsic, TsicDocument } from './tsic.schema';
import { CreateTsicDto, UpdateTsicDto } from './tsic.dto';
import { PostgresService } from '../database/postgres.service';

@Injectable()
export class TsicService {
    constructor(
        @InjectModel(Tsic.name) private tsicModel: Model<TsicDocument>,
        private readonly postgresService: PostgresService,
    ) { }

    async create(createTsicDto: CreateTsicDto): Promise<Tsic> {
        if (this.postgresService.usePostgres()) {
            return this.createPostgres(createTsicDto);
        }

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
        if (this.postgresService.usePostgres()) {
            const whereClauses: string[] = [];
            const params: unknown[] = [];

            if (filters?.section) {
                params.push(filters.section.trim().toUpperCase());
                whereClauses.push(`t.section_code = $${params.length}`);
            }

            if (filters?.title) {
                params.push(filters.title.trim());
                whereClauses.push(`t.code = $${params.length}`);
            }

            const whereSql = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';
            const result = await this.postgresService.query(
                `
                SELECT
                    t.code,
                    t.description_th,
                    t.description_en,
                    t.section_code,
                    s.description_th AS section_description_th,
                    s.description_en AS section_description_en
                FROM tsic_codes t
                LEFT JOIN sections s ON s.code = t.section_code
                ${whereSql}
                ORDER BY t.code ASC
                `,
                params,
            );

            return result.rows.map((row: any) => this.toPostgresTsic(row)) as unknown as Tsic[];
        }

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
        if (this.postgresService.usePostgres()) {
            const result = await this.postgresService.query(
                `
                SELECT
                    t.code,
                    t.description_th,
                    t.description_en,
                    t.section_code,
                    s.description_th AS section_description_th,
                    s.description_en AS section_description_en
                FROM tsic_codes t
                LEFT JOIN sections s ON s.code = t.section_code
                WHERE t.code = $1
                LIMIT 1
                `,
                [id.trim()],
            );

            if (result.rowCount === 0) {
                throw new NotFoundException(`TSIC with ID "${id}" not found`);
            }

            return this.toPostgresTsic(result.rows[0]) as unknown as Tsic;
        }

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
        if (this.postgresService.usePostgres()) {
            const code = id.trim();
            const nextCode = updateTsicDto.title?.trim() || code;
            const nextSection = updateTsicDto.section?.trim().toUpperCase();

            const result = await this.postgresService.query(
                `
                UPDATE tsic_codes
                SET
                    code = $2,
                    description_th = COALESCE($3, description_th),
                    description_en = COALESCE($4, description_en),
                    section_code = COALESCE($5, section_code)
                WHERE code = $1
                RETURNING code, description_th, description_en, section_code
                `,
                [code, nextCode, updateTsicDto.description_th, updateTsicDto.description_en, nextSection],
            );

            if (result.rowCount === 0) {
                throw new NotFoundException(`TSIC with ID "${id}" not found`);
            }

            return this.findOne(result.rows[0].code) as Promise<Tsic>;
        }

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
        if (this.postgresService.usePostgres()) {
            const existing = await this.findOne(id);
            await this.postgresService.query(`DELETE FROM tsic_codes WHERE code = $1`, [id.trim()]);
            return existing;
        }

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

    private async createPostgres(createTsicDto: CreateTsicDto): Promise<Tsic> {
        const title = createTsicDto.title.trim();
        const section = createTsicDto.section.trim().toUpperCase();

        try {
            await this.postgresService.query(
                `
                INSERT INTO tsic_codes (code, description_th, description_en, section_code)
                VALUES ($1, $2, $3, $4)
                `,
                [title, createTsicDto.description_th, createTsicDto.description_en, section],
            );

            return this.findOne(title);
        } catch (error: any) {
            throw new BadRequestException(`Failed to create TSIC: ${error.message}`);
        }
    }

    private toPostgresTsic(row: any) {
        const section = row.section_code
            ? {
                _id: row.section_code,
                title: row.section_code,
                description_th: row.section_description_th ?? '',
                description_en: row.section_description_en ?? '',
            }
            : null;

        return {
            _id: row.code,
            title: row.code,
            description_th: row.description_th,
            description_en: row.description_en,
            section,
        };
    }
}
