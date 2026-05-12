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
import { BusinessService } from './business.service';
import { CreateBusinessDto, UpdateBusinessDto } from './business.dto';

@ApiTags('business')
@Controller('business')
export class BusinessController {
    constructor(private readonly businessService: BusinessService) { }

    @Post()
    @HttpCode(HttpStatus.CREATED)
    @ApiOperation({ summary: 'Create a new business' })
    create(@Body() createBusinessDto: CreateBusinessDto) {
        return this.businessService.create(createBusinessDto);
    }

    @Get()
    @ApiOperation({ summary: 'Get businesses (paginated, optionally filtered by TSIC)' })
    @ApiQuery({ name: 'tsic', required: false, description: 'Filter by TSIC ObjectId' })
    @ApiQuery({ name: 'page', required: false, description: 'Page number (default: 1)' })
    @ApiQuery({ name: 'limit', required: false, description: 'Items per page (default: 10)' })
    findAll(
        @Query('tsic') tsic?: string,
        @Query('page') page = 1,
        @Query('limit') limit = 10,
    ) {
        return this.businessService.findAll(tsic, +page, +limit);
    }

    @Get(':id')
    @ApiOperation({ summary: 'Get a business by MongoDB ObjectId' })
    @ApiParam({ name: 'id', description: 'MongoDB ObjectId' })
    findOne(@Param('id') id: string) {
        return this.businessService.findOne(id);
    }

    @Patch(':id')
    @ApiOperation({ summary: 'Update a business' })
    @ApiParam({ name: 'id', description: 'MongoDB ObjectId' })
    update(@Param('id') id: string, @Body() updateBusinessDto: UpdateBusinessDto) {
        return this.businessService.update(id, updateBusinessDto);
    }

    @Delete(':id')
    @ApiOperation({ summary: 'Delete a business' })
    @ApiParam({ name: 'id', description: 'MongoDB ObjectId' })
    remove(@Param('id') id: string) {
        return this.businessService.remove(id);
    }
}
