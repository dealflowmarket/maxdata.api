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
import { ApiTags, ApiOperation, ApiParam } from '@nestjs/swagger';
import { SectionService } from './section.service';
import { CreateSectionDto, UpdateSectionDto } from './section.dto';

@ApiTags('section')
@Controller('section')
export class SectionController {
    constructor(private readonly sectionService: SectionService) { }

    @Post()
    @HttpCode(HttpStatus.CREATED)
    @ApiOperation({ summary: 'Create a new section' })
    create(@Body() createSectionDto: CreateSectionDto) {
        return this.sectionService.create(createSectionDto);
    }

    @Get()
    @ApiOperation({ summary: 'Get all sections' })
    findAll() {
        return this.sectionService.findAll();
    }

    @Get(':id')
    @ApiOperation({ summary: 'Get a section by ObjectId' })
    @ApiParam({ name: 'id', description: 'MongoDB ObjectId' })
    findOne(@Param('id') id: string) {
        return this.sectionService.findOne(id);
    }

    @Patch(':id')
    @ApiOperation({ summary: 'Update a section' })
    @ApiParam({ name: 'id', description: 'MongoDB ObjectId' })
    update(@Param('id') id: string, @Body() updateSectionDto: UpdateSectionDto) {
        return this.sectionService.update(id, updateSectionDto);
    }

    @Delete(':id')
    @ApiOperation({ summary: 'Delete a section' })
    @ApiParam({ name: 'id', description: 'MongoDB ObjectId' })
    remove(@Param('id') id: string) {
        return this.sectionService.remove(id);
    }
}
