import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpsertToothDto } from './dto/upsert-tooth.dto';

@Injectable()
export class OdontogramService {
  constructor(private prisma: PrismaService) {}

  async upsertTooth(dto: UpsertToothDto, recordedById: string) {
    const patient = await this.prisma.patient.findUnique({
      where: { id: dto.patientId },
    });
    if (!patient || !patient.isActive) {
      throw new NotFoundException('Paciente no encontrado');
    }

    const notation = dto.notation || 'FDI';

    const record = await this.prisma.odontogramRecord.upsert({
      where: {
        patientId_toothNumber_notation: {
          patientId: dto.patientId,
          toothNumber: dto.toothNumber,
          notation,
        },
      },
      create: {
        patientId: dto.patientId,
        toothNumber: dto.toothNumber,
        notation,
        surfaces: dto.surfaces,
        notes: dto.notes,
        recordedById,
      },
      update: {
        surfaces: dto.surfaces,
        notes: dto.notes,
        recordedById,
        recordedAt: new Date(),
      },
    });

    await this.prisma.auditLog.create({
      data: {
        actorId: recordedById,
        action: 'UPSERT',
        entity: 'OdontogramRecord',
        entityId: record.id,
        newValues: { toothNumber: dto.toothNumber, surfaces: dto.surfaces },
      },
    });

    return record;
  }

  async getPatientOdontogram(patientId: string, notation = 'FDI') {
    const records = await this.prisma.odontogramRecord.findMany({
      where: { patientId, notation },
      orderBy: { toothNumber: 'asc' },
    });

    // Devolver también estructura completa de 32/20 dientes para el frontend
    return {
      patientId,
      notation,
      teeth: records,
      summary: this.buildSummary(records),
    };
  }

  async getTooth(patientId: string, toothNumber: string, notation = 'FDI') {
    const record = await this.prisma.odontogramRecord.findUnique({
      where: {
        patientId_toothNumber_notation: { patientId, toothNumber, notation },
      },
    });
    return record || { patientId, toothNumber, notation, surfaces: {}, notes: null };
  }

  private buildSummary(records: any[]) {
    const counts: Record<string, number> = {};
    for (const r of records) {
      const surfaces = r.surfaces as Record<string, any>;
      for (const [key, val] of Object.entries(surfaces)) {
        if (key === 'status' || !val) continue;
        counts[val] = (counts[val] || 0) + 1;
      }
      if (surfaces.status) {
        counts[`status:${surfaces.status}`] = (counts[`status:${surfaces.status}`] || 0) + 1;
      }
    }
    return counts;
  }
}
