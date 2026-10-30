import { CheckoutRequest, CheckoutResult, ConfirmationResult, FetchLike, GatewayError, PaymentGateway } from './payment-gateway';

/**
 * Payphone (Ecuador) – Botón de pago por redirección.
 *  POST /api/button/Prepare     → payWithCard / payWithPayPhone (el enlace vence a los 10 min)
 *  POST /api/button/V2/Confirm  → statusCode 3 = aprobado, 2 = cancelado.
 * La confirmación debe hacerse en < 5 min o Payphone reversa el cobro.
 */
export class PayphoneGateway implements PaymentGateway {
  readonly name = 'payphone';

  constructor(
    private readonly cfg: { token: string; storeId?: string; baseUrl?: string },
    private readonly fetchImpl: FetchLike = (globalThis as any).fetch,
  ) {
    if (!cfg.token) throw new GatewayError('Configure PAYPHONE_TOKEN');
  }

  private url(path: string) {
    return (this.cfg.baseUrl || 'https://pay.payphonetodoesposible.com') + path;
  }

  private async call(path: string, body: unknown) {
    const res = await this.fetchImpl(this.url(path), {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.cfg.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const detail = data?.message || data?.errors?.map((e: any) => e.message).join('; ') || `HTTP ${res.status}`;
      throw new GatewayError(`Payphone: ${detail}`);
    }
    return data;
  }

  async createCheckout(req: CheckoutRequest): Promise<CheckoutResult> {
    // Servicios de salud: tarifa 0 % → todo el monto va como amountWithoutTax
    const body: Record<string, unknown> = {
      amount: req.amountCents,
      amountWithoutTax: req.amountCents,
      currency: req.currency,
      clientTransactionId: req.clientTxId,
      reference: req.reference.slice(0, 100),
      responseUrl: req.returnUrl,
      cancellationUrl: req.cancelUrl,
      lang: 'es',
      timeZone: '-5',
    };
    if (this.cfg.storeId) body.storeId = this.cfg.storeId;
    if (req.customer.email) body.email = req.customer.email;
    if (req.customer.phone) body.phoneNumber = req.customer.phone;
    if (req.customer.documentId) body.documentId = req.customer.documentId;
    const data = await this.call('/api/button/Prepare', body);
    const checkoutUrl = data.payWithCard || data.payWithPayPhone;
    if (!checkoutUrl) throw new GatewayError('Payphone no devolvió el enlace de pago');
    return { checkoutUrl, providerRef: data.paymentId ? String(data.paymentId) : undefined, raw: data };
  }

  async confirm(params: Record<string, string>): Promise<ConfirmationResult> {
    const id = Number(params.id);
    const clientTxId = params.clientTransactionId || params.clientTxId;
    if (!id || !clientTxId) throw new GatewayError('Faltan id o clientTransactionId');
    const data = await this.call('/api/button/V2/Confirm', { id, clientTxId });
    const status = data.statusCode === 3 ? 'PAID' : data.statusCode === 2 ? 'CANCELLED' : 'FAILED';
    return {
      status,
      amountCents: typeof data.amount === 'number' ? data.amount : undefined,
      providerRef: data.transactionId ? String(data.transactionId) : String(id),
      authorizationCode: data.authorizationCode,
      cardBrand: data.cardBrand,
      cardLast4: data.lastDigits,
      cardType: data.cardType === 'Debit' ? 'Debit' : data.cardType === 'Credit' ? 'Credit' : undefined,
      message: data.message,
      raw: data,
    };
  }
}
