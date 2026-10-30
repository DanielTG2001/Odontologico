import { createHmac } from 'crypto';
import { PayphoneGateway } from './payphone.gateway';
import { StripeGateway } from './stripe.gateway';
import { MockGateway } from './mock.gateway';
import { GatewayError } from './payment-gateway';

const req = {
  clientTxId: 'SIGO-1', amountCents: 4550, currency: 'USD', reference: 'Factura FAC-000010',
  customer: { email: 'a@b.c', phone: '+593999999999', documentId: '1710034065' },
  returnUrl: 'https://app/pay/return?provider=x&tx=SIGO-1', cancelUrl: 'https://app/pay/return?cancelled=1',
};
const ok = (body: any) => ({ ok: true, status: 200, json: async () => body });

describe('PayphoneGateway', () => {
  it('Prepare: montos en centavos, todo sin IVA, token Bearer', async () => {
    const fetch = jest.fn().mockResolvedValue(ok({ paymentId: 99, payWithCard: 'https://pay/card', payWithPayPhone: 'https://pay/app' }));
    const gw = new PayphoneGateway({ token: 'tok', storeId: 'store-1' }, fetch);
    await expect(gw.createCheckout(req)).resolves.toMatchObject({ checkoutUrl: 'https://pay/card', providerRef: '99' });
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('https://pay.payphonetodoesposible.com/api/button/Prepare');
    expect(init.headers.Authorization).toBe('Bearer tok');
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({ amount: 4550, amountWithoutTax: 4550, clientTransactionId: 'SIGO-1', storeId: 'store-1', currency: 'USD', email: 'a@b.c', documentId: '1710034065' });
    expect(body.amount).toBe(body.amountWithoutTax);
  });

  it('Confirm: statusCode 3 aprobado, 2 cancelado', async () => {
    const fetch = jest.fn()
      .mockResolvedValueOnce(ok({ statusCode: 3, amount: 4550, transactionId: 777, authorizationCode: 'A1', cardBrand: 'Visa', lastDigits: '1234', cardType: 'Debit' }))
      .mockResolvedValueOnce(ok({ statusCode: 2 }))
      .mockResolvedValueOnce(ok({ statusCode: 1 }));
    const gw = new PayphoneGateway({ token: 't', baseUrl: 'https://sandbox' }, fetch);
    await expect(gw.confirm({ id: '777', clientTransactionId: 'SIGO-1' })).resolves.toMatchObject({ status: 'PAID', amountCents: 4550, providerRef: '777', authorizationCode: 'A1', cardLast4: '1234', cardType: 'Debit' });
    expect(fetch.mock.calls[0][0]).toBe('https://sandbox/api/button/V2/Confirm');
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ id: 777, clientTxId: 'SIGO-1' });
    await expect(gw.confirm({ id: '1', clientTxId: 'x' })).resolves.toMatchObject({ status: 'CANCELLED' });
    await expect(gw.confirm({ id: '1', clientTxId: 'x' })).resolves.toMatchObject({ status: 'FAILED' });
  });

  it('errores', async () => {
    expect(() => new PayphoneGateway({ token: '' })).toThrow(GatewayError);
    const gw = new PayphoneGateway({ token: 't' }, jest.fn().mockResolvedValue({ ok: false, status: 400, json: async () => ({ errors: [{ message: 'amount inválido' }] }) }));
    await expect(gw.createCheckout(req)).rejects.toThrow('amount inválido');
    await expect(gw.confirm({})).rejects.toThrow('Faltan');
    const noUrl = new PayphoneGateway({ token: 't' }, jest.fn().mockResolvedValue(ok({})));
    await expect(noUrl.createCheckout(req)).rejects.toThrow('enlace');
    const badJson = new PayphoneGateway({ token: 't' }, jest.fn().mockResolvedValue({ ok: false, status: 500, json: async () => { throw new Error('x'); } }));
    await expect(badJson.createCheckout(req)).rejects.toThrow('HTTP 500');
  });
});

