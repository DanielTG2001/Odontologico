import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateClinicalNoteDto } from './dto/create-clinical-note.dto';
import { UpdateClinicalNoteDto } from './dto/update-clinical-note.dto';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { CreateAddendumDto } from './dto/create-addendum.dto';

@Injectable()
export class ClinicalNotesService {
  /** Horas tras las cuales la nota se bloquea (RF-05, default 24) */
  private readonly lockHours: number;

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {
    this.lockHours = Number(this.config.get('CLINICAL_NOTE_LOCK_HOURS') || 24);
  }

  private assertEditable(note: { isLocked: boolean; createdAt: Date; authorId: string }, actorId: string) {
    if (note.isLocked) {
      throw new ForbiddenException(
        'La nota está bloqueada. Cualquier corrección debe hacerse mediante una nota de adenda firmada.',
      );
    }

    const ageMs = Date.now() - note.createdAt.getTime();
    const lockMs = this.lockHours * 60 * 60 * 1000;
    if (ageMs > lockMs) {
      throw new ForbiddenException(
        `La nota superó el plazo de edición de ${this.lockHours}h y no puede modificarse.`,
      );
    }

    // Solo el autor (o admin) puede editar antes del bloqueo
    // (simplificado: se valida en controller con roles)
  }

  async create(dto: CreateClinicalNoteDto, authorId: string) {
    const patient = await this.prisma.patient.findUnique({
      where: { id: dto.patientId },
    });
    if (!patient || !patient.isActive) {
      throw new NotFoundException('Paciente no encontrado');
    }

    const note = await this.prisma.clinicalNote.create({
      data: {
        patientId: dto.patientId,
        authorId,
        subjective: dto.subjective,
        objective: dto.objective,
        evaluation: dto.evaluation,
        plan: dto.plan,
      },
      include: {
        author: { select: { id: true, firstName: true, lastName: true } },
        patient: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    await this.prisma.auditLog.create({
      data: {
        actorId: authorId,
        action: 'CREATE',
        entity: 'ClinicalNote',
        entityId: note.id,
      },
    });

    return note;
  }

  async findByPatient(patientId: string) {
    return this.prisma.clinicalNote.findMany({
      where: { patientId },
      orderBy: { createdAt: 'desc' },
      include: {
        author: { select: { id: true, firstName: true, lastName: true, role: true } },
        addenda: {
          orderBy: { createdAt: 'asc' },
          include: { author: { select: { id: true, firstName: true, lastName: true, role: true } } },
        },
      },
    });
  }

  async findOne(id: string) {
    const note = await this.prisma.clinicalNote.findUnique({
      where: { id },
      include: {
        author: { select: { id: true, firstName: true, lastName: true } },
        patient: { select: { id: true, firstName: true, lastName: true } },
        addenda: {
          orderBy: { createdAt: 'asc' },
          include: { author: { select: { id: true, firstName: true, lastName: true, role: true } } },
        },
      },
    });
    if (!note) throw new NotFoundException('Nota clínica no encontrada');
    return note;
  }

  async update(id: string, dto: UpdateClinicalNoteDto, actorId: string) {
    const note = await this.findOne(id);
    this.assertEditable(note, actorId);

    const updated = await this.prisma.clinicalNote.update({
      where: { id },
      data: dto,
      include: {
        author: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    await this.prisma.auditLog.create({
      data: {
        actorId,
        action: 'UPDATE',
        entity: 'ClinicalNote',
        entityId: id,
        newValues: dto as any,
      },
    });

    return updated;
  }

  /** Firma digital de la nota + bloqueo inmediato */
  async sign(id: string, actorId: string, signatureData?: string) {
    const note = await this.findOne(id);

    if (note.isLocked && note.signedAt) {
      throw new BadRequestException('La nota ya está firmada y bloqueada');
    }

    if (note.authorId !== actorId) {
      throw new ForbiddenException('Solo el autor de la nota puede firmarla');
    }

    const updated = await this.prisma.clinicalNote.update({
      where: { id },
      data: {
        isLocked: true,
        lockedAt: new Date(),
        signedAt: new Date(),
        signatureData: signatureData || `signed-by-${actorId}-${Date.now()}`,
      },
      include: {
        author: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    await this.prisma.auditLog.create({
      data: {
        actorId,
        action: 'SIGN',
        entity: 'ClinicalNote',
        entityId: id,
      },
    });

    return updated;
  }

  /** true si la nota ya no admite edición directa (firmada o fuera de plazo). */
  isClosed(note: { isLocked: boolean; createdAt: Date }) {
    return note.isLocked || Date.now() - note.createdAt.getTime() > this.lockHours * 3600 * 1000;
  }

  /**
   * RF-05 / RN-01: adenda firmada sobre una nota bloqueada.
   * La adenda es inmutable (trigger en BD) y se firma en el mismo acto.
   * La firma electrónica es un hash SHA-256 de (nota, autor, contenido, fecha).
   */
  async addAddendum(noteId: string, dto: CreateAddendumDto, actorId: string) {
    const note = await this.findOne(noteId);

    if (!this.isClosed(note)) {
      throw new BadRequestException(
        'La nota todavía es editable: corrija el contenido directamente y fírmela.',
      );
    }

    const signedAt = new Date();
    const digest = createHash('sha256')
      .update([noteId, actorId, dto.reason, dto.content, signedAt.toISOString()].join('|'))
      .digest('hex');

    const addendum = await this.prisma.clinicalNoteAddendum.create({
      data: {
        noteId,
        authorId: actorId,
        reason: dto.reason.trim(),
        content: dto.content.trim(),
        signedAt,
        signatureData: dto.signatureData || `sha256:${digest}`,
      },
      include: { author: { select: { id: true, firstName: true, lastName: true, role: true } } },
    });

    await this.prisma.auditLog.create({
      data: {
        actorId,
        action: 'ADDENDUM',
        entity: 'ClinicalNote',
        entityId: noteId,
        newValues: { addendumId: addendum.id, reason: addendum.reason, digest },
      },
    });

    return addendum;
  }

  /** Job opcional: bloquear notas que superaron el plazo sin firma */
  async lockExpiredNotes() {
    const cutoff = new Date(Date.now() - this.lockHours * 60 * 60 * 1000);

    const result = await this.prisma.clinicalNote.updateMany({
      where: {
        isLocked: false,
        createdAt: { lt: cutoff },
      },
      data: {
        isLocked: true,
        lockedAt: new Date(),
      },
    });

    return { locked: result.count };
  }
}
