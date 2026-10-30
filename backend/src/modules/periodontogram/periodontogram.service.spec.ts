import { NotFoundException } from '@nestjs/common';
import { PeriodontogramService } from './periodontogram.service';
import { createPrismaMock, PrismaMock } from '../../test-utils/mocks';

describe('PeriodontogramService (RF-04)', () => {
  let prisma: PrismaMock;
  let service: PeriodontogramService;
  beforeEach(() => {
    prisma = createPrismaMock();
    service = new PeriodontogramService(prisma as any);
    prisma.patient.findUnique.mockResolvedValue({ id: 'p1', isActive: true });
    prisma.periodontogramRecord.create.mockImplementation(async ({ data }: any) => ({ id: 'r1', ...data }));
  });

  it('calcula NIC = PS − MG en los 6 puntos (MG negativo = recesión)', async () => {
    const pd = { DB: 3, B: 2, MB: 5, DL: 4, L: 2, ML: 3 };
    const gm = { DB: -2, B: 0, MB: 1, DL: -1, L: 0, ML: 0 };
    const rec: any = await service.create({ patientId: 'p1', toothNumber: '16', probingDepths: pd, gingivalMargin: gm } as any, 'doc');
    expect(rec.clinicalAttachmentLevel).toEqual({ DB: 5, B: 2, MB: 4, DL: 5, L: 2, ML: 3 });
  });

  it('respeta el NIC capturado y no calcula sin margen', async () => {
    const r1: any = await service.create({ patientId: 'p1', toothNumber: '16', probingDepths: { B: 3 }, gingivalMargin: { B: -1 }, clinicalAttachmentLevel: { B: 9 } } as any, 'doc');
    expect(r1.clinicalAttachmentLevel).toEqual({ B: 9 });
    const r2: any = await service.create({ patientId: 'p1', toothNumber: '16', probingDepths: { B: 3 } } as any, 'doc');
    expect(r2.clinicalAttachmentLevel).toBeUndefined();
  });

  it('valores faltantes cuentan como 0', async () => {
    const r: any = await service.create({ patientId: 'p1', toothNumber: '16', probingDepths: { B: 0, L: 4 }, gingivalMargin: { L: -2 } } as any, 'doc');
    expect(r.clinicalAttachmentLevel).toEqual({ B: 0, L: 6 });
  });

  it('404 si no hay paciente', async () => {
    prisma.patient.findUnique.mockResolvedValue(null);
    await expect(service.create({ patientId: 'x' } as any, 'doc')).rejects.toThrow(NotFoundException);
  });

  it('consulta por fecha y último examen', async () => {
    const examDate = new Date('2026-10-20T15:00:00Z');
    prisma.periodontogramRecord.findMany.mockResolvedValue([{ examDate }, { examDate }]);
    const res = await service.getByPatient('p1', '2026-10-20');
    expect(res.examDates).toHaveLength(1);
    expect(prisma.periodontogramRecord.findMany.mock.calls[0][0].where.examDate).toBeDefined();
    prisma.periodontogramRecord.findFirst.mockResolvedValue(null);
    await expect(service.getLatestFull('p1')).resolves.toEqual({ patientId: 'p1', records: [], examDate: null });
    prisma.periodontogramRecord.findFirst.mockResolvedValue({ examDate });
    await expect(service.getLatestFull('p1')).resolves.toMatchObject({ patientId: 'p1' });
  });
});
