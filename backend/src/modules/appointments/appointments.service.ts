import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { UpdateAppointmentDto } from './dto/update-appointment.dto';
import { QueryAppointmentsDto } from './dto/query-appointments.dto';
import { AppointmentStatus, Prisma } from '@prisma/client';
import { InventoryService } from '../inventory/inventory.service';

@Injectable()
export class AppointmentsService {
  constructor(
    private prisma: PrismaService,
    private inventory: InventoryService,
  ) {}

  /**
   * RN-03: Validación de sobreposición de sillones.
   * No se permiten dos citas simultáneas en el mismo sillón físico,
   * independientemente del odontólogo.
   */
  private async assertNoChairOverlap(
    chairId: string,
    startAt: Date,
    endAt: Date,
    excludeAppointmentId?: string,
  ) {
    if (startAt >= endAt) {
      throw new BadRequestException('La hora de inicio debe ser anterior a la de fin');
    }

    const overlapping = await this.prisma.appointment.findFirst({
      where: {
        chairId,
        id: excludeAppointmentId ? { not: excludeAppointmentId } : undefined,
        status: {
          notIn: [AppointmentStatus.CANCELADO, AppointmentStatus.NO_ASISTIO],
        },
        // Overlap condition: (startA < endB) AND (endA > startB)
        startAt: { lt: endAt },
        endAt: { gt: startAt },
      },
      include: {
        patient: { select: { firstName: true, lastName: true } },
        doctor: { select: { firstName: true, lastName: true } },
      },
    });

    if (overlapping) {
      throw new ConflictException(
        `El sillón ya tiene una cita de ${overlapping.patient.firstName} ${overlapping.patient.lastName} ` +
          `con Dr/a. ${overlapping.doctor.firstName} ${overlapping.doctor.lastName} ` +
          `en ese horario (${overlapping.startAt.toISOString()} - ${overlapping.endAt.toISOString()})`,
      );
    }
  }

  /** RN-01: una cita atendida (procedimiento realizado) no puede volver a otro estado. */
  private assertNotReverting(current: AppointmentStatus, next?: AppointmentStatus) {
    if (current === AppointmentStatus.ATENDIDO && next && next !== AppointmentStatus.ATENDIDO) {
      throw new ForbiddenException(
        'La cita ya fue atendida y no puede cambiar de estado. Registre la corrección como adenda en la nota clínica.',
      );
    }
  }

  /**
   * RF-14: al pasar a ATENDIDO se descuentan automáticamente los insumos según la
   * receta de consumo de cada procedimiento. Idempotente (no descuenta dos veces).
   */
  private async deductIfAttended(id: string, prev: AppointmentStatus, next: AppointmentStatus | undefined, actorId: string) {
    if (next !== AppointmentStatus.ATENDIDO || prev === AppointmentStatus.ATENDIDO) return undefined;
    const alreadyDeducted = await this.prisma.stockMovement.count({
      where: { referenceType: 'Appointment', referenceId: id, type: 'AUTO_DEDUCT' },
    });
    if (alreadyDeducted > 0) return undefined;
    return this.inventory.autoDeductForAppointment(id, actorId);
  }

