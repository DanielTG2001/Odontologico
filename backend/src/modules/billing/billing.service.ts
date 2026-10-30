import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { QueryInvoicesDto } from './dto/query-invoices.dto';
import { InvoiceStatus, Prisma } from '@prisma/client';

@Injectable()
export class BillingService {
  constructor(private prisma: PrismaService) {}

  // ==================== CREATE INVOICE (POS) ====================
  async createInvoice(dto: CreateInvoiceDto, createdById: string) {
    const patient = await this.prisma.patient.findUnique({
      where: { id: dto.patientId },
    });
    if (!patient || !patient.isActive) {
      throw new NotFoundException('Paciente no encontrado');
    }

    if (!dto.items || dto.items.length === 0) {
      throw new BadRequestException('La factura debe tener al menos un ítem');
    }

    // Calcular totales
    const subtotal = dto.items.reduce(
      (sum, item) => sum + item.quantity * item.unitPrice,
      0,
    );
    const discount = dto.discount || 0;
    const tax = dto.tax || 0;
    const total = subtotal - discount + tax;

    if (total < 0) {
      throw new BadRequestException('El total no puede ser negativo');
    }

    // Generar número de factura simple (en prod: secuencia fiscal)
    const count = await this.prisma.invoice.count();
    const number = `FAC-${String(count + 1).padStart(6, '0')}`;

    const invoice = await this.prisma.invoice.create({
      data: {
        number,
        patientId: dto.patientId,
        createdById,
        status: InvoiceStatus.BORRADOR,
        subtotal,
        discount,
        tax,
        total,
        items: {
          create: dto.items.map((item) => ({
            description: item.description,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            total: item.quantity * item.unitPrice,
          })),
        },
      },
      include: {
        patient: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            documentNumber: true,
          },
        },
        items: true,
        payments: true,
        createdBy: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });

    await this.prisma.auditLog.create({
      data: {
        actorId: createdById,
        action: 'CREATE',
        entity: 'Invoice',
        entityId: invoice.id,
        newValues: { number, total, patientId: dto.patientId },
      },
    });

