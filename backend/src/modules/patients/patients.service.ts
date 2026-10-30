import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePatientDto } from './dto/create-patient.dto';
import { UpdatePatientDto } from './dto/update-patient.dto';
import { UpdateMedicalHistoryDto } from './dto/update-medical-history.dto';
import { QueryPatientsDto } from './dto/query-patients.dto';
import { Prisma } from '@prisma/client';

/**
 * RF-02: detecta automáticamente condiciones críticas a partir de la anamnesis
 * (alergia a penicilina/AINEs/látex/anestésicos, anticoagulantes, coagulopatías).
 */
const CRITICAL_PATTERNS: [RegExp, string][] = [
  [/penicil|amoxic/i, 'Alergia a penicilina'],
  [/l[aá]tex/i, 'Alergia al látex'],
  [/lidoca|artica|mepiva|anest/i, 'Alergia a anestésicos locales'],
  [/aine|ibupro|aspirin|diclofen/i, 'Alergia a AINEs'],
  [/warfar|acenocum|sintrom|heparin|apixab|rivaroxab|dabigat|clopidog|anticoag/i, 'Paciente anticoagulado'],
];

export function detectCriticalAlert(mh: {
  allergies?: string | null;
  medications?: string | null;
  coagulopathies?: string | null;
}): string | null {
  const reasons = new Set<string>();
  const allergies = mh.allergies || '';
  const meds = mh.medications || '';
  for (const [re, label] of CRITICAL_PATTERNS) {
    // Las alergias se buscan solo en "alergias"; los anticoagulantes en medicación y alergias.
    const source = label === 'Paciente anticoagulado' ? meds + ' ' + allergies : allergies;
    if (re.test(source)) reasons.add(label);
  }
  const coag = (mh.coagulopathies || '').trim();
  if (coag && !/^(no|ningun[oa]?|niega|n\/a|-|no refiere)$/i.test(coag)) reasons.add('Coagulopatía: ' + coag);
  return reasons.size ? Array.from(reasons).join(' · ') : null;
}

@Injectable()
export class PatientsService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreatePatientDto, createdById: string) {
    const existing = await this.prisma.patient.findUnique({
      where: {
        documentType_documentNumber: {
          documentType: dto.documentType,
          documentNumber: dto.documentNumber,
        },
      },
    });

    if (existing) {
      throw new ConflictException(
        `Ya existe un paciente con ${dto.documentType} ${dto.documentNumber}`,
      );
    }

    const {
      systemicDiseases,
      allergies,
      surgicalHistory,
      coagulopathies,
      medications,
      hasCriticalAlert,
      criticalAlertReason,
      ...patientData
    } = dto;

    const patient = await this.prisma.patient.create({
      data: {
        ...patientData,
        birthDate: new Date(dto.birthDate),
        createdById,
        medicalHistory: {
          create: {
            systemicDiseases,
            allergies,
            surgicalHistory,
            coagulopathies,
            medications,
            hasCriticalAlert:
              hasCriticalAlert ?? !!detectCriticalAlert({ allergies, medications, coagulopathies }),
            criticalAlertReason:
              criticalAlertReason ?? detectCriticalAlert({ allergies, medications, coagulopathies }),
          },
        },
      },
      include: {
        medicalHistory: true,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        actorId: createdById,
        action: 'CREATE',
        entity: 'Patient',
        entityId: patient.id,
        newValues: {
          document: `${patient.documentType} ${patient.documentNumber}`,
          name: `${patient.firstName} ${patient.lastName}`,
        },
      },
    });

