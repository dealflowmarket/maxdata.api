import { Controller, Get, Param, Query } from '@nestjs/common';
import { CompanyService } from './company.service';

@Controller('company')
export class CompanyController {
  constructor(private readonly companyService: CompanyService) {}

  @Get()
  browse(
    @Query('q') q?: string,
    @Query('section') section?: string,
    @Query('tsic') tsic?: string,
    @Query('sort') sort?: string,
    @Query('order') order?: string,
    @Query('page') page = '1',
    @Query('limit') limit = '24',
    @Query('status') status?: string,
    @Query('has_financials') hasFinancials?: string,
  ) {
    return this.companyService.list({
      q,
      section,
      tsic,
      sort,
      order,
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      status,
      hasFinancials,
    });
  }

  @Get('search')
  search(
    @Query('q') q: string,
    @Query('limit') limit = '20',
    @Query('offset') offset = '0',
    @Query('sort') sort?: string,
    @Query('order') order?: string,
    @Query('section') section?: string,
    @Query('tsic') tsic?: string,
    @Query('status') status?: string,
    @Query('has_financials') hasFinancials?: string,
  ) {
    return this.companyService.search({
      q: q || '',
      limit: parseInt(limit, 10),
      offset: parseInt(offset, 10),
      sort,
      order,
      section,
      tsic,
      status,
      hasFinancials,
    });
  }

  @Get('leaderboard/:metric')
  leaderboard(
    @Param('metric') metric: string,
    @Query('limit') limit = '20',
    @Query('section') section?: string,
    @Query('tsic') tsic?: string,
  ) {
    return this.companyService.leaderboard(
      metric,
      parseInt(limit, 10),
      section,
      tsic,
    );
  }

  @Get('sections')
  sections() {
    return this.companyService.sections();
  }

  @Get('tsics')
  tsics(@Query('section') section?: string) {
    return this.companyService.tsics(section);
  }

  @Get('stats')
  stats() {
    return this.companyService.stats();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.companyService.findOne(id);
  }
}