    return invoice;
  }

  // ==================== ISSUE INVOICE (emitir) ====================
  async issueInvoice(id: string, actorId: string) {
    const invoice = await this.findOne(id);

    if (invoice.status !== InvoiceStatus.BORRADOR) {
      throw new BadRequestException('Solo se pueden emitir facturas en borrador');
    }

    const updated = await this.prisma.invoice.update({
      where: { id },
      data: {
        status: InvoiceStatus.EMITIDA,
        issuedAt: new Date(),
        // Aquí iría la integración con el PAC fiscal (timbrado)
        // fiscalData: { uuid: '...', ... }
      },
      include: {
        patient: {
          select: { id: true, firstName: true, lastName: true, documentNumber: true },
        },
        items: true,
        payments: true,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        actorId,
        action: 'ISSUE',
        entity: 'Invoice',
        entityId: id,
      },
    });

    return updated;
  }

  // ==================== ADD PAYMENT ====================
  async addPayment(invoiceId: string, dto: CreatePaymentDto, actorId: string) {
    const invoice = await this.findOne(invoiceId);

    if (
      invoice.status === InvoiceStatus.ANULADA ||
      invoice.status === InvoiceStatus.PAGADA
    ) {
      throw new BadRequestException(
        `No se pueden registrar pagos en facturas ${invoice.status}`,
      );
    }

    if (invoice.status === InvoiceStatus.BORRADOR) {
      throw new BadRequestException(
        'Primero debe emitir la factura antes de registrar pagos',
      );
    }

    const paidSoFar = invoice.payments.reduce(
      (sum, p) => sum + Number(p.amount),
      0,
    );
    const remaining = Number(invoice.total) - paidSoFar;

    if (dto.amount > remaining + 0.01) {
      // tolerancia de centavos
      throw new BadRequestException(
        `El monto supera el saldo pendiente ($${remaining.toFixed(2)})`,
      );
    }

    const payment = await this.prisma.payment.create({
      data: {
        invoiceId,
        method: dto.method,
        amount: dto.amount,
        reference: dto.reference,
        notes: dto.notes,
      },
    });

    const newPaidTotal = paidSoFar + dto.amount;
    let newStatus: InvoiceStatus = InvoiceStatus.PARCIAL;

    if (newPaidTotal >= Number(invoice.total) - 0.01) {
      newStatus = InvoiceStatus.PAGADA;
    }

    await this.prisma.invoice.update({
      where: { id: invoiceId },
      data: { status: newStatus },
    });

    await this.prisma.auditLog.create({
      data: {
        actorId,
        action: 'PAYMENT',
        entity: 'Invoice',
        entityId: invoiceId,
        newValues: {
          method: dto.method,
          amount: dto.amount,
          newStatus,
        },
      },
    });

    return this.findOne(invoiceId);
  }

  // ==================== MIXED PAYMENTS (varios métodos a la vez) ====================
  async addMixedPayments(
    invoiceId: string,
    payments: CreatePaymentDto[],
    actorId: string,
  ) {
    if (!payments || payments.length === 0) {
      throw new BadRequestException('Debe enviar al menos un pago');
    }

    let result;
    for (const p of payments) {
      result = await this.addPayment(invoiceId, p, actorId);
    }
    return result;
  }

  // ==================== CANCEL INVOICE ====================
  async cancelInvoice(id: string, actorId: string) {
    const invoice = await this.findOne(id);

    if (invoice.status === InvoiceStatus.PAGADA) {
      throw new BadRequestException(
        'No se puede anular una factura ya pagada. Genere una nota de crédito.',
      );
    }

    const updated = await this.prisma.invoice.update({
      where: { id },
      data: { status: InvoiceStatus.ANULADA },
      include: {
        patient: {
          select: { id: true, firstName: true, lastName: true },
        },
        items: true,
        payments: true,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        actorId,
        action: 'CANCEL',
        entity: 'Invoice',
        entityId: id,
      },
    });

    return updated;
  }

  // ==================== FIND ====================
  async findAll(query: QueryInvoicesDto) {
    const where: Prisma.InvoiceWhereInput = {};

    if (query.patientId) where.patientId = query.patientId;
    if (query.status) where.status = query.status;
    if (query.from || query.to) {
      where.createdAt = {};
      if (query.from) where.createdAt.gte = new Date(query.from);
      if (query.to) where.createdAt.lte = new Date(query.to);
    }

    return this.prisma.invoice.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        patient: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            documentNumber: true,
          },
        },
        payments: true,
        createdBy: {
          select: { id: true, firstName: true, lastName: true },
        },
        items: true,
      },
    });
  }

  async findOne(id: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      include: {
        patient: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            documentNumber: true,
            phone: true,
            email: true,
          },
        },
        items: true,
        payments: true,
        createdBy: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });

    if (!invoice) {
      throw new NotFoundException('Factura no encontrada');
    }

    return invoice;
  }

  // ==================== DAILY CASH SUMMARY (para cierre de caja) ====================
  async getDailyCashSummary(date: string) {
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(date);
    end.setHours(23, 59, 59, 999);

    const payments = await this.prisma.payment.findMany({
      where: {
        paidAt: { gte: start, lte: end },
        invoice: { status: { not: InvoiceStatus.ANULADA } },
      },
      include: {
        invoice: {
          select: { number: true, patient: { select: { firstName: true, lastName: true } } },
        },
      },
    });

    const byMethod: Record<string, number> = {};
    let total = 0;

    for (const p of payments) {
      const method = p.method;
      const amount = Number(p.amount);
      byMethod[method] = (byMethod[method] || 0) + amount;
      total += amount;
    }

    return {
      date,
      total,
      byMethod,
      paymentsCount: payments.length,
      payments,
    };
  }
}
