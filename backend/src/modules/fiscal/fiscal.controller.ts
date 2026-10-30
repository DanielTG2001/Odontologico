import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Controller, Get, Header, Param, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { FiscalService } from './fiscal.service';
import { SriInvoicingService } from './sri-invoicing.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '@prisma/client';

const BILLING = [Role.ADMIN_TI, Role.CAJERO, Role.RECEPCIONISTA];
const READ = [Role.ADMIN_TI, Role.CAJERO, Role.RECEPCIONISTA, Role.AUDITOR, Role.CONTADOR];

@ApiTags('fiscal')
@ApiBearerAuth('JWT')
@Controller('fiscal')
export class FiscalController {
  constructor(
    private readonly service: FiscalService,
    private readonly sri: SriInvoicingService,
  ) {}

  /** Envía la factura al SRI (o timbrado mock) y devuelve el estado del comprobante */
  @Post('invoices/:id/stamp')
  @Roles(...BILLING)
  stamp(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.service.stampInvoice(id, userId);
  }

  @Get('config')
  @Roles(...READ)
  config() {
    const provider = this.service.provider;
    return {
      provider,
      environment: provider === 'sri-simulado' ? 'SIMULADO' : this.sri.environment === '2' ? 'PRODUCCION' : 'PRUEBAS',
    };
  }

  @Get('invoices/:id/documents')
  @Roles(...READ)
  documents(@Param('id') id: string) {
    return this.sri.listForInvoice(id);
  }

  /** Reintento manual (además del cron cada 10 min) */
  @Post('documents/:id/retry')
  @Roles(...BILLING)
  retry(@Param('id') id: string) {
    return this.sri.process(id);
  }

  @Get('documents/:id/xml')
  @Roles(...READ)
  async xml(@Param('id') id: string, @Res() res: Response) {
    const { fileName, xml } = await this.sri.getXml(id);
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(xml);
  }

  /** RIDE imprimible (HTML) */
  @Get('documents/:id/ride')
  @Roles(...READ)
  @Header('Content-Type', 'text/html; charset=utf-8')
  ride(@Param('id') id: string) {
    return this.sri.getRide(id);
  }

  @Post('jobs/retry-pending')
  @Roles(Role.ADMIN_TI)
  retryPending() {
    return this.sri.retryPending();
  }
}
