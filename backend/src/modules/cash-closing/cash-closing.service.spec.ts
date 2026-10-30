import { ConflictException } from '@nestjs/common';
import { CashClosingService } from './cash-closing.service';
import { createPrismaMock, PrismaMock } from '../../test-utils/mocks';

const PAYMENTS = [
  { method: 'EFECTIVO', amount: 50 },
  { method: 'EFECTIVO', amount: '25.50' },
  { method: 'TARJETA_CREDITO', amount: 40 },
  { method: 'TARJETA_DEBITO', amount: 10 },
  { method: 'TRANSFERENCIA', amount: 30 },
  { method: 'SEGURO', amount: 100 },
];

describe('CashClosingService (RN-02 cierre ciego)', () => {
  let prisma: PrismaMock;
  let service: CashClosingService;

  beforeEach(() => {
    prisma = createPrismaMock();
    service = new CashClosingService(prisma as any);
    prisma.payment.findMany.mockResolvedValue(PAYMENTS);
    prisma.cashClosing.create.mockImplementation(async ({ data }: any) => ({ id: 'cc1', ...data }));
  });

  it('calcula los totales del sistema solo al guardar el conteo y registra la diferencia', async () => {
    prisma.cashClosing.findUnique.mockResolvedValue(null);
    const res: any = await service.createClosing({ closingDate: '2026-10-30', countedCash: 70, countedCard: 50, countedTransfer: 30 } as any, 'cajero');
    expect(res).toMatchObject({ systemCash: 75.5, systemCard: 50, systemTransfer: 30, systemOther: 100, systemTotal: 255.5, status: 'CLOSED' });
    expect(res.difference).toBeCloseTo(150 - 255.5);
    expect(prisma.payment.findMany.mock.calls[0][0].where.invoice).toEqual({ status: { not: 'ANULADA' } });
    expect(prisma.auditLog.create.mock.calls[0][0].data.action).toBe('CASH_CLOSING');
  });

  it('un cierre por día', async () => {
    prisma.cashClosing.findUnique.mockResolvedValue({ id: 'x' });
    await expect(service.createClosing({ closingDate: '2026-10-30', countedCash: 1 } as any, 'c')).rejects.toThrow(ConflictException);
  });

  it('vista previa de totales (solo auditoría) y consultas', async () => {
    await expect(service.getSystemTotalsPreview('2026-10-30')).resolves.toMatchObject({ total: 255.5 });
    prisma.cashClosing.findUnique.mockResolvedValue({ id: 'cc1' });
    await expect(service.findByDate('2026-10-30')).resolves.toEqual({ id: 'cc1' });
    prisma.cashClosing.findMany.mockResolvedValue([]);
    await expect(service.findAll()).resolves.toEqual([]);
  });
});
