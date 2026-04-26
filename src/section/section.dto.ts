import { IsString, IsNotEmpty } from 'class-validator';
import { PartialType } from '@nestjs/mapped-types';

export class CreateSectionDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsNotEmpty()
  description_th: string;

  @IsString()
  @IsNotEmpty()
  description_en: string;
}

export class UpdateSectionDto extends PartialType(CreateSectionDto) {}
