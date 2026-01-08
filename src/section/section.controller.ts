import {
    Controller,
    Get,
    Post,
    Body,
    Patch,
    Param,
    Delete,
    HttpCode,
    HttpStatus,
} from '@nestjs/common';
import { SectionService } from './section.service';
import { CreateSectionDto, UpdateSectionDto } from './section.dto';

@Controller('section')
export class SectionController {
    constructor(private readonly sectionService: SectionService) { }

    @Post()
    @HttpCode(HttpStatus.CREATED)
    create(@Body() createSectionDto: CreateSectionDto) {
        return this.sectionService.create(createSectionDto);
    }

    @Get()
    findAll() {
        return this.sectionService.findAll();
    }

    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.sectionService.findOne(id);
    }

    @Patch(':id')
    update(@Param('id') id: string, @Body() updateSectionDto: UpdateSectionDto) {
        return this.sectionService.update(id, updateSectionDto);
    }

    @Delete(':id')
    remove(@Param('id') id: string) {
        return this.sectionService.remove(id);
    }
}
