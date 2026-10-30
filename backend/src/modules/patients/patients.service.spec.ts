import { ConflictException, NotFoundException } from '@nestjs/common';
import { PatientsService, detectCriticalAlert } from './patients.service';
import { createPrismaMock, PrismaMock } from '../../test-utils/mocks';

describe('detectCriticalAlert (RF-02)', () => {
  it.each([
    [{ allergies: 'Alergia a la Penicilina' }, 'Alergia a penicilina'],
    [{ allergies: 'amoxicilina' }, 'Alergia a penicilina'],
    [{ allergies: 'látex' }, 'Alergia al látex'],
    [{ allergies: 'lidocaína' }, 'Alergia a anestésicos locales'],
    [{ allergies: 'ibuprofeno' }, 'Alergia a AINEs'],
    [{ medications: 'Warfarina 5 mg' }, 'Paciente anticoagulado'],
    [{ medications: 'clopidogrel' }, 'Paciente anticoagulado'],
    [{ coagulopathies: 'Hemofilia A' }, 'Coagulopatía: Hemofilia A'],
  ] as const)('%j → %s', (mh, expected) => {
    expect(detectCriticalAlert(mh as any)).toContain(expected);
  });

  it('no alerta con negaciones ni medicamentos no relacionados', () => {
    expect(detectCriticalAlert({ allergies: 'Niega', medications: 'amoxicilina', coagulopathies: 'No' })).toBeNull();
    expect(detectCriticalAlert({ coagulopathies: 'Ninguno' })).toBeNull();
    expect(detectCriticalAlert({})).toBeNull();
  });

  it('combina varios motivos', () => {
    expect(detectCriticalAlert({ allergies: 'penicilina, látex', medications: 'sintrom' })).toBe('Alergia a penicilina · Alergia al látex · Paciente anticoagulado');
  });
});

describe('PatientsService', () => {
  let prisma: PrismaMock;
  let service: PatientsService;
  const base = {
    documentType: 'CI', documentNumber: '0912345678', firstName: 'Ana', lastName: 'Paz', birthDate: '1990-05-01',
    systemicDiseases: 'Ninguna', allergies: 'Penicilina', surgicalHistory: 'Ninguno', coagulopathies: 'No', medications: 'Ninguna',
  };

  beforeEach(() => {
    prisma = createPrismaMock();
    service = new PatientsService(prisma as any);
    prisma.patient.create.mockImplementation(async ({ data }: any) => ({ id: 'p1', ...data }));
    prisma.patient.update.mockImplementation(async ({ data }: any) => ({ id: 'p1', ...data }));
  });

  it('create detecta la alerta crítica automáticamente', async () => {
    prisma.patient.findUnique.mockResolvedValue(null);
    await service.create(base as any, 'u1');
    const mh = prisma.patient.create.mock.calls[0][0].data.medicalHistory.create;
    expect(mh).toMatchObject({ hasCriticalAlert: true, criticalAlertReason: 'Alergia a penicilina' });
    expect(prisma.patient.create.mock.calls[0][0].data.birthDate).toBeInstanceOf(Date);
  });

  it('create respeta la alerta marcada a mano', async () => {
    prisma.patient.findUnique.mockResolvedValue(null);
    await service.create({ ...base, allergies: 'Niega', hasCriticalAlert: true, criticalAlertReason: 'Cardiopatía' } as any, 'u1');
    expect(prisma.patient.create.mock.calls[0][0].data.medicalHistory.create).toMatchObject({ hasCriticalAlert: true, criticalAlertReason: 'Cardiopatía' });
  });

  it('create rechaza documento duplicado', async () => {
    prisma.patient.findUnique.mockResolvedValue({ id: 'dup' });
    await expect(service.create(base as any, 'u1')).rejects.toThrow(ConflictException);
  });

  it('findAll busca por nombre/documento/teléfono y pagina', async () => {
    prisma.patient.findMany.mockResolvedValue([{ id: 'p1' }]);
    prisma.patient.count.mockResolvedValue(41);
    const res = await service.findAll({ search: ' ana ', page: 2, limit: 20 } as any);
    const args = prisma.patient.findMany.mock.calls[0][0];
    expect(args.skip).toBe(20);
    expect(args.where.OR[0]).toEqual({ firstName: { contains: 'ana', mode: 'insensitive' } });
    expect(res.meta).toEqual({ total: 41, page: 2, limit: 20, totalPages: 3 });
    await service.findAll({} as any);
    expect(prisma.patient.findMany.mock.calls[1][0].where).toEqual({ isActive: true });
  });

  it('findOne → 404', async () => {
    prisma.patient.findUnique.mockResolvedValue(null);
    await expect(service.findOne('x')).rejects.toThrow(NotFoundException);
  });

  describe('update', () => {
    beforeEach(() => prisma.patient.findUnique.mockResolvedValue({ id: 'p1', isActive: true, documentType: 'CI', documentNumber: '1' }));

    it('valida conflicto de documento', async () => {
      prisma.patient.findFirst.mockResolvedValue({ id: 'otro' });
      await expect(service.update('p1', { documentNumber: '2' } as any, 'u1')).rejects.toThrow(ConflictException);
    });

    it('actualiza datos y detecta alerta nueva en la anamnesis', async () => {
      prisma.patient.findFirst.mockResolvedValue(null);
      await service.update('p1', { documentNumber: '2', medications: 'apixabán', birthDate: '1990-01-01', city: 'Quito' } as any, 'u1');
      const data = prisma.patient.update.mock.calls[0][0].data;
      expect(data.city).toBe('Quito');
      expect(data.birthDate).toBeInstanceOf(Date);
      expect(data.medicalHistory.upsert.update).toMatchObject({ medications: 'apixabán', hasCriticalAlert: true, criticalAlertReason: 'Paciente anticoagulado' });
      expect(data.medicalHistory.upsert.create.hasCriticalAlert).toBe(true);
    });

    it('sin cambios de anamnesis no toca la alerta', async () => {
      await service.update('p1', { city: 'Guayaquil' } as any, 'u1');
      const upd = prisma.patient.update.mock.calls[0][0].data.medicalHistory.upsert.update;
      expect(upd.hasCriticalAlert).toBeUndefined();
    });
  });

  it('updateMedicalHistory detecta alertas', async () => {
    prisma.patient.findUnique.mockResolvedValue({ id: 'p1', isActive: true });
    prisma.medicalHistory.upsert.mockResolvedValue({ id: 'mh1' });
    await service.updateMedicalHistory('p1', { allergies: 'látex' } as any, 'u1');
    const args = prisma.medicalHistory.upsert.mock.calls[0][0];
    expect(args.update).toMatchObject({ allergies: 'látex', hasCriticalAlert: true, criticalAlertReason: 'Alergia al látex' });
    expect(args.create).toMatchObject({ hasCriticalAlert: true, criticalAlertReason: 'Alergia al látex' });
    await service.updateMedicalHistory('p1', { allergies: 'Niega', hasCriticalAlert: false } as any, 'u1');
    expect(prisma.medicalHistory.upsert.mock.calls[1][0].update).toEqual({ allergies: 'Niega', hasCriticalAlert: false });
  });

  it('remove desactiva (no borra)', async () => {
    prisma.patient.findUnique.mockResolvedValue({ id: 'p1', isActive: true });
    await service.remove('p1', 'u1');
    expect(prisma.patient.update).toHaveBeenCalledWith({ where: { id: 'p1' }, data: { isActive: false } });
    expect(prisma.patient.delete).not.toHaveBeenCalled();
  });
});
