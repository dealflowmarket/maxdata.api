import { IsString, IsNotEmpty, IsMongoId } from 'class-validator';
import { PartialType } from '@nestjs/mapped-types';

export class CreateTsicDto {
    @IsString()
    @IsNotEmpty()
    title: string;

    @IsString()
    @IsNotEmpty()
    description_th: string;

    @IsString()
    @IsNotEmpty()
    description_en: string;

    @IsMongoId()
    @IsNotEmpty()
    section: string;
}

export class UpdateTsicDto extends PartialType(CreateTsicDto) { }
