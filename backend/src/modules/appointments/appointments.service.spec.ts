import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { AppointmentsService } from './appointments.service';
import { createPrismaMock, PrismaMock } from '../../test-utils/mocks';

const dto = {
  patientId: 'p1',
  doctorId: 'd1',
  chairId: 'c1',
  startAt: '2026-11-02T15:00:00.000Z',
  endAt: '2026-11-02T15:30:00.000Z',
  reason: 'Control',
};

describe('AppointmentsService', () => {
  let prisma: PrismaMock;
  let inventory: { autoDeductForAppointment: jest.Mock };
  let service: AppointmentsService;

  beforeEach(() => {
    prisma = createPrismaMock();
    inventory = { autoDeductForAppointment: jest.fn().mockResolvedValue({ deductions: [{ ok: true }] }) };
    service = new AppointmentsService(prisma as any, inventory as any);
    prisma.patient.findUnique.mockResolvedValue({ id: 'p1', isActive: true });
    prisma.user.findUnique.mockResolvedValue({ id: 'd1', isActive: true });
    prisma.chair.findUnique.mockResolvedValue({ id: 'c1', isActive: true });
    prisma.appointment.findFirst.mockResolvedValue(null);
    prisma.appointment.create.mockResolvedValue({ id: 'a1', ...dto });
    prisma.appointment.update.mockImplementation(async ({ data }: any) => ({ id: 'a1', ...data }));
    prisma.stockMovement.count.mockResolvedValue(0);
  });

  describe('create + RN-03 (sobreposición de sillón)', () => {
    it('crea la cita y la audita', async () => {
      await expect(service.create({ ...dto, items: [{ procedureId: 'pr1' }] } as any, 'u1')).resolves.toMatchObject({ id: 'a1' });
      const where = prisma.appointment.findFirst.mock.calls[0][0].where;
      expect(where).toMatchObject({ chairId: 'c1', startAt: { lt: new Date(dto.endAt) }, endAt: { gt: new Date(dto.startAt) } });
      expect(where.status.notIn).toEqual(['CANCELADO', 'NO_ASISTIO']);
      expect(prisma.appointment.create.mock.calls[0][0].data.items.create[0]).toEqual({ procedureId: 'pr1', quantity: 1, notes: undefined });
      expect(prisma.auditLog.create).toHaveBeenCalled();
    });

    it('rechaza una cita que se cruza en el mismo sillón aunque sea otro odontólogo', async () => {
      prisma.appointment.findFirst.mockResolvedValue({
        id: 'other', startAt: new Date(dto.startAt), endAt: new Date(dto.endAt),
        patient: { firstName: 'Luis', lastName: 'P' }, doctor: { firstName: 'Otro', lastName: 'Dr' },
      });
      await expect(service.create(dto as any, 'u1')).rejects.toThrow(ConflictException);
      expect(prisma.appointment.create).not.toHaveBeenCalled();
    });

    it('rechaza rangos inválidos', async () => {
      await expect(service.create({ ...dto, endAt: dto.startAt } as any, 'u1')).rejects.toThrow(BadRequestException);
    });

    it('valida paciente, doctor y sillón', async () => {
      prisma.patient.findUnique.mockResolvedValueOnce(null);
      await expect(service.create(dto as any, 'u1')).rejects.toThrow('Paciente no encontrado');
      prisma.user.findUnique.mockResolvedValueOnce({ isActive: false });
      await expect(service.create(dto as any, 'u1')).rejects.toThrow('Doctor no encontrado');
      prisma.chair.findUnique.mockResolvedValueOnce(null);
      await expect(service.create(dto as any, 'u1')).rejects.toThrow('Sillón no encontrado');
    });
  });

  it('findAll arma los filtros de día/semana, sillón y profesional (RF-09)', async () => {
    prisma.appointment.findMany.mockResolvedValue([]);
    await service.findAll({ from: '2026-11-02T05:00:00Z', to: '2026-11-09T04:59:59Z', chairId: 'c1', doctorId: 'd1', patientId: 'p1', status: 'CONFIRMADO' } as any);
    expect(prisma.appointment.findMany.mock.calls[0][0].where).toEqual({
      startAt: { gte: new Date('2026-11-02T05:00:00Z'), lte: new Date('2026-11-09T04:59:59Z') },
      chairId: 'c1', doctorId: 'd1', patientId: 'p1', status: 'CONFIRMADO',
    });
    await service.findAll({ to: '2026-11-09T00:00:00Z' } as any);
    expect(prisma.appointment.findMany.mock.calls[1][0].where).toEqual({ startAt: { lte: new Date('2026-11-09T00:00:00Z') } });
  });

  it('findOne → 404 si no existe', async () => {
    prisma.appointment.findUnique.mockResolvedValue(null);
    await expect(service.findOne('x')).rejects.toThrow(NotFoundException);
  });

  describe('updateStatus', () => {
    it('al pasar a ATENDIDO descuenta insumos una sola vez (RF-14)', async () => {
      prisma.appointment.findUnique.mockResolvedValue({ id: 'a1', status: 'EN_ATENCION' });
      const res: any = await service.updateStatus('a1', 'ATENDIDO' as any, 'u1');
      expect(inventory.autoDeductForAppointment).toHaveBeenCalledWith('a1', 'u1');
      expect(res.inventoryDeduction).toEqual({ deductions: [{ ok: true }] });
      expect(prisma.auditLog.create.mock.calls[0][0].data).toMatchObject({ oldValues: { status: 'EN_ATENCION' }, newValues: { status: 'ATENDIDO' } });
    });

    it('no descuenta si ya existe un descargo para la cita', async () => {
      prisma.appointment.findUnique.mockResolvedValue({ id: 'a1', status: 'EN_ATENCION' });
      prisma.stockMovement.count.mockResolvedValue(2);
      await service.updateStatus('a1', 'ATENDIDO' as any, 'u1');
      expect(inventory.autoDeductForAppointment).not.toHaveBeenCalled();
    });

    it('otros estados no descuentan', async () => {
      prisma.appointment.findUnique.mockResolvedValue({ id: 'a1', status: 'PROGRAMADO' });
      await service.updateStatus('a1', 'CONFIRMADO' as any, 'u1');
      expect(inventory.autoDeductForAppointment).not.toHaveBeenCalled();
    });

    it('RN-01: una cita atendida no puede volver a otro estado', async () => {
      prisma.appointment.findUnique.mockResolvedValue({ id: 'a1', status: 'ATENDIDO' });
      await expect(service.updateStatus('a1', 'CANCELADO' as any, 'u1')).rejects.toThrow(ForbiddenException);
      await expect(service.updateStatus('a1', 'ATENDIDO' as any, 'u1')).resolves.toBeDefined();
      expect(inventory.autoDeductForAppointment).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('revalida RN-03 al reprogramar', async () => {
      prisma.appointment.findUnique.mockResolvedValue({ id: 'a1', status: 'PROGRAMADO', chairId: 'c1', startAt: new Date(dto.startAt), endAt: new Date(dto.endAt) });
      await service.update('a1', { startAt: '2026-11-02T16:00:00.000Z', endAt: '2026-11-02T16:30:00.000Z', reason: 'x', notes: '' } as any, 'u1');
      expect(prisma.appointment.findFirst.mock.calls[0][0].where.id).toEqual({ not: 'a1' });
      expect(prisma.appointment.update.mock.calls[0][0].data).toMatchObject({ reason: 'x', notes: '' });
    });

    it('cambiar solo notas no revalida el sillón', async () => {
      prisma.appointment.findUnique.mockResolvedValue({ id: 'a1', status: 'PROGRAMADO', chairId: 'c1', startAt: new Date(), endAt: new Date() });
      await service.update('a1', { notes: 'n', patientId: 'p2', doctorId: 'd2', chairId: undefined } as any, 'u1');
      expect(prisma.appointment.findFirst).not.toHaveBeenCalled();
    });

    it('pasar a ATENDIDO por update también descuenta insumos', async () => {
      prisma.appointment.findUnique.mockResolvedValue({ id: 'a1', status: 'EN_ATENCION', chairId: 'c1', startAt: new Date(), endAt: new Date() });
      const res: any = await service.update('a1', { status: 'ATENDIDO' } as any, 'u1');
      expect(inventory.autoDeductForAppointment).toHaveBeenCalled();
      expect(res.inventoryDeduction).toBeDefined();
    });

    it('una cita atendida no se reprograma ni cambia de estado', async () => {
      prisma.appointment.findUnique.mockResolvedValue({ id: 'a1', status: 'ATENDIDO', chairId: 'c1', startAt: new Date(), endAt: new Date() });
      await expect(service.update('a1', { startAt: dto.startAt } as any, 'u1')).rejects.toThrow('no se puede reprogramar');
      await expect(service.update('a1', { status: 'PROGRAMADO' } as any, 'u1')).rejects.toThrow(ForbiddenException);
      await expect(service.update('a1', { notes: 'ok' } as any, 'u1')).resolves.toBeDefined();
    });
  });

  describe('remove (cancelación lógica)', () => {
    it('cancela sin borrar', async () => {
      prisma.appointment.findUnique.mockResolvedValue({ id: 'a1', status: 'PROGRAMADO' });
      await expect(service.remove('a1', 'u1')).resolves.toEqual({ message: 'Cita cancelada correctamente' });
      expect(prisma.appointment.update).toHaveBeenCalledWith({ where: { id: 'a1' }, data: { status: 'CANCELADO' } });
      expect(prisma.appointment.delete).not.toHaveBeenCalled();
    });
    it('RN-01: no cancela una cita atendida', async () => {
      prisma.appointment.findUnique.mockResolvedValue({ id: 'a1', status: 'ATENDIDO' });
      await expect(service.remove('a1', 'u1')).rejects.toThrow(ForbiddenException);
    });
  });
});
