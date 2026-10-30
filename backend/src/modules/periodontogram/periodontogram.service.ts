import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePeriodontogramDto } from './dto/create-periodontogram.dto';

@Injectable()
export class PeriodontogramService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreatePeriodontogramDto, recordedById: string) {
    const patient = await this.prisma.patient.findUnique({
      where: { id: dto.patientId },
    });
    if (!patient || !patient.isActive) {
      throw new NotFoundException('Paciente no encontrado');
    }

    // Calcular NIC si no viene y hay margen gingival
    let cal = dto.clinicalAttachmentLevel;
    if (!cal && dto.gingivalMargin && dto.probingDepths) {
      cal = {};
      for (const key of Object.keys(dto.probingDepths)) {
        const pd = dto.probingDepths[key] || 0;
        const gm = dto.gingivalMargin[key] || 0;
        // NIC = PS − MG  (MG: posición del margen respecto a la LAC;
        // negativo = recesión). Ej: PS 3 mm, MG −2 mm → NIC 5 mm.
        cal[key] = pd - gm;
      }
    }

    const record = await this.prisma.periodontogramRecord.create({
      data: {
        patientId: dto.patientId,
        toothNumber: dto.toothNumber,
        probingDepths: dto.probingDepths,
        gingivalMargin: dto.gingivalMargin,
        clinicalAttachmentLevel: cal,
        furcation: dto.furcation,
        mobility: dto.mobility,
        bleedingOnProbing: dto.bleedingOnProbing ?? false,
        plaque: dto.plaque ?? false,
        notes: dto.notes,
        recordedById,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        actorId: recordedById,
        action: 'CREATE',
        entity: 'PeriodontogramRecord',
        entityId: record.id,
      },
    });

    return record;
  }

  async getByPatient(patientId: string, examDate?: string) {
    const where: any = { patientId };
    if (examDate) {
      const start = new Date(examDate);
      start.setHours(0, 0, 0, 0);
      const end = new Date(examDate);
      end.setHours(23, 59, 59, 999);
      where.examDate = { gte: start, lte: end };
    }

    const records = await this.prisma.periodontogramRecord.findMany({
      where,
      orderBy: [{ examDate: 'desc' }, { toothNumber: 'asc' }],
      include: {
        recordedBy: { select: { firstName: true, lastName: true } },
      },
    });

    return {
      patientId,
      records,
      examDates: [...new Set(records.map((r) => r.examDate.toISOString().slice(0, 10)))],
    };
  }

  async getLatestFull(patientId: string) {
    const latest = await this.prisma.periodontogramRecord.findFirst({
      where: { patientId },
      orderBy: { examDate: 'desc' },
      select: { examDate: true },
    });

    if (!latest) return { patientId, records: [], examDate: null };

    return this.getByPatient(patientId, latest.examDate.toISOString().slice(0, 10));
  }
}
