import { IsString, IsNotEmpty, IsMongoId } from 'class-validator';
import { PartialType } from '@nestjs/mapped-types';
import { ApiProperty } from '@nestjs/swagger';

export class CreateTsicDto {
    @ApiProperty({ example: '01' })
    @IsString()
    @IsNotEmpty()
    title: string;

    @ApiProperty({ example: 'การปลูกพืชล้มลุก' })
    @IsString()
    @IsNotEmpty()
    description_th: string;

    @ApiProperty({ example: 'Growing of non-perennial crops' })
    @IsString()
    @IsNotEmpty()
    description_en: string;

    @ApiProperty({ example: '6650a1b2c3d4e5f6a7b8c9d0', description: 'Section ObjectId' })
    @IsMongoId()
    @IsNotEmpty()
    section: string;
}

export class UpdateTsicDto extends PartialType(CreateTsicDto) { }
