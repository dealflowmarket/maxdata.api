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
import { ApiTags, ApiOperation, ApiQuery, ApiParam } from '@nestjs/swagger';
import { TsicService } from './tsic.service';
import { CreateTsicDto, UpdateTsicDto } from './tsic.dto';

@ApiTags('tsic')
@Controller('tsic')
export class TsicController {
    constructor(private readonly tsicService: TsicService) { }

    @Post()
    @HttpCode(HttpStatus.CREATED)
    @ApiOperation({ summary: 'Create a new TSIC' })
    create(@Body() createTsicDto: CreateTsicDto) {
        return this.tsicService.create(createTsicDto);
    }

    @Get()
    @ApiOperation({ summary: 'Get all TSICs' })
    @ApiQuery({ name: 'section', required: false, description: 'Filter by section ObjectId' })
    findAll(@Query('section') section?: string) {
        if (section) {
            return this.tsicService.findBySection(section);
        }
        return this.tsicService.findAll();
    }

    @Get(':id')
    @ApiOperation({ summary: 'Get a TSIC by ObjectId' })
    @ApiParam({ name: 'id', description: 'MongoDB ObjectId' })
    findOne(@Param('id') id: string) {
        return this.tsicService.findOne(id);
    }

    @Patch(':id')
    @ApiOperation({ summary: 'Update a TSIC' })
    @ApiParam({ name: 'id', description: 'MongoDB ObjectId' })
    update(@Param('id') id: string, @Body() updateTsicDto: UpdateTsicDto) {
        return this.tsicService.update(id, updateTsicDto);
    }

    @Delete(':id')
    @ApiOperation({ summary: 'Delete a TSIC' })
    @ApiParam({ name: 'id', description: 'MongoDB ObjectId' })
    remove(@Param('id') id: string) {
        return this.tsicService.remove(id);
    }
}
