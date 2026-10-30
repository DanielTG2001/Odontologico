import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCashClosingDto } from './dto/cash-closing.dto';
import { InvoiceStatus, PaymentMethod } from '@prisma/client';

@Injectable()
export class CashClosingService {
  constructor(private prisma: PrismaService) {}

  /**
   * RN-02: Cierre de caja ciego.
   * El cajero ingresa solo los conteos físicos.
   * Los totales del sistema se calculan y comparan DESPUÉS de guardar el conteo.
   * Nunca se muestran los totales teóricos antes de que el cajero envíe su conteo.
   */
  async createClosing(dto: CreateCashClosingDto, closedById: string) {
    const date = new Date(dto.closingDate);
    date.setHours(0, 0, 0, 0);

    const existing = await this.prisma.cashClosing.findUnique({
      where: { closingDate: date },
    });
    if (existing) {
      throw new ConflictException('Ya existe un cierre para esta fecha');
    }

    // Calcular totales del sistema (solo en backend, no se envían al cliente antes)
    const system = await this.calculateSystemTotals(date);

    const countedTotal =
      dto.countedCash +
      (dto.countedCard || 0) +
      (dto.countedTransfer || 0) +
      (dto.countedOther || 0);

    const difference = countedTotal - system.total;

    const closing = await this.prisma.cashClosing.create({
      data: {
        closingDate: date,
        countedCash: dto.countedCash,
        countedCard: dto.countedCard || 0,
        countedTransfer: dto.countedTransfer || 0,
        countedOther: dto.countedOther || 0,
        systemCash: system.cash,
        systemCard: system.card,
        systemTransfer: system.transfer,
        systemOther: system.other,
        systemTotal: system.total,
        difference,
        status: 'CLOSED',
        notes: dto.notes,
        closedById,
        closedAt: new Date(),
      },
      include: {
        closedBy: { select: { firstName: true, lastName: true } },
      },
    });

    await this.prisma.auditLog.create({
      data: {
        actorId: closedById,
        action: 'CASH_CLOSING',
        entity: 'CashClosing',
        entityId: closing.id,
        newValues: {
          date: dto.closingDate,
          countedTotal,
          systemTotal: system.total,
          difference,
        },
      },
    });

    return closing;
  }

  private async calculateSystemTotals(date: Date) {
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(date);
    end.setHours(23, 59, 59, 999);

    const payments = await this.prisma.payment.findMany({
      where: {
        paidAt: { gte: start, lte: end },
        invoice: { status: { not: InvoiceStatus.ANULADA } },
      },
    });

    let cash = 0,
      card = 0,
      transfer = 0,
      other = 0;

    for (const p of payments) {
      const amount = Number(p.amount);
      switch (p.method) {
        case PaymentMethod.EFECTIVO:
          cash += amount;
          break;
        case PaymentMethod.TARJETA_CREDITO:
        case PaymentMethod.TARJETA_DEBITO:
          card += amount;
          break;
        case PaymentMethod.TRANSFERENCIA:
          transfer += amount;
          break;
        default:
          other += amount;
      }
    }

    return {
      cash,
      card,
      transfer,
      other,
      total: cash + card + transfer + other,
    };
  }

  /**
   * Solo para roles de auditoría/admin: ver totales del sistema
   * ANTES de que el cajero cierre (no se expone a recepcionistas).
   */
  async getSystemTotalsPreview(date: string) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return this.calculateSystemTotals(d);
  }

  findByDate(date: string) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return this.prisma.cashClosing.findUnique({
      where: { closingDate: d },
      include: {
        closedBy: { select: { firstName: true, lastName: true } },
      },
    });
  }

  findAll() {
    return this.prisma.cashClosing.findMany({
      orderBy: { closingDate: 'desc' },
      take: 60,
      include: {
        closedBy: { select: { firstName: true, lastName: true } },
      },
    });
  }
}
