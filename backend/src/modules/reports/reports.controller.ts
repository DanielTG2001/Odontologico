import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Controller, Get, Query } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '@prisma/client';

@ApiTags('reports')
@ApiBearerAuth('JWT')
@Controller('reports')
export class ReportsController {
  constructor(private readonly service: ReportsService) {}

  @Get('dashboard')
  @Roles(Role.ADMIN_TI, Role.AUDITOR, Role.CONTADOR)
  dashboard(
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    const f = from || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const t = to || new Date().toISOString().slice(0, 10);
    return this.service.dashboard(f, t);
  }

  @Get('appointments-by-doctor')
  @Roles(Role.ADMIN_TI, Role.AUDITOR, Role.CONTADOR)
  byDoctor(@Query('from') from: string, @Query('to') to: string) {
    const f = from || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const t = to || new Date().toISOString().slice(0, 10);
    return this.service.appointmentsByDoctor(f, t);
  }

  @Get('top-procedures')
  @Roles(Role.ADMIN_TI, Role.AUDITOR, Role.CONTADOR, Role.ODONTOLOGO)
  topProcedures(
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('limit') limit?: string,
  ) {
    const f = from || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const t = to || new Date().toISOString().slice(0, 10);
    return this.service.topProcedures(f, t, limit ? Number(limit) : 10);
  }

  @Get('inventory')
  @Roles(Role.ADMIN_TI, Role.AUDITOR, Role.CONTADOR)
  inventory() {
    return this.service.inventoryStatus();
  }
}
