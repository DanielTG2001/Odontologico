import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AppointmentStatus, InvoiceStatus } from '@prisma/client';

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  async dashboard(from: string, to: string) {
    const start = new Date(from);
    const end = new Date(to);
    end.setHours(23, 59, 59, 999);

    const [
      appointmentsCount,
      attendedCount,
      noShowCount,
      invoices,
      payments,
      newPatients,
    ] = await Promise.all([
      this.prisma.appointment.count({
        where: { startAt: { gte: start, lte: end } },
      }),
      this.prisma.appointment.count({
        where: {
          startAt: { gte: start, lte: end },
          status: AppointmentStatus.ATENDIDO,
        },
      }),
      this.prisma.appointment.count({
        where: {
          startAt: { gte: start, lte: end },
          status: AppointmentStatus.NO_ASISTIO,
        },
      }),
      this.prisma.invoice.findMany({
        where: {
          createdAt: { gte: start, lte: end },
          status: { not: InvoiceStatus.ANULADA },
        },
        select: { total: true, status: true },
      }),
      this.prisma.payment.findMany({
        where: { paidAt: { gte: start, lte: end } },
        select: { amount: true, method: true },
      }),
      this.prisma.patient.count({
        where: { createdAt: { gte: start, lte: end } },
      }),
    ]);

    const revenue = invoices
      .filter((i) => i.status === InvoiceStatus.PAGADA || i.status === InvoiceStatus.PARCIAL)
      .reduce((s, i) => s + Number(i.total), 0);

    const byMethod: Record<string, number> = {};
    for (const p of payments) {
      byMethod[p.method] = (byMethod[p.method] || 0) + Number(p.amount);
    }

    return {
      period: { from, to },
      appointments: {
        total: appointmentsCount,
        attended: attendedCount,
        noShow: noShowCount,
        attendanceRate:
          appointmentsCount > 0
            ? Math.round((attendedCount / appointmentsCount) * 100)
            : 0,
      },
      revenue: {
        total: revenue,
        invoicesCount: invoices.length,
        byPaymentMethod: byMethod,
      },
      newPatients,
    };
  }

  async appointmentsByDoctor(from: string, to: string) {
    const start = new Date(from);
    const end = new Date(to);
    end.setHours(23, 59, 59, 999);

    const appointments = await this.prisma.appointment.groupBy({
      by: ['doctorId', 'status'],
      where: { startAt: { gte: start, lte: end } },
      _count: true,
    });

    const doctorIds = [...new Set(appointments.map((a) => a.doctorId))];
    const doctors = await this.prisma.user.findMany({
      where: { id: { in: doctorIds } },
      select: { id: true, firstName: true, lastName: true },
    });
    const doctorMap = Object.fromEntries(
      doctors.map((d) => [d.id, `${d.firstName} ${d.lastName}`]),
    );

    const result: Record<string, any> = {};
    for (const row of appointments) {
      const name = doctorMap[row.doctorId] || row.doctorId;
      if (!result[name]) result[name] = { total: 0, byStatus: {} };
      result[name].byStatus[row.status] = row._count;
      result[name].total += row._count;
    }

    return result;
  }

  async topProcedures(from: string, to: string, limit = 10) {
    const start = new Date(from);
    const end = new Date(to);
    end.setHours(23, 59, 59, 999);

    const items = await this.prisma.appointmentItem.findMany({
      where: {
        appointment: {
          startAt: { gte: start, lte: end },
          status: AppointmentStatus.ATENDIDO,
        },
      },
      include: { procedure: { select: { name: true, code: true } } },
    });

    const counts: Record<string, { name: string; code: string; count: number }> = {};
    for (const item of items) {
      const key = item.procedureId;
      if (!counts[key]) {
        counts[key] = {
          name: item.procedure.name,
          code: item.procedure.code,
          count: 0,
        };
      }
      counts[key].count += item.quantity || 1;
    }

    return Object.values(counts)
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }

  async inventoryStatus() {
    const items = await this.prisma.inventoryItem.findMany({
      where: { isActive: true },
      orderBy: { stockCurrent: 'asc' },
    });

    const low = items.filter((i) => i.stockCurrent <= i.stockMin);
    const totalValue = items.reduce(
      (s, i) => s + i.stockCurrent * Number(i.costAverage),
      0,
    );

    return {
      totalItems: items.length,
      lowStockCount: low.length,
      lowStockItems: low,
      estimatedValue: totalValue,
    };
  }
}
