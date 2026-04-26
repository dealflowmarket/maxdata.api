import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { TsicService } from './tsic.service';
import { CreateTsicDto, UpdateTsicDto } from './tsic.dto';

@Controller('tsic')
export class TsicController {
  constructor(private readonly tsicService: TsicService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() createTsicDto: CreateTsicDto) {
    return this.tsicService.create(createTsicDto);
  }

  @Get()
  findAll(@Query('section') section?: string) {
    if (section) {
      return this.tsicService.findBySection(section);
    }
    return this.tsicService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.tsicService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateTsicDto: UpdateTsicDto) {
    return this.tsicService.update(id, updateTsicDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.tsicService.remove(id);
  }
}
