import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTreatmentPlanDto, ApproveItemsDto, ReviewDiscountDto } from './dto/treatment.dto';
import { AppointmentStatus, DiscountStatus, Role, TreatmentPlanStatus } from '@prisma/client';

/**
 * RF-07: descuentos autorizados.
 *  DISCOUNT_AUTO_APPROVE_PERCENT  → hasta este % se aprueba solo (por defecto 0: todo descuento requiere autorización)
 *  DISCOUNT_APPROVER_ROLES        → roles que pueden autorizar (por defecto ADMIN_TI,ODONTOLOGO,ESPECIALISTA)
 * Quien crea el presupuesto no puede autorizar su propio descuento (cuatro ojos).
 */
export function discountPolicy(env: Record<string, string | undefined> = process.env) {
  return {
    autoApprovePercent: Number(env.DISCOUNT_AUTO_APPROVE_PERCENT || 0),
    approverRoles: (env.DISCOUNT_APPROVER_ROLES || 'ADMIN_TI,ODONTOLOGO,ESPECIALISTA').split(',').map((r) => r.trim()).filter(Boolean),
  };
}

@Injectable()
export class TreatmentsService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateTreatmentPlanDto, actorId: string) {
    const patient = await this.prisma.patient.findUnique({
      where: { id: dto.patientId },
    });
    if (!patient?.isActive) throw new NotFoundException('Paciente no encontrado');
    if (!dto.items?.length) throw new BadRequestException('Debe incluir ítems');

    let subtotal = 0;
    for (const it of dto.items) {
      subtotal += it.unitPrice * (it.quantity || 1) + (it.labCost || 0) - (it.discount || 0);
    }
    const discount = dto.discount || 0;
    const totalAmount = Math.max(0, subtotal - discount);

    // RF-07: ¿requiere autorización?
    const gross = dto.items.reduce((s, it) => s + it.unitPrice * (it.quantity || 1) + (it.labCost || 0), 0);
    const totalDiscount = discount + dto.items.reduce((s, it) => s + (it.discount || 0), 0);
    if (totalDiscount < 0) throw new BadRequestException('El descuento no puede ser negativo');
    if (totalDiscount > gross) throw new BadRequestException('El descuento no puede superar el valor del presupuesto');
    const discountPct = gross > 0 ? (totalDiscount / gross) * 100 : 0;
    const policy = discountPolicy();
    const discountStatus =
      totalDiscount === 0
        ? DiscountStatus.NONE
        : discountPct <= policy.autoApprovePercent
          ? DiscountStatus.APPROVED
          : DiscountStatus.PENDING;
    if (discountStatus === DiscountStatus.PENDING && !dto.discountReason?.trim()) {
      throw new BadRequestException('Indique el motivo del descuento (discountReason): requiere autorización');
    }

    const plan = await this.prisma.treatmentPlan.create({
      data: {
        patientId: dto.patientId,
        title: dto.title || 'Plan de tratamiento',
        notes: dto.notes,
        discount,
        totalAmount,
        status: TreatmentPlanStatus.BORRADOR,
        createdById: actorId,
        discountStatus,
        discountReason: dto.discountReason,
        items: {
          create: dto.items.map((it) => ({
            procedureId: it.procedureId,
            quantity: it.quantity || 1,
            unitPrice: it.unitPrice,
            labCost: it.labCost || 0,
            discount: it.discount || 0,
            phase: it.phase || 1,
            notes: it.notes,
            isApproved: false,
          })),
        },
      },
      include: {
        items: { include: { procedure: true } },
        patient: { select: { firstName: true, lastName: true } },
      },
    });

    await this.prisma.auditLog.create({
      data: {
        actorId,
        action: 'CREATE',
        entity: 'TreatmentPlan',
        entityId: plan.id,
        newValues: { totalAmount, totalDiscount, discountPct: Math.round(discountPct * 10) / 10, discountStatus },
      },
    });

