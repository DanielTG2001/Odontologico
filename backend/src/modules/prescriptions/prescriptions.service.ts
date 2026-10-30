import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { PrescriptionStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AnnulPrescriptionDto, CreatePrescriptionDto } from './dto/prescription.dto';
import { findAllergyConflicts, findAnticoagulantWarnings } from './allergy-check';

const INCLUDE = {
  items: true,
  doctor: { select: { id: true, firstName: true, lastName: true, role: true, email: true, phone: true } },
  patient: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      documentType: true,
      documentNumber: true,
      birthDate: true,
      medicalHistory: { select: { allergies: true, hasCriticalAlert: true, criticalAlertReason: true } },
    },
  },
} as const;

@Injectable()
export class PrescriptionsService {
  constructor(private prisma: PrismaService) {}

  private async nextNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `RX-${year}-`;
    const last = await this.prisma.prescription.findFirst({
      where: { number: { startsWith: prefix } },
      orderBy: { number: 'desc' },
      select: { number: true },
    });
    const seq = last ? Number(last.number.slice(prefix.length)) + 1 : 1;
    return prefix + String(seq).padStart(6, '0');
  }

  async create(dto: CreatePrescriptionDto, doctorId: string) {
    const patient = await this.prisma.patient.findUnique({
      where: { id: dto.patientId },
      include: { medicalHistory: true },
    });
    if (!patient || !patient.isActive) throw new NotFoundException('Paciente no encontrado');

    if (dto.appointmentId) {
      const appt = await this.prisma.appointment.findUnique({ where: { id: dto.appointmentId } });
      if (!appt || appt.patientId !== dto.patientId) {
        throw new BadRequestException('La cita no corresponde a este paciente');
      }
    }

    const meds = dto.items.map((i) => i.medication);
    const conflicts = findAllergyConflicts(patient.medicalHistory?.allergies, meds);
    if (conflicts.length && !dto.allergyOverride) {
      throw new ConflictException({
        code: 'ALLERGY_CONFLICT',
        message:
          'Posible alergia: ' +
          conflicts.map((c) => `${c.medication} (${c.family})`).join(', ') +
          '. Si es clínicamente necesario, indique una justificación en allergyOverride.',
        conflicts,
      });
    }
    const warnings = findAnticoagulantWarnings(
      patient.medicalHistory?.medications,
      patient.medicalHistory?.coagulopathies,
      meds,
    );

    const signedAt = new Date();
    const number = await this.nextNumber();
    const digest = createHash('sha256')
      .update([number, dto.patientId, doctorId, JSON.stringify(dto.items), signedAt.toISOString()].join('|'))
      .digest('hex');

    const rx = await this.prisma.prescription.create({
      data: {
        number,
        patientId: dto.patientId,
        doctorId,
        appointmentId: dto.appointmentId,
        diagnosis: dto.diagnosis,
        indications: dto.indications,
        allergyOverride: conflicts.length ? dto.allergyOverride : undefined,
        signedAt,
        signatureData: dto.signatureData || `sha256:${digest}`,
        items: {
          create: dto.items.map((i) => ({
            medication: i.medication.trim(),
            presentation: i.presentation,
            dose: i.dose,
            frequency: i.frequency,
            duration: i.duration,
            route: i.route || 'Oral',
            quantity: i.quantity,
            instructions: i.instructions,
          })),
        },
      },
      include: INCLUDE,
    });

    await this.prisma.auditLog.create({
      data: {
        actorId: doctorId,
        action: 'CREATE',
        entity: 'Prescription',
        entityId: rx.id,
        newValues: { number, items: meds, allergyOverride: !!rx.allergyOverride, digest },
      },
    });

    return { ...rx, warnings };
  }

  findByPatient(patientId: string) {
    return this.prisma.prescription.findMany({
      where: { patientId },
      orderBy: { createdAt: 'desc' },
      include: INCLUDE,
    });
  }

  async findOne(id: string) {
    const rx = await this.prisma.prescription.findUnique({ where: { id }, include: INCLUDE });
    if (!rx) throw new NotFoundException('Receta no encontrada');
    return rx;
  }

  /** RN-01: las recetas no se borran; solo el autor puede anularlas indicando el motivo. */
  async annul(id: string, dto: AnnulPrescriptionDto, actorId: string) {
    const rx = await this.findOne(id);
    if (rx.status === PrescriptionStatus.ANNULLED) {
      throw new BadRequestException('La receta ya está anulada');
    }
    if (rx.doctorId !== actorId) {
      throw new ForbiddenException('Solo el profesional que firmó la receta puede anularla');
    }
    const updated = await this.prisma.prescription.update({
      where: { id },
      data: { status: PrescriptionStatus.ANNULLED, annulledAt: new Date(), annulReason: dto.reason },
      include: INCLUDE,
    });
    await this.prisma.auditLog.create({
      data: { actorId, action: 'ANNUL', entity: 'Prescription', entityId: id, newValues: { reason: dto.reason } },
    });
    return updated;
  }
}
