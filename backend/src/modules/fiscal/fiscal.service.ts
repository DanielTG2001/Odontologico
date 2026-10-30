import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MockFiscalProvider } from './mock-fiscal.provider';
import { InvoiceStatus } from '@prisma/client';
import { SriInvoicingService } from './sri-invoicing.service';

/**
 * Punto de entrada fiscal.
 *  FISCAL_PROVIDER=sri  → facturación electrónica real con el SRI de Ecuador
 *  FISCAL_PROVIDER=mock → timbrado simulado (desarrollo)
 */
@Injectable()
export class FiscalService {
  constructor(
    private prisma: PrismaService,
    private mock: MockFiscalProvider,
    private sri: SriInvoicingService,
  ) {}

  /** sri = real · sri-simulado = flujo SRI completo sin firma ni conexión (por defecto) · mock = timbrado mínimo heredado */
  get provider(): 'sri' | 'sri-simulado' | 'mock' {
    const p = (process.env.FISCAL_PROVIDER || 'sri-simulado').toLowerCase();
    return p === 'sri' || p === 'mock' ? p : 'sri-simulado';
  }

  private getProvider() {
    return this.mock;
  }

  async stampInvoice(invoiceId: string, actorId: string) {
    if (this.provider !== 'mock') {
      const res = await this.sri.emit(invoiceId, actorId);
      const invoice = await this.prisma.invoice.findUnique({ where: { id: invoiceId } });
      return { invoice, provider: this.provider, ...res };
    }
    return this.stampMock(invoiceId, actorId);
  }

  private async stampMock(invoiceId: string, actorId: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        items: true,
        patient: true,
      },
    });
    if (!invoice) throw new NotFoundException('Factura no encontrada');
    if (invoice.status === InvoiceStatus.ANULADA) {
      throw new BadRequestException('No se puede timbrar una factura anulada');
    }
    if (invoice.status === InvoiceStatus.BORRADOR) {
      throw new BadRequestException('Emita la factura antes de timbrar');
    }

    const result = await this.getProvider().stamp({
      invoiceId: invoice.id,
      number: invoice.number,
      total: Number(invoice.total),
      subtotal: Number(invoice.subtotal),
      tax: Number(invoice.tax),
      patientDocument: invoice.patient.documentNumber,
      patientName: `${invoice.patient.firstName} ${invoice.patient.lastName}`,
      items: invoice.items.map((i) => ({
        description: i.description,
        quantity: i.quantity,
        unitPrice: Number(i.unitPrice),
      })),
    });

    if (!result.success) {
      throw new BadRequestException(result.error || 'Error de timbrado');
    }

    const updated = await this.prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        fiscalData: result as any,
        status:
          (invoice.status as string) === 'BORRADOR'
            ? InvoiceStatus.EMITIDA
            : invoice.status,
        issuedAt: invoice.issuedAt || new Date(),
      },
    });

    await this.prisma.auditLog.create({
      data: {
        actorId,
        action: 'FISCAL_STAMP',
        entity: 'Invoice',
        entityId: invoiceId,
        newValues: { uuid: result.uuid, provider: result.provider },
      },
    });

    return { invoice: updated, stamp: result };
  }
}
