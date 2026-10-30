import { NotFoundException } from '@nestjs/common';
import { OdontogramService } from './odontogram.service';
import { createPrismaMock, PrismaMock } from '../../test-utils/mocks';

describe('OdontogramService (RF-03)', () => {
  let prisma: PrismaMock;
  let service: OdontogramService;
  beforeEach(() => {
    prisma = createPrismaMock();
    service = new OdontogramService(prisma as any);
  });

  it('guarda superficies por diente y notación (FDI por defecto)', async () => {
    prisma.patient.findUnique.mockResolvedValue({ id: 'p1', isActive: true });
    prisma.odontogramRecord.upsert.mockResolvedValue({ id: 'o1' });
    await service.upsertTooth({ patientId: 'p1', toothNumber: '36', surfaces: { O: 'caries', M: 'restoration' } } as any, 'doc');
    const args = prisma.odontogramRecord.upsert.mock.calls[0][0];
    expect(args.where.patientId_toothNumber_notation).toEqual({ patientId: 'p1', toothNumber: '36', notation: 'FDI' });
    expect(args.create.surfaces).toEqual({ O: 'caries', M: 'restoration' });
    await service.upsertTooth({ patientId: 'p1', toothNumber: '19', notation: 'UNIVERSAL', surfaces: {} } as any, 'doc');
    expect(prisma.odontogramRecord.upsert.mock.calls[1][0].create.notation).toBe('UNIVERSAL');
    expect(prisma.auditLog.create).toHaveBeenCalledTimes(2);
  });

  it('404 si el paciente no existe', async () => {
    prisma.patient.findUnique.mockResolvedValue(null);
    await expect(service.upsertTooth({ patientId: 'x' } as any, 'doc')).rejects.toThrow(NotFoundException);
  });

  it('resume hallazgos por tipo y estado del diente', async () => {
    prisma.odontogramRecord.findMany.mockResolvedValue([
      { toothNumber: '16', surfaces: { O: 'caries', M: 'caries', D: null } },
      { toothNumber: '46', surfaces: { status: 'missing' } },
      { toothNumber: '36', surfaces: { O: 'restoration', status: 'crown' } },
    ]);
    const res = await service.getPatientOdontogram('p1');
    expect(res.summary).toEqual({ caries: 2, restoration: 1, 'status:missing': 1, 'status:crown': 1 });
    expect(res.notation).toBe('FDI');
  });

  it('getTooth devuelve el registro o uno vacío', async () => {
    prisma.odontogramRecord.findUnique.mockResolvedValue(null);
    await expect(service.getTooth('p1', '11')).resolves.toMatchObject({ toothNumber: '11', surfaces: {} });
    prisma.odontogramRecord.findUnique.mockResolvedValue({ id: 'o1' });
    await expect(service.getTooth('p1', '11', 'UNIVERSAL')).resolves.toEqual({ id: 'o1' });
  });
});
