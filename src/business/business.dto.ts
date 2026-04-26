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

export class CreateBusinessDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  type: string;

  @IsString()
  @IsNotEmpty()
  status: string;

  @IsNumber()
  @IsNotEmpty()
  businessid: number;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  reg_date?: Date;

  @IsOptional()
  @IsNumber()
  reg_cap?: number;

  @IsOptional()
  @IsString()
  regno_old?: string;

  @IsOptional()
  @IsMongoId()
  section?: string;

  @IsOptional()
  @IsString()
  size?: string;

  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  years?: number[];

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  website?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  directors?: string[];

  @IsMongoId()
  @IsNotEmpty()
  tsic: string;

  // Financial data arrays
  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  net_trade_receivables?: number[];

  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  inventories?: number[];

  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  current_assets?: number[];

  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  land_buildings_equipment?: number[];

  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  non_current_assets?: number[];

  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  total_assets?: number[];

  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  current_liabilities?: number[];

  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  non_current_liabilities?: number[];

  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  total_liabilities?: number[];

  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  shareholders_equity?: number[];

  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  total_liabilities_and_equity?: number[];

  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  main_revenue?: number[];

  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  total_revenue?: number[];

  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  cost_of_goods_sold?: number[];

  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  gross_profit?: number[];

  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  selling_admin_expenses?: number[];

  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  total_expenses?: number[];

  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  interest_expenses?: number[];

  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  profit_before_tax?: number[];

  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  income_tax?: number[];

  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  net_profit?: number[];
}

export class UpdateBusinessDto extends PartialType(CreateBusinessDto) {}
