import { BadRequestException, NotFoundException } from '@nestjs/common';
import { VitalSignsService } from './vital-signs.service';
import { bmi, evaluateVitals } from './vital-alerts';
import { createPrismaMock, PrismaMock } from '../../test-utils/mocks';

const levels = (v: any) => evaluateVitals(v).map((a) => `${a.field}:${a.level}`);

describe('evaluateVitals', () => {
  it('valores normales no generan alertas', () => {
    expect(evaluateVitals({ systolic: 118, diastolic: 76, heartRate: 72, respiratoryRate: 16, temperature: 36.6, oxygenSaturation: 98, glucose: 95 })).toEqual([]);
    expect(evaluateVitals({})).toEqual([]);
  });
  it('presión arterial', () => {
    expect(levels({ systolic: 185, diastolic: 95 })).toEqual(['bloodPressure:critical']);
    expect(levels({ systolic: 130, diastolic: 112 })).toEqual(['bloodPressure:critical']);
    expect(levels({ systolic: 145, diastolic: 85 })).toEqual(['bloodPressure:warning']);
    expect(levels({ systolic: 85, diastolic: 60 })).toEqual(['bloodPressure:warning']);
    expect(levels({ systolic: 80, diastolic: 90 })).toContain('bloodPressure:warning');
  });
  it('frecuencia cardíaca y respiratoria', () => {
    expect(levels({ heartRate: 130 })).toEqual(['heartRate:critical']);
    expect(levels({ heartRate: 40 })).toEqual(['heartRate:critical']);
    expect(levels({ heartRate: 105 })).toEqual(['heartRate:warning']);
    expect(levels({ heartRate: 48 })).toEqual(['heartRate:warning']);
    expect(levels({ respiratoryRate: 28 })).toEqual(['respiratoryRate:warning']);
  });
  it('temperatura, SpO2 y glucosa', () => {
    expect(levels({ temperature: 39.2 })).toEqual(['temperature:critical']);
    expect(levels({ temperature: 38.1 })).toEqual(['temperature:warning']);
    expect(levels({ temperature: 34.5 })).toEqual(['temperature:warning']);
    expect(levels({ oxygenSaturation: 88 })).toEqual(['oxygenSaturation:critical']);
    expect(levels({ oxygenSaturation: 92 })).toEqual(['oxygenSaturation:warning']);
    expect(levels({ glucose: 60 })).toEqual(['glucose:critical']);
    expect(levels({ glucose: 320 })).toEqual(['glucose:critical']);
    expect(levels({ glucose: 230 })).toEqual(['glucose:warning']);
  });
  it('IMC', () => {
    expect(bmi(70, 175)).toBe(22.9);
    expect(bmi(null, 170)).toBeNull();
  });
});

describe('VitalSignsService', () => {
  let prisma: PrismaMock;
  let service: VitalSignsService;
  beforeEach(() => {
    prisma = createPrismaMock();
    service = new VitalSignsService(prisma as any);
    prisma.patient.findUnique.mockResolvedValue({ id: 'p1', isActive: true });
    prisma.vitalSign.create.mockImplementation(async ({ data }: any) => ({ id: 'v1', ...data }));
  });

  it('registra, calcula alertas e IMC y audita', async () => {
    const res: any = await service.create({ patientId: 'p1', systolic: 190, diastolic: 100, weightKg: 80, heightCm: 180 } as any, 'asis');
    expect(res.alerts[0]).toMatchObject({ level: 'critical' });
    expect(res.bmi).toBe(24.7);
    expect(prisma.vitalSign.create.mock.calls[0][0].data).toMatchObject({ recordedById: 'asis', systolic: 190 });
    expect(prisma.auditLog.create.mock.calls[0][0].data.newValues.alerts).toHaveLength(1);
  });

  it('sin alertas no guarda el campo', async () => {
    await service.create({ patientId: 'p1', heartRate: 70 } as any, 'asis');
    expect(prisma.vitalSign.create.mock.calls[0][0].data.alerts).toBeUndefined();
  });

  it('validaciones', async () => {
    await expect(service.create({ patientId: 'p1', notes: 'x' } as any, 'a')).rejects.toThrow(BadRequestException);
    prisma.appointment.findUnique.mockResolvedValue({ patientId: 'otro' });
    await expect(service.create({ patientId: 'p1', appointmentId: 'a1', heartRate: 70 } as any, 'a')).rejects.toThrow(BadRequestException);
    prisma.appointment.findUnique.mockResolvedValue({ patientId: 'p1' });
    await expect(service.create({ patientId: 'p1', appointmentId: 'a1', heartRate: 70 } as any, 'a')).resolves.toBeDefined();
    prisma.patient.findUnique.mockResolvedValue(null);
    await expect(service.create({ patientId: 'x', heartRate: 70 } as any, 'a')).rejects.toThrow(NotFoundException);
  });

  it('historial con IMC y límite acotado', async () => {
    prisma.vitalSign.findMany.mockResolvedValue([{ id: 'v1', weightKg: '70', heightCm: '175' }, { id: 'v2', weightKg: null, heightCm: null }]);
    const rows: any = await service.findByPatient('p1', 999);
    expect(prisma.vitalSign.findMany.mock.calls[0][0].take).toBe(200);
    expect(rows.map((r: any) => r.bmi)).toEqual([22.9, null]);
    await service.findByPatient('p1', 0);
    expect(prisma.vitalSign.findMany.mock.calls[1][0].take).toBe(1);
  });
});
