import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { BillingService } from './billing.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { CreatePaymentDto, CreateMixedPaymentDto } from './dto/create-payment.dto';
import { QueryInvoicesDto } from './dto/query-invoices.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '@prisma/client';

@ApiTags('billing')
@ApiBearerAuth('JWT')
@Controller('billing')
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  // ---------- Facturas ----------

  @Post('invoices')
  @Roles(Role.ADMIN_TI, Role.RECEPCIONISTA, Role.CAJERO)
  createInvoice(
    @Body() dto: CreateInvoiceDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.billingService.createInvoice(dto, userId);
  }

  @Get('invoices')
  @Roles(
    Role.ADMIN_TI,
    Role.RECEPCIONISTA,
    Role.CAJERO,
    Role.AUDITOR,
    Role.CONTADOR,
  )
  findAll(@Query() query: QueryInvoicesDto) {
    return this.billingService.findAll(query);
  }

  @Get('invoices/:id')
  @Roles(
    Role.ADMIN_TI,
    Role.RECEPCIONISTA,
    Role.CAJERO,
    Role.AUDITOR,
    Role.CONTADOR,
  )
  findOne(@Param('id') id: string) {
    return this.billingService.findOne(id);
  }

  @Patch('invoices/:id/issue')
  @Roles(Role.ADMIN_TI, Role.RECEPCIONISTA, Role.CAJERO)
  issueInvoice(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.billingService.issueInvoice(id, userId);
  }

  @Patch('invoices/:id/cancel')
  @Roles(Role.ADMIN_TI, Role.CAJERO)
  cancelInvoice(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.billingService.cancelInvoice(id, userId);
  }

  // ---------- Pagos ----------

  @Post('invoices/:id/payments')
  @Roles(Role.ADMIN_TI, Role.RECEPCIONISTA, Role.CAJERO)
  addPayment(
    @Param('id') id: string,
    @Body() dto: CreatePaymentDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.billingService.addPayment(id, dto, userId);
  }

  @Post('invoices/:id/payments/mixed')
  @Roles(Role.ADMIN_TI, Role.RECEPCIONISTA, Role.CAJERO)
  addMixedPayments(
    @Param('id') id: string,
    @Body() dto: CreateMixedPaymentDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.billingService.addMixedPayments(id, dto.payments, userId);
  }

  // ---------- Cierre de caja ----------

  @Get('cash-summary')
  // RN-02: el cajero NO puede ver el total teórico antes del conteo ciego
  @Roles(Role.ADMIN_TI, Role.AUDITOR, Role.CONTADOR)
  getDailyCashSummary(@Query('date') date: string) {
    const targetDate = date || new Date().toISOString().slice(0, 10);
    return this.billingService.getDailyCashSummary(targetDate);
  }
}
