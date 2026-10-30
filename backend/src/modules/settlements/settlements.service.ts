import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCommissionRuleDto, CreateSettlementDto } from './dto/settlement.dto';
import { AppointmentStatus, CommissionType } from '@prisma/client';

@Injectable()
export class SettlementsService {
  constructor(private prisma: PrismaService) {}

  // ---------- Rules ----------
  createRule(dto: CreateCommissionRuleDto) {
    return this.prisma.doctorCommissionRule.create({
      data: {
        doctorId: dto.doctorId,
        procedureId: dto.procedureId,
        type: dto.type,
        value: dto.value,
      },
    });
  }

  getRules(doctorId: string) {
    return this.prisma.doctorCommissionRule.findMany({
      where: { doctorId, isActive: true },
      include: { procedure: { select: { id: true, name: true, code: true } } },
    });
  }

  // ---------- Calculate & create settlement ----------
  async createSettlement(dto: CreateSettlementDto, createdById: string) {
    const doctor = await this.prisma.user.findUnique({
      where: { id: dto.doctorId },
    });
    if (!doctor) throw new NotFoundException('Doctor no encontrado');

    const from = new Date(dto.periodFrom);
    const to = new Date(dto.periodTo);
    to.setHours(23, 59, 59, 999);

    // Citas atendidas del doctor en el período
    const appointments = await this.prisma.appointment.findMany({
      where: {
        doctorId: dto.doctorId,
        status: AppointmentStatus.ATENDIDO,
        startAt: { gte: from, lte: to },
      },
      include: {
        items: {
          include: { procedure: true },
        },
      },
    });

    const rules = await this.prisma.doctorCommissionRule.findMany({
      where: { doctorId: dto.doctorId, isActive: true },
    });

    const settlementItems: {
      appointmentId: string;
      procedureName: string;
      feeAmount: number;
      costAmount: number;
      commission: number;
    }[] = [];

    let totalFees = 0;
    let totalCosts = 0;
    let totalCommission = 0;

    for (const appt of appointments) {
      for (const item of appt.items) {
        const fee = Number(item.procedure.basePrice) * (item.quantity || 1);
        const cost = 0; // se podría enriquecer con lab costs del treatment plan
        totalFees += fee;
        totalCosts += cost;

        // Buscar regla específica del procedimiento, si no, regla general
        const rule =
          rules.find((r) => r.procedureId === item.procedureId) ||
          rules.find((r) => r.procedureId === null);

        let commission = 0;
        if (rule) {
          const val = Number(rule.value);
          switch (rule.type) {
            case CommissionType.PERCENTAGE:
              commission = (fee * val) / 100;
              break;
            case CommissionType.FIXED:
              commission = val * (item.quantity || 1);
              break;
            case CommissionType.PERCENTAGE_AFTER_COST:
              commission = ((fee - cost) * val) / 100;
              break;
          }
        }

        totalCommission += commission;
        settlementItems.push({
          appointmentId: appt.id,
          procedureName: item.procedure.name,
          feeAmount: fee,
          costAmount: cost,
          commission,
        });
      }
    }

    const settlement = await this.prisma.doctorSettlement.create({
      data: {
        doctorId: dto.doctorId,
        periodFrom: from,
        periodTo: to,
        totalFees,
        totalCosts,
        totalCommission,
        status: 'DRAFT',
        notes: dto.notes,
        createdById,
        items: {
          create: settlementItems,
        },
      },
      include: {
        doctor: { select: { firstName: true, lastName: true } },
        items: true,
      },
    });

    return settlement;
  }

  async approve(id: string) {
    return this.prisma.doctorSettlement.update({
      where: { id },
      data: { status: 'APPROVED' },
    });
  }

  async markPaid(id: string) {
    return this.prisma.doctorSettlement.update({
      where: { id },
      data: { status: 'PAID' },
    });
  }

  findByDoctor(doctorId: string) {
    return this.prisma.doctorSettlement.findMany({
      where: { doctorId },
      orderBy: { periodFrom: 'desc' },
      include: { items: true },
    });
  }

  findOne(id: string) {
    return this.prisma.doctorSettlement.findUnique({
      where: { id },
      include: {
        doctor: { select: { firstName: true, lastName: true, email: true } },
        items: true,
        createdBy: { select: { firstName: true, lastName: true } },
      },
    });
  }
}
