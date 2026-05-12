import { IsString, IsNotEmpty } from 'class-validator';
import { PartialType } from '@nestjs/mapped-types';
import { ApiProperty } from '@nestjs/swagger';

export class CreateSectionDto {
    @ApiProperty({ example: 'A' })
    @IsString()
    @IsNotEmpty()
    title: string;

    @ApiProperty({ example: 'เกษตรกรรม การป่าไม้ และการประมง' })
    @IsString()
    @IsNotEmpty()
    description_th: string;

    @ApiProperty({ example: 'Agriculture, Forestry and Fishing' })
    @IsString()
    @IsNotEmpty()
    description_en: string;
}

export class UpdateSectionDto extends PartialType(CreateSectionDto) { }
