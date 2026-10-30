import { BadRequestException, NotFoundException } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { createPrismaMock, PrismaMock } from '../../test-utils/mocks';

describe('InventoryService – movimientos y descargo automático (RF-14)', () => {
  let prisma: PrismaMock;
  let service: InventoryService;

  beforeEach(() => {
    prisma = createPrismaMock();
    service = new InventoryService(prisma as any);
    prisma.inventoryItem.findUnique.mockResolvedValue({ id: 'it1', name: 'Anestesia', isActive: true, stockCurrent: 10 });
    prisma.inventoryLocation.findUnique.mockResolvedValue({ id: 'loc1', name: 'Sillón 1', isActive: true });
    prisma.inventoryStock.findUnique.mockResolvedValue({ id: 's1', quantity: 5 });
    prisma.inventoryStock.findMany.mockResolvedValue([{ quantity: 3 }, { quantity: 4 }]);
    prisma.stockMovement.create.mockImplementation(async ({ data }: any) => ({ id: 'mv1', ...data }));
    prisma.inventoryStock.updateMany.mockResolvedValue({ count: 1 });
    prisma.inventoryItem.updateMany.mockResolvedValue({ count: 1 });
  });

  it('salida atómica: solo descuenta si hay stock suficiente (WHERE quantity >= n) y recalcula el total', async () => {
    await service.addMovement({ itemId: 'it1', locationId: 'loc1', type: 'OUT', quantity: 2 } as any, 'u');
    expect(prisma.inventoryStock.updateMany).toHaveBeenCalledWith({ where: { id: 's1', quantity: { gte: 2 } }, data: { quantity: { decrement: 2 } } });
    expect(prisma.inventoryItem.update).toHaveBeenCalledWith({ where: { id: 'it1' }, data: { stockCurrent: 7 } });
  });

  it('dos descargos simultáneos: el segundo falla si ya no alcanza', async () => {
    prisma.inventoryStock.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    prisma.inventoryStock.findUnique.mockResolvedValueOnce({ id: 's1', quantity: 5 }).mockResolvedValueOnce({ id: 's1', quantity: 5 }).mockResolvedValueOnce({ id: 's1', quantity: 1 });
    const results = await Promise.allSettled([
      service.addMovement({ itemId: 'it1', locationId: 'loc1', type: 'AUTO_DEDUCT', quantity: 4 } as any, 'u'),
      service.addMovement({ itemId: 'it1', locationId: 'loc1', type: 'AUTO_DEDUCT', quantity: 4 } as any, 'u'),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual(['fulfilled', 'rejected']);
    const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason.message).toContain('disponible: 1');
  });

  it('entrada crea el stock de la ubicación si no existía', async () => {
    prisma.inventoryStock.findUnique.mockResolvedValue(null);
    prisma.inventoryStock.create.mockResolvedValue({ id: 's2', quantity: 0 });
    await service.addMovement({ itemId: 'it1', locationId: 'loc1', type: 'IN', quantity: 10 } as any, 'u');
    expect(prisma.inventoryStock.updateMany).toHaveBeenCalledWith({ where: { id: 's2' }, data: { quantity: { increment: 10 } } });
  });

  it('no permite stock negativo ni tipos inválidos', async () => {
    prisma.inventoryStock.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(service.addMovement({ itemId: 'it1', locationId: 'loc1', type: 'AUTO_DEDUCT', quantity: 9 } as any, 'u')).rejects.toThrow('Stock insuficiente');
    await expect(service.addMovement({ itemId: 'it1', locationId: 'loc1', type: 'XX', quantity: 1 } as any, 'u')).rejects.toThrow(BadRequestException);
    prisma.inventoryLocation.findUnique.mockResolvedValue(null);
    await expect(service.addMovement({ itemId: 'it1', locationId: 'zz', type: 'IN', quantity: 1 } as any, 'u')).rejects.toThrow('Ubicación');
    prisma.inventoryItem.findUnique.mockResolvedValue(null);
    await expect(service.addMovement({ itemId: 'x', type: 'IN', quantity: 1 } as any, 'u')).rejects.toThrow(NotFoundException);
  });

  it('movimiento global (sin ubicación)', async () => {
    await service.addMovement({ itemId: 'it1', type: 'IN', quantity: 5 } as any, 'u');
    expect(prisma.inventoryItem.updateMany).toHaveBeenCalledWith({ where: { id: 'it1' }, data: { stockCurrent: { increment: 5 } } });
    prisma.inventoryItem.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(service.addMovement({ itemId: 'it1', type: 'OUT', quantity: 50 } as any, 'u')).rejects.toThrow('Stock insuficiente');
    await expect(service.addMovement({ itemId: 'it1', type: '??', quantity: 1 } as any, 'u')).rejects.toThrow('inválido');
  });

  it('TRANSFER exige origen y destino', async () => {
    await expect(service.addMovement({ itemId: 'it1', type: 'TRANSFER', quantity: 1, locationId: 'a' } as any, 'u')).rejects.toThrow('TRANSFER requiere');
  });

  describe('autoDeductForAppointment', () => {
    const appointment = {
      id: 'a1',
      chair: { inventoryLocation: { id: 'loc1' } },
      items: [
        { quantity: 2, procedure: { name: 'Resina', recipes: [{ itemId: 'it1', quantity: 1 }, { itemId: 'it2', quantity: 3 }] } },
      ],
    };

    it('descuenta la receta × cantidad desde la ubicación del sillón y referencia la cita', async () => {
      prisma.appointment.findUnique.mockResolvedValue(appointment);
      const spy = jest.spyOn(service, 'addMovement').mockResolvedValue({ id: 'mv' });
      const res: any = await service.autoDeductForAppointment('a1', 'doc');
      expect(spy.mock.calls.map((c: any) => [c[0].itemId, c[0].quantity, c[0].locationId, c[0].type])).toEqual([
        ['it1', 2, 'loc1', 'AUTO_DEDUCT'],
        ['it2', 6, 'loc1', 'AUTO_DEDUCT'],
      ]);
      expect(prisma.stockMovement.update).toHaveBeenCalledWith({ where: { id: 'mv' }, data: { referenceType: 'Appointment', referenceId: 'a1' } });
      expect(res.deductions.every((d: any) => d.ok)).toBe(true);
    });

    it('si falta stock de un insumo lo informa sin cortar los demás', async () => {
      prisma.appointment.findUnique.mockResolvedValue({ ...appointment, chair: null });
      jest.spyOn(service, 'addMovement').mockRejectedValueOnce(new BadRequestException('Stock insuficiente')).mockResolvedValueOnce({ id: 'mv2' });
      const res: any = await service.autoDeductForAppointment('a1', 'doc');
      expect(res.locationId).toBeNull();
      expect(res.deductions.map((d: any) => d.ok)).toEqual([false, true]);
      expect(res.deductions[0].error).toContain('Stock insuficiente');
    });

    it('404 si la cita no existe', async () => {
      prisma.appointment.findUnique.mockResolvedValue(null);
      await expect(service.autoDeductForAppointment('x', 'doc')).rejects.toThrow(NotFoundException);
    });
  });
});
