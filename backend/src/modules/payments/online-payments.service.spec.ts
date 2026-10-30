import { BadGatewayException, BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { OnlinePaymentsService } from './online-payments.service';
import { PaymentsCron } from './payments.cron';
import { configOf, createPrismaMock, memoryRedis, PrismaMock } from '../../test-utils/mocks';
import { GatewayError } from './gateways/payment-gateway';

const INVOICE = {
  id: 'inv1', number: 'FAC-000010', status: 'EMITIDA', total: 100,
  payments: [{ amount: 40 }],
  patient: { firstName: 'Ana', lastName: 'Paz', email: 'ana@x.com', phone: '+593999', documentNumber: '1710034065' },
};

function build(cfg: Record<string, string> = { PAYMENTS_PROVIDER: 'payphone', PAYMENTS_ENABLED: 'payphone,stripe,mock', FRONTEND_URL: 'https://app/' }) {
  const prisma = createPrismaMock();
  const billing = { addPayment: jest.fn().mockResolvedValue({ payments: [{ id: 'p-old', paidAt: '2026-01-01' }, { id: 'p-new', paidAt: '2026-10-30' }] }) };
  const notifications = { send: jest.fn().mockResolvedValue({ success: true }) };
  const gw = { name: 'payphone', createCheckout: jest.fn().mockResolvedValue({ checkoutUrl: 'https://pay/x', providerRef: '99' }), confirm: jest.fn(), parseWebhook: jest.fn() };
  class TestPayments extends OnlinePaymentsService {
    protected createGateway(name: string) {
      if (name === 'broken') throw new GatewayError('Configure X');
      return name === 'mock' ? super.createGateway(name) : (gw as any);
    }
  }
  const svc = new TestPayments(prisma as any, billing as any, notifications as any, configOf(cfg));
  // estado de online_payments en memoria
  const rows = new Map<string, any>();
  prisma.onlinePayment.create.mockImplementation(async ({ data }: any) => { const r = { id: 'op' + (rows.size + 1), status: 'PENDING', ...data }; rows.set(r.id, r); return r; });
  prisma.onlinePayment.update.mockImplementation(async ({ where, data }: any) => Object.assign(rows.get(where.id), data));
  prisma.onlinePayment.updateMany.mockImplementation(async ({ where, data }: any) => {
    const r = rows.get(where.id);
    if (!r || (where.status && r.status !== where.status)) return { count: 0 };
    Object.assign(r, data);
    return { count: 1 };
  });
  prisma.onlinePayment.findUnique.mockImplementation(async ({ where, include }: any) => {
    const r = where.id ? rows.get(where.id) : [...rows.values()].find((x) => x.clientTxId === where.clientTxId);
    return r ? { ...r, ...(include ? { invoice: { number: INVOICE.number } } : {}) } : null;
  });
  prisma.invoice.findUnique.mockResolvedValue(INVOICE);
  return { prisma, billing, notifications, gw, svc, rows };
}

describe('OnlinePaymentsService', () => {
  const env = { ...process.env };
  afterEach(() => { process.env = { ...env }; });

  it('crea el cobro por el saldo pendiente y envía el enlace por WhatsApp', async () => {
    const { svc, gw, notifications } = build();
    const res: any = await svc.create({ invoiceId: 'inv1', sendVia: 'whatsapp' }, 'cajero');
    expect(res).toMatchObject({ amount: 60, provider: 'payphone', checkoutUrl: 'https://pay/x', providerRef: '99', sentVia: 'whatsapp' });
    const req = gw.createCheckout.mock.calls[0][0];
    expect(req).toMatchObject({ amountCents: 6000, reference: 'Factura FAC-000010' });
    expect(req.returnUrl).toMatch(/^https:\/\/app\/pay\/return\?provider=payphone&tx=SIGO-/);
    expect(notifications.send.mock.calls[0][0].customMessage).toContain('https://pay/x');
  });

  it('envío por email y monto parcial', async () => {
    const { svc, notifications } = build();
    await svc.create({ invoiceId: 'inv1', amount: 10, sendVia: 'email' }, 'c');
    expect(notifications.send.mock.calls[0][0]).toMatchObject({ channel: 'EMAIL', to: 'ana@x.com' });
  });

  it('validaciones de creación', async () => {
    const { svc, prisma } = build();
    await expect(svc.create({ invoiceId: 'inv1', amount: 61 }, 'c')).rejects.toThrow('saldo pendiente');
    prisma.invoice.findUnique.mockResolvedValueOnce({ ...INVOICE, status: 'PAGADA' });
    await expect(svc.create({ invoiceId: 'inv1' }, 'c')).rejects.toThrow('PAGADA');
    prisma.invoice.findUnique.mockResolvedValueOnce({ ...INVOICE, payments: [{ amount: 100 }] });
    await expect(svc.create({ invoiceId: 'inv1' }, 'c')).rejects.toThrow('saldo');
    prisma.invoice.findUnique.mockResolvedValueOnce(null);
    await expect(svc.create({ invoiceId: 'x' }, 'c')).rejects.toThrow(NotFoundException);
    await expect(svc.create({ invoiceId: 'inv1', provider: 'otra' as any }, 'c')).rejects.toThrow('no está habilitada');
  });

  it('si la pasarela falla, marca FAILED y responde 502', async () => {
    const { svc, gw, rows } = build();
    gw.createCheckout.mockRejectedValue(new Error('timeout'));
    await expect(svc.create({ invoiceId: 'inv1' }, 'c')).rejects.toThrow(BadGatewayException);
    expect([...rows.values()][0].status).toBe('FAILED');
  });

  it('una pasarela mal configurada da 400', () => {
    const { svc } = build({ PAYMENTS_ENABLED: 'broken' });
    expect(() => svc.gateway('broken')).toThrow(BadRequestException);
  });

  describe('confirmación', () => {
    async function pending() {
      const ctx = build();
      const p: any = await ctx.svc.create({ invoiceId: 'inv1' }, 'cajero');
      return { ...ctx, tx: p.clientTxId };
    }

    it('PAID registra el pago con tarjeta de débito una sola vez', async () => {
      const { svc, gw, billing, tx, rows } = await pending();
      gw.confirm.mockResolvedValue({ status: 'PAID', amountCents: 6000, authorizationCode: 'A1', cardType: 'Debit', cardBrand: 'Visa', cardLast4: '1234' });
      const res = await svc.confirm('payphone', { id: '777', clientTransactionId: tx });
      expect(res).toMatchObject({ status: 'PAID', amount: 60, invoiceNumber: 'FAC-000010', authorizationCode: 'A1', checkoutUrl: null });
      expect(billing.addPayment).toHaveBeenCalledWith('inv1', { method: 'TARJETA_DEBITO', amount: 60, reference: 'payphone:A1', notes: 'Pago en línea Visa ****1234' }, 'cajero');
      expect([...rows.values()][0].paymentId).toBe('p-new');
      // Segunda llamada (recarga de la página o webhook): no duplica
      await svc.confirm('payphone', { id: '777', clientTransactionId: tx });
      await svc.settle([...rows.values()][0].id, { status: 'PAID', amountCents: 6000 });
      expect(billing.addPayment).toHaveBeenCalledTimes(1);
    });

    it('rechaza montos alterados', async () => {
      const { svc, gw, billing, tx } = await pending();
      gw.confirm.mockResolvedValue({ status: 'PAID', amountCents: 100 });
      await expect(svc.confirm('payphone', { id: '1', clientTransactionId: tx })).resolves.toMatchObject({ status: 'FAILED' });
      expect(billing.addPayment).not.toHaveBeenCalled();
    });

    it('cancelado, fallido y pendiente', async () => {
      const a = await pending();
      a.gw.confirm.mockResolvedValue({ status: 'CANCELLED' });
      await expect(a.svc.confirm('payphone', { id: '1', clientTransactionId: a.tx })).resolves.toMatchObject({ status: 'CANCELLED' });
      const b = await pending();
      b.gw.confirm.mockResolvedValue({ status: 'PENDING' });
      await expect(b.svc.confirm('payphone', { id: '1', clientTransactionId: b.tx })).resolves.toMatchObject({ status: 'PENDING', checkoutUrl: 'https://pay/x' });
      const c = await pending();
      await expect(c.svc.confirm('payphone', { clientTransactionId: c.tx, cancelled: '1' })).resolves.toMatchObject({ status: 'CANCELLED' });
      expect(c.gw.confirm).not.toHaveBeenCalled();
      const d = await pending();
      d.gw.confirm.mockResolvedValue({ status: 'FAILED', message: 'rechazada' });
      await expect(d.svc.confirm('payphone', { id: '1', clientTransactionId: d.tx })).resolves.toMatchObject({ status: 'FAILED' });
    });

    it('cobrado pero no aplicable (factura ya pagada) queda auditado para reembolso', async () => {
      const { svc, gw, billing, prisma, tx } = await pending();
      billing.addPayment.mockRejectedValue(new BadRequestException('No se pueden registrar pagos en facturas PAGADA'));
      gw.confirm.mockResolvedValue({ status: 'PAID', amountCents: 6000 });
      await expect(svc.confirm('payphone', { id: '1', clientTransactionId: tx })).resolves.toMatchObject({ status: 'PAID' });
      expect(prisma.auditLog.create.mock.calls.some((c: any) => c[0].data.action === 'ONLINE_PAYMENT_UNAPPLIED')).toBe(true);
    });

    it('validaciones', async () => {
      const { svc, gw, tx } = await pending();
      await expect(svc.confirm('payphone', {})).rejects.toThrow('identificador');
      await expect(svc.confirm('payphone', { clientTransactionId: 'nope' })).rejects.toThrow(NotFoundException);
      await expect(svc.confirm('stripe', { tx })).rejects.toThrow('otra pasarela');
      gw.confirm.mockRejectedValue(new Error('Payphone caído'));
      await expect(svc.confirm('payphone', { id: '1', clientTransactionId: tx })).rejects.toThrow(BadGatewayException);
      await expect(svc.settle('nope', { status: 'PAID' })).rejects.toThrow(NotFoundException);
    });

    it('pasarela simulada de punta a punta, y bloqueada en producción', async () => {
      const { svc, billing } = build({ PAYMENTS_PROVIDER: 'mock', FRONTEND_URL: 'http://localhost:3000' });
      const p: any = await svc.create({ invoiceId: 'inv1' }, 'c');
      expect(p.checkoutUrl).toContain('/pay/mock?tx=');
      await expect(svc.confirm('mock', { tx: p.clientTxId, outcome: 'ok' })).resolves.toMatchObject({ status: 'PAID', cardLast4: '4242' });
      expect(billing.addPayment.mock.calls[0][1].method).toBe('TARJETA_CREDITO');
      process.env.NODE_ENV = 'production';
      expect(svc.enabledProviders()).toEqual([]);
      await expect(svc.confirm('mock', { tx: p.clientTxId })).rejects.toThrow(ForbiddenException);
    });
  });

  it('webhook aplica el resultado; ignora eventos ajenos', async () => {
    const { svc, gw, billing } = build();
    const p: any = await svc.create({ invoiceId: 'inv1', provider: 'stripe' }, 'c');
    gw.parseWebhook.mockReturnValueOnce({ clientTxId: p.clientTxId, result: { status: 'PAID', amountCents: 6000 } });
    await expect(svc.handleWebhook('stripe', Buffer.from('{}'), {})).resolves.toEqual({ received: true });
    expect(billing.addPayment).toHaveBeenCalledTimes(1);
    gw.parseWebhook.mockReturnValueOnce(null);
    await expect(svc.handleWebhook('stripe', Buffer.from('{}'), {})).resolves.toMatchObject({ ignored: true });
    gw.parseWebhook.mockReturnValueOnce({ clientTxId: 'otro', result: { status: 'PAID' } });
    await expect(svc.handleWebhook('stripe', Buffer.from('{}'), {})).resolves.toMatchObject({ ignored: true });
    gw.parseWebhook.mockImplementationOnce(() => { throw new Error('Firma de webhook inválida'); });
    await expect(svc.handleWebhook('stripe', Buffer.from('{}'), {})).rejects.toThrow('Firma');
    await expect(svc.handleWebhook('stripe', undefined, {})).rejects.toThrow('vacío');
    await expect(svc.handleWebhook('mock', Buffer.from('{}'), {})).rejects.toThrow('no usa webhooks');
  });

  it('consultas, vencimiento y cron', async () => {
    const { svc, prisma } = build();
    const p: any = await svc.create({ invoiceId: 'inv1' }, 'c');
    await expect(svc.publicStatus(p.clientTxId)).resolves.toMatchObject({ status: 'PENDING', checkoutUrl: 'https://pay/x' });
    await expect(svc.publicStatus('nope')).rejects.toThrow(NotFoundException);
    await expect(svc.publicView('nope')).rejects.toThrow(NotFoundException);
    prisma.onlinePayment.findMany.mockResolvedValue([]);
    await expect(svc.listForInvoice('inv1')).resolves.toEqual([]);
    prisma.onlinePayment.updateMany.mockResolvedValue({ count: 3 });
    await expect(svc.expireStale(new Date('2026-10-30T12:00:00Z'))).resolves.toEqual({ expired: 3 });
    const where = prisma.onlinePayment.updateMany.mock.calls.at(-1)[0].where;
    expect(where.status).toBe('PENDING');
    expect(where.OR[1].createdAt.lt).toEqual(new Date('2026-10-30T11:00:00Z'));
    const redis = memoryRedis();
    const spy = jest.spyOn(svc, 'expireStale').mockResolvedValue({ expired: 0 });
    const cron = new PaymentsCron(svc, redis);
    await cron.expire();
    await cron.expire();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(svc.defaultProvider).toBe('payphone');
  });
});
