import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { TreatmentsService, discountPolicy } from './treatments.service';
import { createPrismaMock, PrismaMock } from '../../test-utils/mocks';

describe('TreatmentsService (RF-07 / RF-08)', () => {
  let prisma: PrismaMock;
  let service: TreatmentsService;
  const plan = (over: any = {}) => ({
    id: 'tp1', patientId: 'p1', title: 'Rehabilitación', status: 'ENVIADO',
    items: [{ id: 'i1', procedureId: 'pr1', quantity: 1, phase: 1 }, { id: 'i2', procedureId: 'pr2', quantity: 1, phase: 2 }],
    ...over,
  });

  beforeEach(() => {
    prisma = createPrismaMock();
    service = new TreatmentsService(prisma as any);
    prisma.treatmentPlan.create.mockImplementation(async ({ data }: any) => ({ id: 'tp1', ...data }));
    prisma.appointment.create.mockImplementation(async ({ data }: any) => ({ id: 'a-' + data.startAt.getTime(), ...data }));
    prisma.appointment.findFirst.mockResolvedValue(null);
  });

  it('presupuesto multinivel: honorarios + laboratorio − descuentos', async () => {
    prisma.patient.findUnique.mockResolvedValue({ isActive: true });
    const res: any = await service.create({
      patientId: 'p1', discount: 20, discountReason: 'Convenio empresa',
      items: [
        { procedureId: 'pr1', unitPrice: 100, quantity: 2, labCost: 50, discount: 10, phase: 1 },
        { procedureId: 'pr2', unitPrice: 300, phase: 2 },
      ],
    } as any, 'doc');
    expect(res.totalAmount).toBe(200 + 50 - 10 + 300 - 20);
    expect(res.items.create.map((i: any) => i.phase)).toEqual([1, 2]);
    expect(res.status).toBe('BORRADOR');
  });

  it('create: validaciones', async () => {
    prisma.patient.findUnique.mockResolvedValue(null);
    await expect(service.create({ patientId: 'x', items: [{}] } as any, 'd')).rejects.toThrow(NotFoundException);
    prisma.patient.findUnique.mockResolvedValue({ isActive: true });
    await expect(service.create({ patientId: 'p', items: [] } as any, 'd')).rejects.toThrow(BadRequestException);
  });

  it('consultas y envío', async () => {
    prisma.treatmentPlan.findMany.mockResolvedValue([]);
    await service.findByPatient('p1');
    prisma.treatmentPlan.findUnique.mockResolvedValue(null);
    await expect(service.findOne('x')).rejects.toThrow(NotFoundException);
    prisma.treatmentPlan.findUnique.mockResolvedValue(plan());
    await service.sendToPatient('tp1', 'd');
    expect(prisma.treatmentPlan.update.mock.calls[0][0].data.status).toBe('ENVIADO');
  });

  describe('approve', () => {
    beforeEach(() => prisma.treatmentPlan.findUnique.mockResolvedValue(plan()));

    it('aprobación parcial', async () => {
      prisma.treatmentPlanItem.findMany.mockResolvedValue([{ id: 'i1', isApproved: false }, { id: 'i2', isApproved: false }]);
      await service.approve('tp1', { itemIds: ['i1'] } as any, 'd');
      expect(prisma.treatmentPlan.update.mock.calls[0][0].data.status).toBe('APROBADO_PARCIAL');
    });

    it('aprobación total + citas encadenadas con validación RN-03', async () => {
      prisma.treatmentPlanItem.findMany.mockResolvedValue([{ id: 'i1' }, { id: 'i2' }]);
      const res: any = await service.approve('tp1', { itemIds: ['i1', 'i2'], createAppointments: true, doctorId: 'd1', chairId: 'c1', startAt: '2026-11-03T14:00:00Z', slotMinutes: 45 } as any, 'd');
      expect(prisma.treatmentPlan.update.mock.calls[0][0].data.status).toBe('APROBADO_TOTAL');
      expect(res.appointmentsCreated).toHaveLength(2);
      expect(prisma.appointment.create.mock.calls[1][0].data.startAt).toEqual(new Date('2026-11-03T14:45:00Z'));
      expect(prisma.appointment.findFirst).toHaveBeenCalledTimes(2);
    });

    it('RN-03: no crea ninguna cita si algún turno choca', async () => {
      prisma.treatmentPlanItem.findMany.mockResolvedValue([{ id: 'i1' }, { id: 'i2' }]);
      prisma.appointment.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'ocupado' });
      await expect(service.approve('tp1', { itemIds: ['i1', 'i2'], createAppointments: true, doctorId: 'd1', chairId: 'c1', startAt: '2026-11-03T14:00:00Z' } as any, 'd')).rejects.toThrow(ConflictException);
      expect(prisma.appointment.create).not.toHaveBeenCalled();
    });

    it('validaciones', async () => {
      prisma.treatmentPlanItem.findMany.mockResolvedValue([{ id: 'i1' }]);
      await expect(service.approve('tp1', { itemIds: ['zz'] } as any, 'd')).rejects.toThrow('al menos un ítem');
      await expect(service.approve('tp1', { itemIds: ['i1'], createAppointments: true } as any, 'd')).rejects.toThrow('doctorId');
      prisma.treatmentPlan.findUnique.mockResolvedValue(plan({ status: 'RECHAZADO' }));
      await expect(service.approve('tp1', { itemIds: ['i1'] } as any, 'd')).rejects.toThrow('no admite');
    });
  });

  describe('RF-07: descuentos autorizados', () => {
    const env = { ...process.env };
    afterEach(() => { process.env = { ...env }; });
    beforeEach(() => prisma.patient.findUnique.mockResolvedValue({ isActive: true }));
    const items = [{ procedureId: 'pr1', unitPrice: 100 }];

    it('política por defecto y configurable', () => {
      expect(discountPolicy({})).toEqual({ autoApprovePercent: 0, approverRoles: ['ADMIN_TI', 'ODONTOLOGO', 'ESPECIALISTA'] });
      expect(discountPolicy({ DISCOUNT_AUTO_APPROVE_PERCENT: '10', DISCOUNT_APPROVER_ROLES: 'ADMIN_TI' })).toEqual({ autoApprovePercent: 10, approverRoles: ['ADMIN_TI'] });
    });

    it('sin descuento → NONE; con descuento → PENDING y exige motivo', async () => {
      await service.create({ patientId: 'p1', items } as any, 'recep');
      expect(prisma.treatmentPlan.create.mock.calls[0][0].data).toMatchObject({ discountStatus: 'NONE', createdById: 'recep' });
      await expect(service.create({ patientId: 'p1', items, discount: 10 } as any, 'recep')).rejects.toThrow('motivo');
      await service.create({ patientId: 'p1', items: [{ ...items[0], discount: 5 }], discountReason: 'Paciente frecuente' } as any, 'recep');
      expect(prisma.treatmentPlan.create.mock.calls[1][0].data).toMatchObject({ discountStatus: 'PENDING', discountReason: 'Paciente frecuente' });
    });

    it('auto-aprobación bajo el umbral configurado', async () => {
      process.env.DISCOUNT_AUTO_APPROVE_PERCENT = '10';
      await service.create({ patientId: 'p1', items, discount: 10 } as any, 'recep');
      expect(prisma.treatmentPlan.create.mock.calls[0][0].data.discountStatus).toBe('APPROVED');
    });

    it('descuentos inválidos', async () => {
      await expect(service.create({ patientId: 'p1', items, discount: 150, discountReason: 'x' } as any, 'r')).rejects.toThrow('superar');
      await expect(service.create({ patientId: 'p1', items, discount: -5 } as any, 'r')).rejects.toThrow('negativo');
    });

    it('bloquea enviar/aprobar mientras esté pendiente o rechazado', async () => {
      prisma.treatmentPlan.findUnique.mockResolvedValue(plan({ discountStatus: 'PENDING' }));
      await expect(service.sendToPatient('tp1', 'r')).rejects.toThrow(ForbiddenException);
      await expect(service.approve('tp1', { itemIds: ['i1'] } as any, 'r')).rejects.toThrow('pendiente de autorización');
      prisma.treatmentPlan.findUnique.mockResolvedValue(plan({ discountStatus: 'REJECTED' }));
      await expect(service.sendToPatient('tp1', 'r')).rejects.toThrow('rechazado');
    });

    it('autorizar: rol permitido, no el creador (cuatro ojos), con auditoría', async () => {
      prisma.treatmentPlan.findUnique.mockResolvedValue(plan({ discountStatus: 'PENDING', createdById: 'recep', discount: 20 }));
      prisma.treatmentPlan.update.mockImplementation(async ({ data }: any) => data);
      await expect(service.reviewDiscount('tp1', { approve: true }, { id: 'x', role: 'CAJERO' })).rejects.toThrow('rol');
      await expect(service.reviewDiscount('tp1', { approve: true }, { id: 'recep', role: 'ADMIN_TI' })).rejects.toThrow('usted creó');
      await expect(service.reviewDiscount('tp1', { approve: false }, { id: 'doc', role: 'ODONTOLOGO' })).rejects.toThrow('motivo del rechazo');
      await expect(service.reviewDiscount('tp1', { approve: true, note: 'OK' }, { id: 'doc', role: 'ODONTOLOGO' })).resolves.toMatchObject({ discountStatus: 'APPROVED', discountReviewedById: 'doc' });
      expect(prisma.auditLog.create.mock.calls.at(-1)[0].data.action).toBe('DISCOUNT_APPROVED');
      await service.reviewDiscount('tp1', { approve: false, note: 'Excede política' }, { id: 'doc', role: 'ESPECIALISTA' });
      expect(prisma.auditLog.create.mock.calls.at(-1)[0].data.action).toBe('DISCOUNT_REJECTED');
      prisma.treatmentPlan.findUnique.mockResolvedValue(plan({ discountStatus: 'NONE' }));
      await expect(service.reviewDiscount('tp1', { approve: true }, { id: 'doc', role: 'ODONTOLOGO' })).rejects.toThrow('no tiene un descuento pendiente');
    });

    it('bandeja de pendientes', async () => {
      prisma.treatmentPlan.findMany.mockResolvedValue([]);
      await service.pendingDiscounts();
      expect(prisma.treatmentPlan.findMany.mock.calls[0][0].where).toEqual({ discountStatus: 'PENDING' });
    });
  });
});