    return patient;
  }

  async findAll(query: QueryPatientsDto) {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const where: Prisma.PatientWhereInput = {
      isActive: true,
    };

    if (query.search) {
      const term = query.search.trim();
      where.OR = [
        { firstName: { contains: term, mode: 'insensitive' } },
        { lastName: { contains: term, mode: 'insensitive' } },
        { documentNumber: { contains: term, mode: 'insensitive' } },
        { phone: { contains: term, mode: 'insensitive' } },
        { email: { contains: term, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.patient.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
        include: {
          medicalHistory: {
            select: {
              hasCriticalAlert: true,
              criticalAlertReason: true,
              allergies: true,
            },
          },
        },
      }),
      this.prisma.patient.count({ where }),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string) {
    const patient = await this.prisma.patient.findUnique({
      where: { id },
      include: {
        medicalHistory: true,
        createdBy: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });

    if (!patient || !patient.isActive) {
      throw new NotFoundException('Paciente no encontrado');
    }

    return patient;
  }

  async update(id: string, dto: UpdatePatientDto, actorId: string) {
    const patient = await this.findOne(id);

    const {
      systemicDiseases,
      allergies,
      surgicalHistory,
      coagulopathies,
      medications,
      hasCriticalAlert,
      criticalAlertReason,
      birthDate,
      ...patientData
    } = dto;

    if (dto.documentType || dto.documentNumber) {
      const docType = dto.documentType || patient.documentType;
      const docNumber = dto.documentNumber || patient.documentNumber;

      const conflict = await this.prisma.patient.findFirst({
        where: {
          documentType: docType,
          documentNumber: docNumber,
          id: { not: id },
        },
      });

      if (conflict) {
        throw new ConflictException(
          `Ya existe otro paciente con ${docType} ${docNumber}`,
        );
      }
    }

    // RF-02: detección automática de alertas al editar la anamnesis
    const detected = detectCriticalAlert({ allergies, medications, coagulopathies });

    const updated = await this.prisma.patient.update({
      where: { id },
      data: {
        ...patientData,
        ...(birthDate && { birthDate: new Date(birthDate) }),
        medicalHistory: {
          upsert: {
            create: {
              systemicDiseases,
              allergies,
              surgicalHistory,
              coagulopathies,
              medications,
              hasCriticalAlert: hasCriticalAlert ?? !!detected,
              criticalAlertReason: criticalAlertReason ?? detected ?? undefined,
            },
            update: {
              ...(hasCriticalAlert === undefined && !!detected ? { hasCriticalAlert: true, criticalAlertReason: criticalAlertReason ?? detected } : {}),
              ...(systemicDiseases !== undefined && { systemicDiseases }),
              ...(allergies !== undefined && { allergies }),
              ...(surgicalHistory !== undefined && { surgicalHistory }),
              ...(coagulopathies !== undefined && { coagulopathies }),
              ...(medications !== undefined && { medications }),
              ...(hasCriticalAlert !== undefined && { hasCriticalAlert }),
              ...(criticalAlertReason !== undefined && { criticalAlertReason }),
            },
          },
        },
      },
      include: {
        medicalHistory: true,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        actorId,
        action: 'UPDATE',
        entity: 'Patient',
        entityId: id,
        newValues: patientData as any,
      },
    });

    return updated;
  }

  async updateMedicalHistory(
    patientId: string,
    dto: UpdateMedicalHistoryDto,
    actorId: string,
  ) {
    await this.findOne(patientId);

    // RF-02: si no se indicó la alerta a mano, se detecta desde la anamnesis
    const detected = detectCriticalAlert(dto);
    const auto =
      dto.hasCriticalAlert === undefined && detected
        ? { hasCriticalAlert: true, criticalAlertReason: dto.criticalAlertReason ?? detected }
        : {};

    const history = await this.prisma.medicalHistory.upsert({
      where: { patientId },
      create: {
        patientId,
        ...dto,
        hasCriticalAlert: dto.hasCriticalAlert ?? !!detected,
        ...(dto.criticalAlertReason === undefined && detected ? { criticalAlertReason: detected } : {}),
      },
      update: { ...dto, ...auto },
    });

    await this.prisma.auditLog.create({
      data: {
        actorId,
        action: 'UPDATE',
        entity: 'MedicalHistory',
        entityId: history.id,
        newValues: dto as any,
      },
    });

    return history;
  }

  async remove(id: string, actorId: string) {
    await this.findOne(id);

    await this.prisma.patient.update({
      where: { id },
      data: { isActive: false },
    });

    await this.prisma.auditLog.create({
      data: {
        actorId,
        action: 'DELETE',
        entity: 'Patient',
        entityId: id,
      },
    });

    return { message: 'Paciente desactivado correctamente' };
  }
}
