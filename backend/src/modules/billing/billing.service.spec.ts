import { BadRequestException, NotFoundException } from '@nestjs/common';
import { BillingService } from './billing.service';
import { createPrismaMock, PrismaMock } from '../../test-utils/mocks';

describe('BillingService (RF-12)', () => {
  let prisma: PrismaMock;
  let service: BillingService;
  const invoice = (over: any = {}) => ({ id: 'i1', status: 'EMITIDA', total: 100, payments: [], ...over });

  beforeEach(() => {
    prisma = createPrismaMock();
    service = new BillingService(prisma as any);
    prisma.invoice.create.mockImplementation(async ({ data }: any) => ({ id: 'i1', ...data }));
    prisma.invoice.update.mockImplementation(async ({ data }: any) => ({ id: 'i1', ...data }));
    prisma.payment.create.mockImplementation(async ({ data }: any) => ({ id: 'pay', ...data }));
  });

  describe('createInvoice', () => {
    it('calcula subtotal, descuento, impuesto y numeración', async () => {
      prisma.patient.findUnique.mockResolvedValue({ id: 'p1', isActive: true });
      prisma.invoice.count.mockResolvedValue(41);
      const res: any = await service.createInvoice({ patientId: 'p1', discount: 10, tax: 5, items: [{ description: 'Resina', quantity: 2, unitPrice: 40 }, { description: 'Profilaxis', quantity: 1, unitPrice: 30 }] } as any, 'u1');
      expect(res).toMatchObject({ number: 'FAC-000042', subtotal: 110, discount: 10, tax: 5, total: 105, status: 'BORRADOR' });
      expect(res.items.create[0].total).toBe(80);
    });
    it('validaciones', async () => {
      prisma.patient.findUnique.mockResolvedValue(null);
      await expect(service.createInvoice({ patientId: 'x', items: [{}] } as any, 'u')).rejects.toThrow(NotFoundException);
      prisma.patient.findUnique.mockResolvedValue({ isActive: true });
      await expect(service.createInvoice({ patientId: 'p', items: [] } as any, 'u')).rejects.toThrow('al menos un ítem');
      await expect(service.createInvoice({ patientId: 'p', discount: 999, items: [{ quantity: 1, unitPrice: 1 }] } as any, 'u')).rejects.toThrow('negativo');
    });
  });

  it('issueInvoice: solo borradores', async () => {
    prisma.invoice.findUnique.mockResolvedValue(invoice({ status: 'BORRADOR' }));
    await expect(service.issueInvoice('i1', 'u')).resolves.toMatchObject({ status: 'EMITIDA' });
    prisma.invoice.findUnique.mockResolvedValue(invoice());
    await expect(service.issueInvoice('i1', 'u')).rejects.toThrow(BadRequestException);
  });

  describe('pagos mixtos', () => {
    it('pago parcial → PARCIAL; completa → PAGADA', async () => {
      prisma.invoice.findUnique.mockResolvedValue(invoice());
      await service.addPayment('i1', { method: 'EFECTIVO', amount: 40 } as any, 'u');
      expect(prisma.invoice.update.mock.calls[0][0].data.status).toBe('PARCIAL');
      prisma.invoice.findUnique.mockResolvedValue(invoice({ status: 'PARCIAL', payments: [{ amount: '40' }] }));
      await service.addPayment('i1', { method: 'TARJETA_CREDITO', amount: 60 } as any, 'u');
      expect(prisma.invoice.update.mock.calls[1][0].data.status).toBe('PAGADA');
    });
    it('no permite pagar de más ni en estados inválidos', async () => {
      prisma.invoice.findUnique.mockResolvedValue(invoice());
      await expect(service.addPayment('i1', { amount: 100.5 } as any, 'u')).rejects.toThrow('saldo pendiente');
      prisma.invoice.findUnique.mockResolvedValue(invoice({ status: 'BORRADOR' }));
      await expect(service.addPayment('i1', { amount: 1 } as any, 'u')).rejects.toThrow('emitir');
      prisma.invoice.findUnique.mockResolvedValue(invoice({ status: 'ANULADA' }));
      await expect(service.addPayment('i1', { amount: 1 } as any, 'u')).rejects.toThrow('ANULADA');
    });
    it('addMixedPayments aplica cada método', async () => {
      prisma.invoice.findUnique.mockResolvedValue(invoice());
      await service.addMixedPayments('i1', [{ method: 'EFECTIVO', amount: 20 }, { method: 'SEGURO', amount: 30 }] as any, 'u');
      expect(prisma.payment.create).toHaveBeenCalledTimes(2);
      await expect(service.addMixedPayments('i1', [], 'u')).rejects.toThrow(BadRequestException);
    });
  });

  it('cancelInvoice: no anula facturas pagadas', async () => {
    prisma.invoice.findUnique.mockResolvedValue(invoice({ status: 'PAGADA' }));
    await expect(service.cancelInvoice('i1', 'u')).rejects.toThrow('nota de crédito');
    prisma.invoice.findUnique.mockResolvedValue(invoice());
    await expect(service.cancelInvoice('i1', 'u')).resolves.toMatchObject({ status: 'ANULADA' });
  });

  it('findAll filtra; findOne 404', async () => {
    prisma.invoice.findMany.mockResolvedValue([]);
    await service.findAll({ patientId: 'p', status: 'PAGADA', from: '2026-10-01', to: '2026-10-31' } as any);
    expect(prisma.invoice.findMany.mock.calls[0][0].where).toMatchObject({ patientId: 'p', status: 'PAGADA', createdAt: { gte: new Date('2026-10-01'), lte: new Date('2026-10-31') } });
    await service.findAll({ to: '2026-10-31' } as any);
    prisma.invoice.findUnique.mockResolvedValue(null);
    await expect(service.findOne('x')).rejects.toThrow(NotFoundException);
  });

  it('resumen diario por método de pago', async () => {
    prisma.payment.findMany.mockResolvedValue([{ method: 'EFECTIVO', amount: 10 }, { method: 'EFECTIVO', amount: 5 }, { method: 'TRANSFERENCIA', amount: 20 }]);
    await expect(service.getDailyCashSummary('2026-10-30')).resolves.toMatchObject({ total: 35, byMethod: { EFECTIVO: 15, TRANSFERENCIA: 20 }, paymentsCount: 3 });
  });
});
