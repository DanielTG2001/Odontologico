import { CheckoutRequest, CheckoutResult, ConfirmationResult, PaymentGateway } from './payment-gateway';

/** Pasarela simulada para desarrollo y pruebas UAT: no cobra dinero real. */
export class MockGateway implements PaymentGateway {
  readonly name = 'mock';
  constructor(private readonly frontendUrl: string) {}

  async createCheckout(req: CheckoutRequest): Promise<CheckoutResult> {
    return {
      checkoutUrl: `${this.frontendUrl}/pay/mock?tx=${encodeURIComponent(req.clientTxId)}&amount=${req.amountCents}`,
      providerRef: 'mock-' + req.clientTxId,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    };
  }

  async confirm(params: Record<string, string>): Promise<ConfirmationResult> {
    if (params.outcome === 'cancel') return { status: 'CANCELLED' };
    if (params.outcome === 'fail') return { status: 'FAILED', message: 'Tarjeta rechazada (simulado)' };
    return {
      status: 'PAID',
      amountCents: params.amount ? Number(params.amount) : undefined,
      providerRef: 'mock-' + (params.tx || ''),
      authorizationCode: 'MOCK' + String(Date.now()).slice(-6),
      cardBrand: 'VISA',
      cardLast4: '4242',
      cardType: params.cardType === 'Debit' ? 'Debit' : 'Credit',
    };
  }
}
