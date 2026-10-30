import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateVitalSignDto } from './dto/create-vital-sign.dto';
import { bmi, evaluateVitals } from './vital-alerts';

const VITAL_FIELDS = [
  'systolic', 'diastolic', 'heartRate', 'respiratoryRate',
  'temperature', 'oxygenSaturation', 'glucose', 'weightKg', 'heightCm',
] as const;

@Injectable()
export class VitalSignsService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateVitalSignDto, actorId: string) {
    if (!VITAL_FIELDS.some((f) => dto[f] !== undefined && dto[f] !== null)) {
      throw new BadRequestException('Registre al menos un signo vital');
    }

    const patient = await this.prisma.patient.findUnique({ where: { id: dto.patientId } });
    if (!patient || !patient.isActive) throw new NotFoundException('Paciente no encontrado');

    if (dto.appointmentId) {
      const appt = await this.prisma.appointment.findUnique({ where: { id: dto.appointmentId } });
      if (!appt || appt.patientId !== dto.patientId) {
        throw new BadRequestException('La cita no corresponde a este paciente');
      }
    }

    const alerts = evaluateVitals(dto);

    const record = await this.prisma.vitalSign.create({
      data: {
        patientId: dto.patientId,
        appointmentId: dto.appointmentId,
        recordedById: actorId,
        systolic: dto.systolic,
        diastolic: dto.diastolic,
        heartRate: dto.heartRate,
        respiratoryRate: dto.respiratoryRate,
        temperature: dto.temperature,
        oxygenSaturation: dto.oxygenSaturation,
        glucose: dto.glucose,
        weightKg: dto.weightKg,
        heightCm: dto.heightCm,
        notes: dto.notes,
        alerts: alerts.length ? (alerts as any) : undefined,
      },
      include: { recordedBy: { select: { id: true, firstName: true, lastName: true, role: true } } },
    });

    await this.prisma.auditLog.create({
      data: {
        actorId,
        action: 'CREATE',
        entity: 'VitalSign',
        entityId: record.id,
        newValues: { patientId: dto.patientId, alerts: alerts.map((x) => x.message) },
      },
    });

    return { ...record, alerts, bmi: bmi(dto.weightKg, dto.heightCm) };
  }

  async findByPatient(patientId: string, limit = 50) {
    const rows = await this.prisma.vitalSign.findMany({
      where: { patientId },
      orderBy: { recordedAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 200),
      include: { recordedBy: { select: { id: true, firstName: true, lastName: true, role: true } } },
    });
    return rows.map((r) => ({
      ...r,
      bmi: bmi(r.weightKg !== null ? Number(r.weightKg) : null, r.heightCm !== null ? Number(r.heightCm) : null),
    }));
  }
}
