import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Body, Controller, Get, HttpCode, Param, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { Role } from '@prisma/client';
import { OnlinePaymentsService } from './online-payments.service';
import { ConfirmOnlinePaymentDto, CreateOnlinePaymentDto } from './dto/online-payment.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('payments')
@Controller('payments')
export class OnlinePaymentsController {
  constructor(private readonly service: OnlinePaymentsService) {}

  // ---------- personal de caja ----------
  @ApiBearerAuth('JWT')
  @Get('providers')
  @Roles(Role.ADMIN_TI, Role.CAJERO, Role.RECEPCIONISTA)
  providers() {
    return { default: this.service.defaultProvider, enabled: this.service.enabledProviders() };
  }

  /** Genera el enlace de pago de una factura (y opcionalmente lo envía por WhatsApp/email) */
  @ApiBearerAuth('JWT')
  @Post('online')
  @Roles(Role.ADMIN_TI, Role.CAJERO, Role.RECEPCIONISTA)
  create(@Body() dto: CreateOnlinePaymentDto, @CurrentUser('id') userId: string) {
    return this.service.create(dto, userId);
  }

  @ApiBearerAuth('JWT')
  @Get('online/invoice/:invoiceId')
  @Roles(Role.ADMIN_TI, Role.CAJERO, Role.RECEPCIONISTA, Role.AUDITOR, Role.CONTADOR)
  list(@Param('invoiceId') invoiceId: string) {
    return this.service.listForInvoice(invoiceId);
  }

  // ---------- públicos (paciente / pasarela) ----------
  /** La página /pay/return del frontend llama aquí con los parámetros de la redirección */
  @Public()
  @Post('public/confirm')
  @HttpCode(200)
  confirm(@Body() dto: ConfirmOnlinePaymentDto) {
    return this.service.confirm(dto.provider, dto.params);
  }

  @Public()
  @Get('public/:clientTxId')
  status(@Param('clientTxId') clientTxId: string) {
    return this.service.publicStatus(clientTxId);
  }

  /** Webhook de Stripe (firma verificada con STRIPE_WEBHOOK_SECRET sobre el cuerpo crudo) */
  @Public()
  @Post('webhooks/:provider')
  @HttpCode(200)
  webhook(@Param('provider') provider: string, @Req() req: Request & { rawBody?: Buffer }) {
    return this.service.handleWebhook(provider, req.rawBody, req.headers as any);
  }
}