  async create(dto: CreateAppointmentDto, actorId: string) {
    const startAt = new Date(dto.startAt);
    const endAt = new Date(dto.endAt);

    // Validar existencia de patient, doctor y chair
    const [patient, doctor, chair] = await Promise.all([
      this.prisma.patient.findUnique({ where: { id: dto.patientId } }),
      this.prisma.user.findUnique({ where: { id: dto.doctorId } }),
      this.prisma.chair.findUnique({ where: { id: dto.chairId } }),
    ]);

    if (!patient || !patient.isActive) {
      throw new NotFoundException('Paciente no encontrado');
    }
    if (!doctor || !doctor.isActive) {
      throw new NotFoundException('Doctor no encontrado');
    }
    if (!chair || !chair.isActive) {
      throw new NotFoundException('Sillón no encontrado');
    }

    // RN-03
    await this.assertNoChairOverlap(dto.chairId, startAt, endAt);

    const appointment = await this.prisma.appointment.create({
      data: {
        patientId: dto.patientId,
        doctorId: dto.doctorId,
        chairId: dto.chairId,
        startAt,
        endAt,
        status: dto.status || AppointmentStatus.PROGRAMADO,
        reason: dto.reason,
        notes: dto.notes,
        items: dto.items?.length
          ? {
              create: dto.items.map((item) => ({
                procedureId: item.procedureId,
                quantity: item.quantity || 1,
                notes: item.notes,
              })),
            }
          : undefined,
      },
      include: {
        patient: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            documentNumber: true,
            phone: true,
            medicalHistory: {
              select: { hasCriticalAlert: true, criticalAlertReason: true },
            },
          },
        },
        doctor: {
          select: { id: true, firstName: true, lastName: true },
        },
        chair: true,
        items: {
          include: { procedure: true },
        },
      },
    });

    await this.prisma.auditLog.create({
      data: {
        actorId,
        action: 'CREATE',
        entity: 'Appointment',
        entityId: appointment.id,
        newValues: {
          patientId: dto.patientId,
          doctorId: dto.doctorId,
          chairId: dto.chairId,
          startAt: startAt.toISOString(),
          endAt: endAt.toISOString(),
        },
      },
    });

    return appointment;
  }

  async findAll(query: QueryAppointmentsDto) {
    const where: Prisma.AppointmentWhereInput = {};

    if (query.from || query.to) {
      where.startAt = {};
      if (query.from) where.startAt.gte = new Date(query.from);
      if (query.to) where.startAt.lte = new Date(query.to);
    }

    if (query.doctorId) where.doctorId = query.doctorId;
    if (query.chairId) where.chairId = query.chairId;
    if (query.patientId) where.patientId = query.patientId;
    if (query.status) where.status = query.status;

    const data = await this.prisma.appointment.findMany({
      where,
      orderBy: { startAt: 'asc' },
      include: {
        patient: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            documentNumber: true,
            phone: true,
            medicalHistory: {
              select: { hasCriticalAlert: true, criticalAlertReason: true },
            },
          },
        },
        doctor: {
          select: { id: true, firstName: true, lastName: true },
        },
        chair: true,
        items: {
          include: { procedure: { select: { id: true, name: true, code: true } } },
        },
      },
    });

    return data;
  }

  async findOne(id: string) {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id },
      include: {
        patient: {
          include: {
            medicalHistory: true,
          },
        },
        doctor: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        chair: true,
        items: {
          include: { procedure: true },
        },
      },
    });

    if (!appointment) {
      throw new NotFoundException('Cita no encontrada');
    }

    return appointment;
  }

  async update(id: string, dto: UpdateAppointmentDto, actorId: string) {
    const existing = await this.findOne(id);
    this.assertNotReverting(existing.status, dto.status);
    if (existing.status === AppointmentStatus.ATENDIDO && (dto.startAt || dto.endAt || dto.chairId || dto.doctorId)) {
      throw new ForbiddenException('La cita ya fue atendida: no se puede reprogramar.');
    }

    const startAt = dto.startAt ? new Date(dto.startAt) : existing.startAt;
    const endAt = dto.endAt ? new Date(dto.endAt) : existing.endAt;
    const chairId = dto.chairId || existing.chairId;

    // Si cambian horario o sillón → revalidar sobreposición
    if (dto.startAt || dto.endAt || dto.chairId) {
      await this.assertNoChairOverlap(chairId, startAt, endAt, id);
    }

    const updated = await this.prisma.appointment.update({
      where: { id },
      data: {
        ...(dto.patientId && { patientId: dto.patientId }),
        ...(dto.doctorId && { doctorId: dto.doctorId }),
        ...(dto.chairId && { chairId: dto.chairId }),
        ...(dto.startAt && { startAt }),
        ...(dto.endAt && { endAt }),
        ...(dto.status && { status: dto.status }),
        ...(dto.reason !== undefined && { reason: dto.reason }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
      },
      include: {
        patient: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            medicalHistory: {
              select: { hasCriticalAlert: true, criticalAlertReason: true },
            },
          },
        },
        doctor: {
          select: { id: true, firstName: true, lastName: true },
        },
        chair: true,
        items: {
          include: { procedure: true },
        },
      },
    });

    await this.prisma.auditLog.create({
      data: {
        actorId,
        action: 'UPDATE',
        entity: 'Appointment',
        entityId: id,
        newValues: dto as any,
      },
    });

    const inventoryDeduction = await this.deductIfAttended(id, existing.status, dto.status, actorId);
    return inventoryDeduction ? { ...updated, inventoryDeduction } : updated;
  }

  async updateStatus(id: string, status: AppointmentStatus, actorId: string) {
    const previous = await this.findOne(id);
    this.assertNotReverting(previous.status, status);

    const updated = await this.prisma.appointment.update({
      where: { id },
      data: { status },
      include: {
        patient: {
          select: { id: true, firstName: true, lastName: true },
        },
        doctor: {
          select: { id: true, firstName: true, lastName: true },
        },
        chair: true,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        actorId,
        action: 'STATUS_CHANGE',
        entity: 'Appointment',
        entityId: id,
        oldValues: { status: previous.status },
        newValues: { status },
      },
    });

    const inventoryDeduction = await this.deductIfAttended(id, previous.status, status, actorId);
    return { ...updated, inventoryDeduction };
  }

  async remove(id: string, actorId: string) {
    const existing = await this.findOne(id);
    this.assertNotReverting(existing.status, AppointmentStatus.CANCELADO);

    // Soft cancel instead of hard delete
    await this.prisma.appointment.update({
      where: { id },
      data: { status: AppointmentStatus.CANCELADO },
    });

    await this.prisma.auditLog.create({
      data: {
        actorId,
        action: 'CANCEL',
        entity: 'Appointment',
        entityId: id,
      },
    });

    return { message: 'Cita cancelada correctamente' };
  }
}
