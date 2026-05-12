import {
    IsString,
    IsNotEmpty,
    IsMongoId,
    IsOptional,
    IsDate,
    IsNumber,
    IsArray,
} from 'class-validator';
import { PartialType } from '@nestjs/mapped-types';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateBusinessDto {
    @ApiProperty({ example: 'บริษัท ตัวอย่าง จำกัด' })
    @IsString()
    @IsNotEmpty()
    name: string;

    @ApiProperty({ example: 'บริษัทจำกัด' })
    @IsString()
    @IsNotEmpty()
    type: string;

    @ApiProperty({ example: 'active' })
    @IsString()
    @IsNotEmpty()
    status: string;

    @ApiProperty({ example: 105543012345 })
    @IsNumber()
    @IsNotEmpty()
    businessid: number;

    @ApiPropertyOptional({ example: '2010-01-15' })
    @IsOptional()
    @Type(() => Date)
    @IsDate()
    reg_date?: Date;

    @ApiPropertyOptional({ example: 1000000 })
    @IsOptional()
    @IsNumber()
    reg_cap?: number;

    @ApiPropertyOptional({ example: 'ห.1234/2553' })
    @IsOptional()
    @IsString()
    regno_old?: string;

    @ApiPropertyOptional({ example: '6650a1b2c3d4e5f6a7b8c9d0', description: 'Section ObjectId' })
    @IsOptional()
    @IsMongoId()
    section?: string;

    @ApiPropertyOptional({ example: 'S' })
    @IsOptional()
    @IsString()
    size?: string;

    @ApiPropertyOptional({ example: [2020, 2021, 2022] })
    @IsOptional()
    @IsArray()
    @IsNumber({}, { each: true })
    years?: number[];

    @ApiPropertyOptional({ example: '123 ถนนสุขุมวิท กรุงเทพฯ' })
    @IsOptional()
    @IsString()
    address?: string;

    @ApiPropertyOptional({ example: 'https://example.co.th' })
    @IsOptional()
    @IsString()
    website?: string;

    @ApiPropertyOptional({ example: ['สมชาย ใจดี', 'สมหญิง รักดี'] })
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    directors?: string[];

    @ApiProperty({ example: '6650a1b2c3d4e5f6a7b8c9d1', description: 'TSIC ObjectId' })
    @IsMongoId()
    @IsNotEmpty()
    tsic: string;

    @ApiPropertyOptional({ example: [500000, 600000, 700000] })
    @IsOptional()
    @IsArray()
    @IsNumber({}, { each: true })
    net_trade_receivables?: number[];

    @ApiPropertyOptional({ example: [100000, 120000, 150000] })
    @IsOptional()
    @IsArray()
    @IsNumber({}, { each: true })
    inventories?: number[];

    @ApiPropertyOptional({ example: [1000000, 1200000, 1500000] })
    @IsOptional()
    @IsArray()
    @IsNumber({}, { each: true })
    current_assets?: number[];

    @ApiPropertyOptional({ example: [2000000, 2100000, 2200000] })
    @IsOptional()
    @IsArray()
    @IsNumber({}, { each: true })
    land_buildings_equipment?: number[];

    @ApiPropertyOptional({ example: [3000000, 3100000, 3200000] })
    @IsOptional()
    @IsArray()
    @IsNumber({}, { each: true })
    non_current_assets?: number[];

    @ApiPropertyOptional({ example: [4000000, 4300000, 4700000] })
    @IsOptional()
    @IsArray()
    @IsNumber({}, { each: true })
    total_assets?: number[];

    @ApiPropertyOptional({ example: [800000, 900000, 1000000] })
    @IsOptional()
    @IsArray()
    @IsNumber({}, { each: true })
    current_liabilities?: number[];

    @ApiPropertyOptional({ example: [500000, 600000, 700000] })
    @IsOptional()
    @IsArray()
    @IsNumber({}, { each: true })
    non_current_liabilities?: number[];

    @ApiPropertyOptional({ example: [1300000, 1500000, 1700000] })
    @IsOptional()
    @IsArray()
    @IsNumber({}, { each: true })
    total_liabilities?: number[];

    @ApiPropertyOptional({ example: [2700000, 2800000, 3000000] })
    @IsOptional()
    @IsArray()
    @IsNumber({}, { each: true })
    shareholders_equity?: number[];

    @ApiPropertyOptional({ example: [4000000, 4300000, 4700000] })
    @IsOptional()
    @IsArray()
    @IsNumber({}, { each: true })
    total_liabilities_and_equity?: number[];

    @ApiPropertyOptional({ example: [5000000, 5500000, 6000000] })
    @IsOptional()
    @IsArray()
    @IsNumber({}, { each: true })
    main_revenue?: number[];

    @ApiPropertyOptional({ example: [5200000, 5700000, 6200000] })
    @IsOptional()
    @IsArray()
    @IsNumber({}, { each: true })
    total_revenue?: number[];

    @ApiPropertyOptional({ example: [3000000, 3200000, 3500000] })
    @IsOptional()
    @IsArray()
    @IsNumber({}, { each: true })
    cost_of_goods_sold?: number[];

    @ApiPropertyOptional({ example: [2200000, 2500000, 2700000] })
    @IsOptional()
    @IsArray()
    @IsNumber({}, { each: true })
    gross_profit?: number[];

    @ApiPropertyOptional({ example: [800000, 900000, 1000000] })
    @IsOptional()
    @IsArray()
    @IsNumber({}, { each: true })
    selling_admin_expenses?: number[];

    @ApiPropertyOptional({ example: [3800000, 4100000, 4500000] })
    @IsOptional()
    @IsArray()
    @IsNumber({}, { each: true })
    total_expenses?: number[];

    @ApiPropertyOptional({ example: [100000, 90000, 80000] })
    @IsOptional()
    @IsArray()
    @IsNumber({}, { each: true })
    interest_expenses?: number[];

    @ApiPropertyOptional({ example: [1300000, 1500000, 1700000] })
    @IsOptional()
    @IsArray()
    @IsNumber({}, { each: true })
    profit_before_tax?: number[];

    @ApiPropertyOptional({ example: [260000, 300000, 340000] })
    @IsOptional()
    @IsArray()
    @IsNumber({}, { each: true })
    income_tax?: number[];

    @ApiPropertyOptional({ example: [1040000, 1200000, 1360000] })
    @IsOptional()
    @IsArray()
    @IsNumber({}, { each: true })
    net_profit?: number[];
}

export class UpdateBusinessDto extends PartialType(CreateBusinessDto) { }
