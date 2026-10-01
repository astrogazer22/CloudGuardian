import { Controller, Get, Module, Query } from '@nestjs/common';
import { IsBooleanString, IsOptional, IsString } from 'class-validator';
import { RequirePermissions } from '../auth/decorators';
import { ReportsService } from './reports.service';

class ReportsQuery {
  @IsOptional() @IsString() accountId?: string;
  @IsOptional() @IsBooleanString() refresh?: string;
}

@Controller('reports')
class ReportsController {
  constructor(private reports: ReportsService) {}

  @RequirePermissions('reports:read')
  @Get()
  list(@Query() q: ReportsQuery) {
    return this.reports.get(q.accountId, q.refresh === 'true');
  }
}

@Module({
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
