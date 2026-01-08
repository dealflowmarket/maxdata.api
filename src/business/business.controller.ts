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

    @Get('list')
    list(@Query('tsic') tsic?: string) {
        return this.businessService.list(tsic);
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
