import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrescriptionsService } from './prescriptions.service';
import { findAllergyConflicts, findAnticoagulantWarnings } from './allergy-check';
import { createPrismaMock, PrismaMock } from '../../test-utils/mocks';

describe('allergy-check', () => {
  it('detecta familias de medicamentos contra las alergias', () => {
    expect(findAllergyConflicts('alérgico a la penicilina', ['Amoxicilina + ácido clavulánico'])).toEqual([{ medication: 'Amoxicilina + ácido clavulánico', family: 'Penicilinas / betalactámicos' }]);
    expect(findAllergyConflicts('AINES', ['Ketorolaco', 'Paracetamol'])).toHaveLength(1);
    expect(findAllergyConflicts('lidocaína', ['Articaína 4%'])).toHaveLength(1);
    expect(findAllergyConflicts('sulfas', ['Cotrimoxazol'])).toHaveLength(1);
    expect(findAllergyConflicts('clindamicina', ['Clindamicina 300'])).toHaveLength(1);
  });
  it('sin alergias o negadas → sin conflictos', () => {
    expect(findAllergyConflicts(null, ['Amoxicilina'])).toEqual([]);
    expect(findAllergyConflicts('Niega', ['Amoxicilina'])).toEqual([]);
    expect(findAllergyConflicts('penicilina', ['Clindamicina'])).toEqual([]);
  });
  it('advierte AINEs en anticoagulados', () => {
    expect(findAnticoagulantWarnings('Warfarina', null, ['Ibuprofeno', 'Paracetamol'])).toHaveLength(1);
    expect(findAnticoagulantWarnings(null, 'anticoagulado', ['Naproxeno'])).toHaveLength(1);
    expect(findAnticoagulantWarnings('Metformina', null, ['Ibuprofeno'])).toEqual([]);
  });
});

describe('PrescriptionsService', () => {
  let prisma: PrismaMock;
  let service: PrescriptionsService;
  const items = [{ medication: 'Amoxicilina', presentation: '500 mg', dose: '1 cápsula', frequency: 'c/8h', duration: '7 días' }];

  beforeEach(() => {
    prisma = createPrismaMock();
    service = new PrescriptionsService(prisma as any);
    prisma.patient.findUnique.mockResolvedValue({ id: 'p1', isActive: true, medicalHistory: { allergies: 'Niega', medications: null, coagulopathies: null } });
    prisma.prescription.findFirst.mockResolvedValue(null);
    prisma.prescription.create.mockImplementation(async ({ data }: any) => ({ id: 'rx1', ...data, items: data.items.create }));
    prisma.prescription.update.mockImplementation(async ({ data }: any) => ({ id: 'rx1', ...data }));
  });

  it('crea la receta firmada con número correlativo', async () => {
    const res: any = await service.create({ patientId: 'p1', items, diagnosis: 'Absceso' } as any, 'doc');
    const year = new Date().getFullYear();
    expect(res.number).toBe(`RX-${year}-000001`);
    expect(res.signatureData).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(res.items[0]).toMatchObject({ medication: 'Amoxicilina', route: 'Oral' });
    expect(res.warnings).toEqual([]);
    prisma.prescription.findFirst.mockResolvedValue({ number: `RX-${year}-000041` });
    expect((await service.create({ patientId: 'p1', items } as any, 'doc') as any).number).toBe(`RX-${year}-000042`);
  });

  it('bloquea con 409 si hay alergia, salvo justificación', async () => {
    prisma.patient.findUnique.mockResolvedValue({ id: 'p1', isActive: true, medicalHistory: { allergies: 'Penicilina' } });
    const err = await service.create({ patientId: 'p1', items } as any, 'doc').catch((e) => e);
    expect(err).toBeInstanceOf(ConflictException);
    expect(err.getResponse()).toMatchObject({ code: 'ALLERGY_CONFLICT' });
    const ok: any = await service.create({ patientId: 'p1', items, allergyOverride: 'Prueba cutánea negativa reciente' } as any, 'doc');
    expect(ok.allergyOverride).toBe('Prueba cutánea negativa reciente');
  });

  it('devuelve advertencias para anticoagulados', async () => {
    prisma.patient.findUnique.mockResolvedValue({ id: 'p1', isActive: true, medicalHistory: { allergies: null, medications: 'Rivaroxabán' } });
    const res: any = await service.create({ patientId: 'p1', items: [{ ...items[0], medication: 'Ibuprofeno' }] } as any, 'doc');
    expect(res.warnings[0]).toContain('anticoagulado');
  });

  it('valida paciente y cita', async () => {
    prisma.appointment.findUnique.mockResolvedValue({ patientId: 'otro' });
    await expect(service.create({ patientId: 'p1', appointmentId: 'a1', items } as any, 'doc')).rejects.toThrow(BadRequestException);
    prisma.appointment.findUnique.mockResolvedValue({ patientId: 'p1' });
    await expect(service.create({ patientId: 'p1', appointmentId: 'a1', items } as any, 'doc')).resolves.toBeDefined();
    prisma.patient.findUnique.mockResolvedValue(null);
    await expect(service.create({ patientId: 'x', items } as any, 'doc')).rejects.toThrow(NotFoundException);
  });

  it('anular: solo el autor, con motivo, una vez (RN-01: no se borra)', async () => {
    prisma.prescription.findUnique.mockResolvedValue({ id: 'rx1', doctorId: 'doc', status: 'ACTIVE' });
    await expect(service.annul('rx1', { reason: 'Dosis errónea' }, 'otro')).rejects.toThrow(ForbiddenException);
    await expect(service.annul('rx1', { reason: 'Dosis errónea' }, 'doc')).resolves.toMatchObject({ status: 'ANNULLED', annulReason: 'Dosis errónea' });
    expect(prisma.prescription.delete).not.toHaveBeenCalled();
    prisma.prescription.findUnique.mockResolvedValue({ id: 'rx1', doctorId: 'doc', status: 'ANNULLED' });
    await expect(service.annul('rx1', { reason: 'x' } as any, 'doc')).rejects.toThrow(BadRequestException);
  });

  it('consultas', async () => {
    prisma.prescription.findMany.mockResolvedValue([]);
    await expect(service.findByPatient('p1')).resolves.toEqual([]);
    prisma.prescription.findUnique.mockResolvedValue(null);
    await expect(service.findOne('x')).rejects.toThrow(NotFoundException);
  });
});