describe('StripeGateway', () => {
  const NOW = 1_800_000_000_000;
  const secret = 'whsec_test';
  const sign = (payload: string, t = Math.floor(NOW / 1000)) => `t=${t},v1=${createHmac('sha256', secret).update(`${t}.${payload}`).digest('hex')}`;

  it('crea la sesión de Checkout con form-urlencoded', async () => {
    const fetch = jest.fn().mockResolvedValue(ok({ id: 'cs_1', url: 'https://checkout.stripe.com/c/1' }));
    const gw = new StripeGateway({ secretKey: 'sk_test' }, fetch, () => NOW);
    const res = await gw.createCheckout(req);
    expect(res).toMatchObject({ checkoutUrl: 'https://checkout.stripe.com/c/1', providerRef: 'cs_1' });
    const params = new URLSearchParams(fetch.mock.calls[0][1].body);
    expect(params.get('line_items[0][price_data][unit_amount]')).toBe('4550');
    expect(params.get('client_reference_id')).toBe('SIGO-1');
    expect(params.get('success_url')).toBe(req.returnUrl + '&session_id={CHECKOUT_SESSION_ID}');
    expect(params.get('customer_email')).toBe('a@b.c');
  });

  it('confirma consultando la sesión', async () => {
    const fetch = jest.fn().mockResolvedValueOnce(ok({ id: 'cs_1', payment_status: 'paid', amount_total: 4550, payment_intent: 'pi_1' })).mockResolvedValueOnce(ok({ id: 'cs_2', status: 'expired' })).mockResolvedValueOnce(ok({ id: 'cs_3', status: 'open' }));
    const gw = new StripeGateway({ secretKey: 'sk' }, fetch);
    await expect(gw.confirm({ session_id: 'cs_1' })).resolves.toMatchObject({ status: 'PAID', amountCents: 4550, providerRef: 'pi_1' });
    await expect(gw.confirm({ session_id: 'cs_2' })).resolves.toMatchObject({ status: 'CANCELLED' });
    await expect(gw.confirm({ session_id: 'cs_3' })).resolves.toMatchObject({ status: 'PENDING' });
    await expect(gw.confirm({})).rejects.toThrow('session_id');
  });

  it('verifica la firma del webhook (HMAC-SHA256, tolerancia 5 min)', () => {
    const gw = new StripeGateway({ secretKey: 'sk', webhookSecret: secret }, jest.fn(), () => NOW);
    const event = JSON.stringify({ type: 'checkout.session.completed', data: { object: { client_reference_id: 'SIGO-1', payment_status: 'paid', amount_total: 4550, id: 'cs_1' } } });
    const raw = Buffer.from(event);
    expect(gw.parseWebhook(raw, { 'stripe-signature': sign(event) })).toMatchObject({ clientTxId: 'SIGO-1', result: { status: 'PAID', amountCents: 4550 } });
    expect(() => gw.parseWebhook(raw, { 'stripe-signature': sign(event + 'x') })).toThrow('Firma');
    expect(() => gw.parseWebhook(raw, { 'stripe-signature': sign(event, Math.floor(NOW / 1000) - 600) })).toThrow('Firma');
    expect(() => gw.parseWebhook(raw, {})).toThrow('Firma');
    const other = JSON.stringify({ type: 'charge.refunded', data: { object: {} } });
    expect(gw.parseWebhook(Buffer.from(other), { 'stripe-signature': [sign(other)] })).toBeNull();
    const failed = JSON.stringify({ type: 'checkout.session.async_payment_failed', data: { object: { metadata: { clientTxId: 'SIGO-2' }, status: 'complete' } } });
    expect(gw.parseWebhook(Buffer.from(failed), { 'stripe-signature': sign(failed) })).toMatchObject({ clientTxId: 'SIGO-2', result: { status: 'FAILED' } });
    const noRef = JSON.stringify({ type: 'checkout.session.completed', data: { object: {} } });
    expect(gw.parseWebhook(Buffer.from(noRef), { 'stripe-signature': sign(noRef) })).toBeNull();
    expect(new StripeGateway({ secretKey: 'sk' }, jest.fn(), () => NOW).verifySignature(raw, sign(event))).toBe(false);
  });

  it('errores', async () => {
    expect(() => new StripeGateway({ secretKey: '' })).toThrow(GatewayError);
    const gw = new StripeGateway({ secretKey: 'sk' }, jest.fn().mockResolvedValue({ ok: false, status: 402, json: async () => ({ error: { message: 'card_declined' } }) }));
    await expect(gw.createCheckout({ ...req, customer: {} })).rejects.toThrow('card_declined');
  });
});

describe('MockGateway', () => {
  it('simula pago, rechazo y cancelación', async () => {
    const gw = new MockGateway('http://localhost:3000');
    expect((await gw.createCheckout(req)).checkoutUrl).toBe('http://localhost:3000/pay/mock?tx=SIGO-1&amount=4550');
    await expect(gw.confirm({ tx: 'SIGO-1', amount: '4550' })).resolves.toMatchObject({ status: 'PAID', amountCents: 4550, cardType: 'Credit' });
    await expect(gw.confirm({ cardType: 'Debit' })).resolves.toMatchObject({ cardType: 'Debit', amountCents: undefined });
    await expect(gw.confirm({ outcome: 'fail' })).resolves.toMatchObject({ status: 'FAILED' });
    await expect(gw.confirm({ outcome: 'cancel' })).resolves.toMatchObject({ status: 'CANCELLED' });
  });
});
