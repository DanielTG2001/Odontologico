import { BadRequestException, NotFoundException, PayloadTooLargeException } from '@nestjs/common';
import { createHash } from 'crypto';
import { FilesService, detectMime, MAX_FILE_BYTES } from './files.service';
import { createPrismaMock, PrismaMock } from '../../test-utils/mocks';

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]);
const PDF = Buffer.from('%PDF-1.7\n...');
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP')]);
const DICOM = Buffer.concat([Buffer.alloc(128), Buffer.from('DICM'), Buffer.alloc(4)]);

describe('detectMime', () => {
  it('reconoce los formatos por magic bytes', () => {
    expect(detectMime(JPEG)).toBe('image/jpeg');
    expect(detectMime(PNG)).toBe('image/png');
    expect(detectMime(PDF)).toBe('application/pdf');
    expect(detectMime(WEBP)).toBe('image/webp');
    expect(detectMime(DICOM)).toBe('application/dicom');
  });
  it('rechaza ejecutables o HTML disfrazados', () => {
    expect(detectMime(Buffer.from('MZ\x90\x00'))).toBeNull();
    expect(detectMime(Buffer.from('<html><script>'))).toBeNull();
  });
});

describe('FilesService', () => {
  let prisma: PrismaMock;
  let storage: { put: jest.Mock; signedDownloadUrl: jest.Mock };
  let service: FilesService;

  beforeEach(() => {
    prisma = createPrismaMock();
    storage = { put: jest.fn().mockResolvedValue({}), signedDownloadUrl: jest.fn().mockResolvedValue('https://signed/url') };
    service = new FilesService(prisma as any, storage as any);
    prisma.patient.findUnique.mockResolvedValue({ id: 'p1', isActive: true });
    prisma.patientFile.create.mockImplementation(async ({ data }: any) => ({ id: 'f1', ...data }));
  });

  it('sube a S3 con clave aleatoria por paciente, guarda SHA-256 y audita', async () => {
    const file = { originalname: 'pano.jpg', mimetype: 'image/jpeg', size: JPEG.length, buffer: JPEG };
    const res: any = await service.upload('p1', file, 'RX_PANORAMICA' as any, 'control', 'doc');
    const [key, body, mime, meta] = storage.put.mock.calls[0];
    expect(key).toMatch(/^patients\/p1\/\d{4}\/\d{2}\/[0-9a-f-]{36}\.jpg$/);
    expect(body).toBe(JPEG);
    expect(mime).toBe('image/jpeg');
    expect(meta.sha256).toBe(createHash('sha256').update(JPEG).digest('hex'));
    expect(res).toMatchObject({ kind: 'RX_PANORAMICA', storageKey: key, mimeType: 'image/jpeg', notes: 'control' });
    expect(prisma.auditLog.create.mock.calls[0][0].data.action).toBe('UPLOAD');
  });

  it('usa el tipo real aunque el navegador diga otra cosa', async () => {
    await service.upload('p1', { originalname: 'x.png', mimetype: 'image/png', size: PDF.length, buffer: PDF }, 'DOCUMENTO' as any, undefined, 'doc');
    expect(storage.put.mock.calls[0][2]).toBe('application/pdf');
  });

  it('validaciones', async () => {
    await expect(service.upload('p1', undefined, 'OTRO' as any, undefined, 'd')).rejects.toThrow(BadRequestException);
    await expect(service.upload('p1', { originalname: 'a', mimetype: '', size: MAX_FILE_BYTES + 1, buffer: JPEG }, 'OTRO' as any, undefined, 'd')).rejects.toThrow(PayloadTooLargeException);
    await expect(service.upload('p1', { originalname: 'a.exe', mimetype: 'image/jpeg', size: 4, buffer: Buffer.from('MZ..') }, 'OTRO' as any, undefined, 'd')).rejects.toThrow('Formato no permitido');
    prisma.patient.findUnique.mockResolvedValue(null);
    await expect(service.upload('x', { originalname: 'a', mimetype: '', size: 7, buffer: JPEG }, 'OTRO' as any, undefined, 'd')).rejects.toThrow(NotFoundException);
    expect(storage.put).not.toHaveBeenCalled();
  });

  it('descarga con URL firmada de 5 min y la audita como EXPORT', async () => {
    prisma.patientFile.findUnique.mockResolvedValue({ id: 'f1', patientId: 'p1', storageKey: 'k', fileName: 'pano.jpg', mimeType: 'image/jpeg' });
    await expect(service.downloadUrl('f1', 'doc')).resolves.toMatchObject({ url: 'https://signed/url', expiresIn: 300 });
    expect(storage.signedDownloadUrl).toHaveBeenCalledWith('k', 'pano.jpg', 300);
    expect(prisma.auditLog.create.mock.calls[0][0].data).toMatchObject({ action: 'EXPORT', entityId: 'f1' });
    prisma.patientFile.findUnique.mockResolvedValue(null);
    await expect(service.downloadUrl('x', 'doc')).rejects.toThrow(NotFoundException);
  });

  it('lista archivos del paciente', async () => {
    prisma.patientFile.findMany.mockResolvedValue([]);
    await service.findByPatient('p1');
    expect(prisma.patientFile.findMany.mock.calls[0][0].where).toEqual({ patientId: 'p1' });
  });
});
