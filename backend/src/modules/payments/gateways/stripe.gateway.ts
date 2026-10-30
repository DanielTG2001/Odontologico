import { createHmac, timingSafeEqual } from 'crypto';
import { CheckoutRequest, CheckoutResult, ConfirmationResult, FetchLike, GatewayError, PaymentGateway, WebhookEvent } from './payment-gateway';

/**
 * Stripe Checkout (API REST, sin SDK).
 *  POST /v1/checkout/sessions  → url de pago
 *  Webhook checkout.session.completed / expired con firma Stripe-Signature (HMAC-SHA256).
 */
export class StripeGateway implements PaymentGateway {
  readonly name = 'stripe';

  constructor(
    private readonly cfg: { secretKey: string; webhookSecret?: string },
    private readonly fetchImpl: FetchLike = (globalThis as any).fetch,
    private readonly now: () => number = () => Date.now(),
  ) {
    if (!cfg.secretKey) throw new GatewayError('Configure STRIPE_SECRET_KEY');
  }

  private async call(method: 'GET' | 'POST', path: string, form?: Record<string, string>) {
    const res = await this.fetchImpl('https://api.stripe.com' + path, {
      method,
      headers: { Authorization: `Bearer ${this.cfg.secretKey}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form ? new URLSearchParams(form).toString() : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new GatewayError(`Stripe: ${data?.error?.message || 'HTTP ' + res.status}`);
    return data;
  }

  private toResult(session: any): ConfirmationResult {
    const paid = session.payment_status === 'paid';
    return {
      status: paid ? 'PAID' : session.status === 'expired' ? 'CANCELLED' : 'PENDING',
      amountCents: session.amount_total,
      providerRef: session.payment_intent || session.id,
      raw: { id: session.id, status: session.status, payment_status: session.payment_status },
    };
  }

  async createCheckout(req: CheckoutRequest): Promise<CheckoutResult> {
    const expiresAt = Math.floor(this.now() / 1000) + 60 * 60; // 1 h
    const form: Record<string, string> = {
      mode: 'payment',
      client_reference_id: req.clientTxId,
      success_url: req.returnUrl + (req.returnUrl.includes('?') ? '&' : '?') + 'session_id={CHECKOUT_SESSION_ID}',
      cancel_url: req.cancelUrl,
      expires_at: String(expiresAt),
      'line_items[0][quantity]': '1',
      'line_items[0][price_data][currency]': req.currency.toLowerCase(),
      'line_items[0][price_data][unit_amount]': String(req.amountCents),
      'line_items[0][price_data][product_data][name]': req.reference.slice(0, 120),
      'metadata[clientTxId]': req.clientTxId,
      'payment_intent_data[metadata][clientTxId]': req.clientTxId,
    };
    if (req.customer.email) form.customer_email = req.customer.email;
    const s = await this.call('POST', '/v1/checkout/sessions', form);
    return { checkoutUrl: s.url, providerRef: s.id, expiresAt: new Date(expiresAt * 1000), raw: { id: s.id } };
  }

  async confirm(params: Record<string, string>): Promise<ConfirmationResult> {
    if (!params.session_id) throw new GatewayError('Falta session_id');
    return this.toResult(await this.call('GET', `/v1/checkout/sessions/${encodeURIComponent(params.session_id)}`));
  }

  /** Verificación oficial: v1 = HMAC_SHA256(secret, `${t}.${payload}`), tolerancia 5 min. */
  verifySignature(rawBody: Buffer, header: string | undefined): boolean {
    if (!this.cfg.webhookSecret || !header) return false;
    const parts = Object.fromEntries(header.split(',').map((kv) => kv.split('=') as [string, string]));
    const t = Number(parts.t);
    if (!t || Math.abs(this.now() / 1000 - t) > 300) return false;
    const expected = createHmac('sha256', this.cfg.webhookSecret).update(`${t}.${rawBody.toString('utf8')}`).digest('hex');
    const signatures = header.split(',').filter((kv) => kv.startsWith('v1=')).map((kv) => kv.slice(3));
    return signatures.some((sig) => sig.length === expected.length && timingSafeEqual(Buffer.from(sig), Buffer.from(expected)));
  }

  parseWebhook(rawBody: Buffer, headers: Record<string, string | string[] | undefined>): WebhookEvent | null {
    const sig = headers['stripe-signature'];
    if (!this.verifySignature(rawBody, Array.isArray(sig) ? sig[0] : sig)) throw new GatewayError('Firma de webhook inválida');
    const event = JSON.parse(rawBody.toString('utf8'));
    if (!['checkout.session.completed', 'checkout.session.async_payment_succeeded', 'checkout.session.expired', 'checkout.session.async_payment_failed'].includes(event.type)) return null;
    const session = event.data?.object;
    const clientTxId = session?.client_reference_id || session?.metadata?.clientTxId;
    if (!clientTxId) return null;
    const result = this.toResult(session);
    if (event.type === 'checkout.session.async_payment_failed') result.status = 'FAILED';
    return { clientTxId, result };
  }
}
