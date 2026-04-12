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
import { BusinessService } from './business.service';
import { CreateBusinessDto, UpdateBusinessDto } from './business.dto';

@Controller('business')
export class BusinessController {
    constructor(private readonly businessService: BusinessService) { }

    @Post()
    @HttpCode(HttpStatus.CREATED)
    create(@Body() createBusinessDto: CreateBusinessDto) {
        return this.businessService.create(createBusinessDto);
    }

    @Post('upsert')
    @HttpCode(HttpStatus.OK)
    upsert(@Body() createBusinessDto: CreateBusinessDto) {
        return this.businessService.upsert(createBusinessDto);
    }

    @Get('list')
    list(@Query('tsic') tsic?: string) {
        return this.businessService.list(tsic);
    }

    @Get('search')
    search(
        @Query('search') search?: string,
        @Query('type') type?: string,
        @Query('status') status?: string,
        @Query('section') section?: string,
        @Query('tsic') tsic?: string,
        @Query('page') page?: string,
        @Query('limit') limit?: string,
        @Query('sortBy') sortBy?: string,
        @Query('sortOrder') sortOrder?: string,
    ) {
        return this.businessService.search({
            search,
            type,
            status,
            section,
            tsic,
            page,
            limit,
            sortBy,
            sortOrder,
        });
    }

    @Get('top')
    top(
        @Query('metric') metric: 'revenue' | 'profit' | 'roe',
        @Query('limit') limit?: string,
        @Query('section') section?: string,
    ) {
        return this.businessService.top(metric, Number(limit) || 6, section);
    }

    @Get()
    findAll(@Query('tsic') tsic?: string) {
        if (tsic) {
            return this.businessService.findByTsic(tsic);
        }
        return this.businessService.findAll();
    }

    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.businessService.findOne(id);
    }

    @Patch(':id')
    update(@Param('id') id: string, @Body() updateBusinessDto: UpdateBusinessDto) {
        return this.businessService.update(id, updateBusinessDto);
    }

    @Delete(':id')
    remove(@Param('id') id: string) {
        return this.businessService.remove(id);
    }
}
