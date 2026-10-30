import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { CashClosingService } from './cash-closing.service';
import { CreateCashClosingDto } from './dto/cash-closing.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '@prisma/client';

@ApiTags('cash-closing')
@ApiBearerAuth('JWT')
@Controller('cash-closing')
export class CashClosingController {
  constructor(private readonly service: CashClosingService) {}

  /**
   * El cajero envía SOLO su conteo físico.
   * El sistema calcula la diferencia y la devuelve en la respuesta.
   * RN-02: no hay endpoint que le muestre los totales teóricos antes.
   */
  @Post()
  @Roles(Role.CAJERO, Role.RECEPCIONISTA, Role.ADMIN_TI)
  create(
    @Body() dto: CreateCashClosingDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.createClosing(dto, userId);
  }

  /** Solo Admin/Auditor/Contador pueden ver totales del sistema sin haber cerrado */
  @Get('system-preview')
  @Roles(Role.ADMIN_TI, Role.AUDITOR, Role.CONTADOR)
  systemPreview(@Query('date') date: string) {
    return this.service.getSystemTotalsPreview(
      date || new Date().toISOString().slice(0, 10),
    );
  }

  @Get()
  @Roles(Role.ADMIN_TI, Role.CAJERO, Role.AUDITOR, Role.CONTADOR)
  findAll() {
    return this.service.findAll();
  }

  @Get('by-date')
  @Roles(Role.ADMIN_TI, Role.CAJERO, Role.AUDITOR, Role.CONTADOR)
  findByDate(@Query('date') date: string) {
    return this.service.findByDate(date);
  }
}
