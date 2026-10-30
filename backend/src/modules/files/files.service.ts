import {
  BadRequestException,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import { FileKind } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';

export const MAX_FILE_BYTES = 25 * 1024 * 1024; // 25 MB

export interface IncomingFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

/**
 * Detecta el tipo real por los "magic bytes" (no se confía en el mimetype del navegador).
 * Formatos permitidos: JPEG, PNG, WEBP, PDF y DICOM (almacenado como archivo plano, sin procesar).
 */
export function detectMime(buf: Buffer): string | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  if (buf.length >= 5 && buf.toString('ascii', 0, 5) === '%PDF-') return 'application/pdf';
  if (buf.length >= 132 && buf.toString('ascii', 128, 132) === 'DICM') return 'application/dicom';
  return null;
}

const EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
  'application/dicom': 'dcm',
};

@Injectable()
export class FilesService {
  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
  ) {}

  async upload(patientId: string, file: IncomingFile | undefined, kind: FileKind, notes: string | undefined, actorId: string) {
    if (!file || !file.buffer?.length) throw new BadRequestException('Debe adjuntar un archivo');
    if (file.size > MAX_FILE_BYTES) throw new PayloadTooLargeException('El archivo supera 25 MB');

    const mime = detectMime(file.buffer);
    if (!mime) {
      throw new BadRequestException('Formato no permitido. Use JPG, PNG, WEBP, PDF o DICOM.');
    }

    const patient = await this.prisma.patient.findUnique({ where: { id: patientId } });
    if (!patient || !patient.isActive) throw new NotFoundException('Paciente no encontrado');

    const sha256 = createHash('sha256').update(file.buffer).digest('hex');
    const now = new Date();
    const key = `patients/${patientId}/${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${randomUUID()}.${EXT[mime]}`;

    await this.storage.put(key, file.buffer, mime, { patient: patientId, sha256, kind });

    const record = await this.prisma.patientFile.create({
      data: {
        patientId,
        kind,
        fileName: file.originalname.slice(0, 200),
        mimeType: mime,
        sizeBytes: file.size,
        storageKey: key,
        sha256,
        notes,
        uploadedById: actorId,
      },
      include: { uploadedBy: { select: { id: true, firstName: true, lastName: true } } },
    });

    await this.prisma.auditLog.create({
      data: {
        actorId,
        action: 'UPLOAD',
        entity: 'PatientFile',
        entityId: record.id,
        newValues: { patientId, kind, mime, sizeBytes: file.size, sha256 },
      },
    });

    return record;
  }

  findByPatient(patientId: string) {
    return this.prisma.patientFile.findMany({
      where: { patientId },
      orderBy: { createdAt: 'desc' },
      include: { uploadedBy: { select: { id: true, firstName: true, lastName: true } } },
    });
  }

  async downloadUrl(id: string, actorId: string) {
    const file = await this.prisma.patientFile.findUnique({ where: { id } });
    if (!file) throw new NotFoundException('Archivo no encontrado');
    const expiresIn = 300;
    const url = await this.storage.signedDownloadUrl(file.storageKey, file.fileName, expiresIn);

    await this.prisma.auditLog.create({
      data: { actorId, action: 'EXPORT', entity: 'PatientFile', entityId: id, newValues: { patientId: file.patientId } },
    });

    return { url, expiresIn, fileName: file.fileName, mimeType: file.mimeType };
  }
}
