import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ClinicalNotesService } from './clinical-notes.service';
import { configOf, createPrismaMock, H, PrismaMock } from '../../test-utils/mocks';

const fresh = () => ({ id: 'n1', authorId: 'doc', isLocked: false, signedAt: null, createdAt: new Date() });
const old = () => ({ ...fresh(), createdAt: new Date(Date.now() - 25 * H) });

describe('ClinicalNotesService (RF-05 / RN-01)', () => {
  let prisma: PrismaMock;
  let service: ClinicalNotesService;

  beforeEach(() => {
    prisma = createPrismaMock();
    service = new ClinicalNotesService(prisma as any, configOf({}));
    prisma.clinicalNote.update.mockImplementation(async ({ data }: any) => ({ id: 'n1', ...data }));
  });

  it('usa el plazo configurable (CLINICAL_NOTE_LOCK_HOURS)', () => {
    const s = new ClinicalNotesService(prisma as any, configOf({ CLINICAL_NOTE_LOCK_HOURS: '2' }));
    expect(s.isClosed({ isLocked: false, createdAt: new Date(Date.now() - 3 * H) })).toBe(true);
    expect(s.isClosed({ isLocked: false, createdAt: new Date(Date.now() - 1 * H) })).toBe(false);
  });

  describe('create', () => {
    it('crea la nota SOEP y audita', async () => {
      prisma.patient.findUnique.mockResolvedValue({ id: 'p1', isActive: true });
      prisma.clinicalNote.create.mockResolvedValue({ id: 'n1' });
      await service.create({ patientId: 'p1', subjective: 'Dolor', objective: 'Caries', evaluation: 'Pulpitis', plan: 'Endo' } as any, 'doc');
      expect(prisma.clinicalNote.create.mock.calls[0][0].data).toMatchObject({ authorId: 'doc', subjective: 'Dolor', plan: 'Endo' });
      expect(prisma.auditLog.create).toHaveBeenCalled();
    });
    it('404 si el paciente no existe', async () => {
      prisma.patient.findUnique.mockResolvedValue(null);
      await expect(service.create({ patientId: 'x' } as any, 'doc')).rejects.toThrow(NotFoundException);
    });
  });

  it('findByPatient incluye las adendas en orden', async () => {
    prisma.clinicalNote.findMany.mockResolvedValue([]);
    await service.findByPatient('p1');
    expect(prisma.clinicalNote.findMany.mock.calls[0][0].include.addenda.orderBy).toEqual({ createdAt: 'asc' });
  });

  it('findOne → 404', async () => {
    prisma.clinicalNote.findUnique.mockResolvedValue(null);
    await expect(service.findOne('x')).rejects.toThrow(NotFoundException);
  });

  describe('update', () => {
    it('edita dentro del plazo', async () => {
      prisma.clinicalNote.findUnique.mockResolvedValue(fresh());
      await service.update('n1', { plan: 'nuevo' } as any, 'doc');
      expect(prisma.clinicalNote.update.mock.calls[0][0].data).toEqual({ plan: 'nuevo' });
    });
    it('bloqueada → 403 indicando usar adenda', async () => {
      prisma.clinicalNote.findUnique.mockResolvedValue({ ...fresh(), isLocked: true });
      await expect(service.update('n1', {} as any, 'doc')).rejects.toThrow(/adenda/);
    });
    it('fuera de plazo (24 h) → 403', async () => {
      prisma.clinicalNote.findUnique.mockResolvedValue(old());
      await expect(service.update('n1', {} as any, 'doc')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('sign', () => {
    it('firma y bloquea', async () => {
      prisma.clinicalNote.findUnique.mockResolvedValue(fresh());
      const res: any = await service.sign('n1', 'doc');
      expect(res).toMatchObject({ isLocked: true, signatureData: expect.stringContaining('signed-by-doc') });
    });
    it('solo el autor puede firmar', async () => {
      prisma.clinicalNote.findUnique.mockResolvedValue(fresh());
      await expect(service.sign('n1', 'otro')).rejects.toThrow(ForbiddenException);
    });
    it('no se re-firma', async () => {
      prisma.clinicalNote.findUnique.mockResolvedValue({ ...fresh(), isLocked: true, signedAt: new Date() });
      await expect(service.sign('n1', 'doc', 'img')).rejects.toThrow(BadRequestException);
    });
  });

  describe('addAddendum', () => {
    const dto = { reason: 'Error de pieza', content: 'Corrijo: la pieza tratada es la 36, no la 46.' };

    it('nota aún editable → 400 (corregir directamente)', async () => {
      prisma.clinicalNote.findUnique.mockResolvedValue(fresh());
      await expect(service.addAddendum('n1', dto, 'doc')).rejects.toThrow(BadRequestException);
    });

    it('crea adenda firmada con hash SHA-256 sobre nota firmada', async () => {
      prisma.clinicalNote.findUnique.mockResolvedValue({ ...fresh(), isLocked: true, signedAt: new Date() });
      prisma.clinicalNoteAddendum.create.mockImplementation(async ({ data }: any) => ({ id: 'ad1', ...data }));
      const res: any = await service.addAddendum('n1', { ...dto, reason: '  Error de pieza  ' }, 'doc');
      expect(res).toMatchObject({ noteId: 'n1', authorId: 'doc', reason: 'Error de pieza' });
      expect(res.signatureData).toMatch(/^sha256:[a-f0-9]{64}$/);
      expect(prisma.auditLog.create.mock.calls[0][0].data).toMatchObject({ action: 'ADDENDUM', entityId: 'n1' });
    });

    it('acepta firma táctil y notas vencidas por plazo', async () => {
      prisma.clinicalNote.findUnique.mockResolvedValue(old());
      prisma.clinicalNoteAddendum.create.mockImplementation(async ({ data }: any) => ({ id: 'ad2', ...data }));
      const res: any = await service.addAddendum('n1', { ...dto, signatureData: 'data:image/png;base64,AAA' }, 'otro-doc');
      expect(res.signatureData).toBe('data:image/png;base64,AAA');
    });
  });

  it('lockExpiredNotes bloquea las notas vencidas', async () => {
    prisma.clinicalNote.updateMany.mockResolvedValue({ count: 3 });
    await expect(service.lockExpiredNotes()).resolves.toEqual({ locked: 3 });
    expect(prisma.clinicalNote.updateMany.mock.calls[0][0].where.isLocked).toBe(false);
  });
});