    return plan;
  }

  async findByPatient(patientId: string) {
    return this.prisma.treatmentPlan.findMany({
      where: { patientId },
      orderBy: { createdAt: 'desc' },
      include: {
        items: { include: { procedure: { select: { id: true, name: true, code: true } } } },
      },
    });
  }

  async findOne(id: string) {
    const plan = await this.prisma.treatmentPlan.findUnique({
      where: { id },
      include: {
        items: { include: { procedure: true } },
        patient: {
          select: { id: true, firstName: true, lastName: true, documentNumber: true },
        },
      },
    });
    if (!plan) throw new NotFoundException('Plan no encontrado');
    return plan;
  }

  private assertDiscountCleared(plan: { discountStatus?: DiscountStatus | null }) {
    if (plan.discountStatus === DiscountStatus.PENDING) {
      throw new ForbiddenException('El descuento del presupuesto está pendiente de autorización (RF-07)');
    }
    if (plan.discountStatus === DiscountStatus.REJECTED) {
      throw new ForbiddenException('El descuento fue rechazado: genere un nuevo presupuesto sin ese descuento');
    }
  }

  /** RF-07: autorizar o rechazar el descuento */
  async reviewDiscount(id: string, dto: ReviewDiscountDto, actor: { id: string; role: Role | string }) {
    const plan = await this.findOne(id);
    if (plan.discountStatus !== DiscountStatus.PENDING) {
      throw new BadRequestException('Este presupuesto no tiene un descuento pendiente de autorización');
    }
    if (!discountPolicy().approverRoles.includes(String(actor.role))) {
      throw new ForbiddenException('Su rol no puede autorizar descuentos');
    }
    if ((plan as any).createdById && (plan as any).createdById === actor.id) {
      throw new ForbiddenException('No puede autorizar el descuento de un presupuesto que usted creó');
    }
    if (!dto.approve && !dto.note?.trim()) throw new BadRequestException('Indique el motivo del rechazo');
    const updated = await this.prisma.treatmentPlan.update({
      where: { id },
      data: {
        discountStatus: dto.approve ? DiscountStatus.APPROVED : DiscountStatus.REJECTED,
        discountReviewedById: actor.id,
        discountReviewedAt: new Date(),
        discountReviewNote: dto.note,
      },
    });
    await this.prisma.auditLog.create({
      data: {
        actorId: actor.id,
        action: dto.approve ? 'DISCOUNT_APPROVED' : 'DISCOUNT_REJECTED',
        entity: 'TreatmentPlan',
        entityId: id,
        newValues: { note: dto.note, discount: Number(plan.discount) },
      },
    });
    return updated;
  }

  /** Presupuestos con descuento esperando autorización */
  pendingDiscounts() {
    return this.prisma.treatmentPlan.findMany({
      where: { discountStatus: DiscountStatus.PENDING },
      orderBy: { createdAt: 'asc' },
      include: {
        patient: { select: { id: true, firstName: true, lastName: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
        items: { include: { procedure: { select: { name: true } } } },
      },
    });
  }

  async sendToPatient(id: string, actorId: string) {
    const plan = await this.findOne(id);
    this.assertDiscountCleared(plan);
    return this.prisma.treatmentPlan.update({
      where: { id },
      data: { status: TreatmentPlanStatus.ENVIADO },
    });
  }

  /**
   * RF-08: aprobación total o parcial → ítems aprobados;
   * opcionalmente genera citas agendables.
   */
  async approve(id: string, dto: ApproveItemsDto, actorId: string) {
    const plan = await this.findOne(id);
    this.assertDiscountCleared(plan);
    if (
      plan.status === TreatmentPlanStatus.RECHAZADO ||
      plan.status === TreatmentPlanStatus.FINALIZADO
    ) {
      throw new BadRequestException('Este plan no admite aprobación');
    }

    const ids = new Set(dto.itemIds);
    const toApprove = plan.items.filter((i) => ids.has(i.id));
    if (!toApprove.length) {
      throw new BadRequestException('Seleccione al menos un ítem');
    }

    await this.prisma.treatmentPlanItem.updateMany({
      where: { id: { in: [...ids] }, treatmentPlanId: id },
      data: { isApproved: true },
    });

    const allItems = await this.prisma.treatmentPlanItem.findMany({
      where: { treatmentPlanId: id },
    });
    const approvedCount = allItems.filter((i) => i.isApproved || ids.has(i.id)).length;
    const status =
      approvedCount >= allItems.length
        ? TreatmentPlanStatus.APROBADO_TOTAL
        : TreatmentPlanStatus.APROBADO_PARCIAL;

    await this.prisma.treatmentPlan.update({
      where: { id },
      data: { status, approvedAt: new Date() },
    });

    const appointmentsCreated: any[] = [];

    if (dto.createAppointments) {
      if (!dto.doctorId || !dto.chairId || !dto.startAt) {
        throw new BadRequestException(
          'Para crear citas indique doctorId, chairId y startAt',
        );
      }
      const slot = dto.slotMinutes || 30;
      let cursor = new Date(dto.startAt);

      // RN-03: validar TODOS los turnos antes de crear ninguno
      for (let i = 0; i < toApprove.length; i++) {
        const start = new Date(new Date(dto.startAt).getTime() + i * slot * 60 * 1000);
        const end = new Date(start.getTime() + slot * 60 * 1000);
        const clash = await this.prisma.appointment.findFirst({
          where: {
            chairId: dto.chairId,
            status: { notIn: [AppointmentStatus.CANCELADO, AppointmentStatus.NO_ASISTIO] },
            startAt: { lt: end },
            endAt: { gt: start },
          },
        });
        if (clash) {
          throw new ConflictException(
            `El sillón ya está ocupado entre ${start.toISOString()} y ${end.toISOString()} (RN-03). Elija otro horario.`,
          );
        }
      }

      for (const item of toApprove) {
        const end = new Date(cursor.getTime() + slot * 60 * 1000);
        const appt = await this.prisma.appointment.create({
          data: {
            patientId: plan.patientId,
            doctorId: dto.doctorId,
            chairId: dto.chairId,
            startAt: cursor,
            endAt: end,
            status: AppointmentStatus.PROGRAMADO,
            reason: `Plan ${plan.title || id} – fase ${item.phase}`,
            items: {
              create: {
                procedureId: item.procedureId,
                quantity: item.quantity,
              },
            },
          },
        });
        appointmentsCreated.push(appt);
        cursor = end; // siguiente slot en cadena
      }
    }

    await this.prisma.auditLog.create({
      data: {
        actorId,
        action: 'APPROVE',
        entity: 'TreatmentPlan',
        entityId: id,
        newValues: { status, itemIds: dto.itemIds, appointments: appointmentsCreated.length },
      },
    });

    return {
      plan: await this.findOne(id),
      appointmentsCreated,
    };
  }
}
