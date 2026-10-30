/** Contrato común para pasarelas de pago (Payphone, Stripe, mock). Montos en centavos. */
export interface CheckoutRequest {
  clientTxId: string;
  amountCents: number;
  currency: string;
  reference: string;
  customer: { name?: string; email?: string; phone?: string; documentId?: string };
  returnUrl: string;
  cancelUrl: string;
}

export interface CheckoutResult {
  checkoutUrl: string;
  providerRef?: string;
  expiresAt?: Date;
  raw?: unknown;
}

export type ConfirmationStatus = 'PAID' | 'FAILED' | 'CANCELLED' | 'PENDING';

export interface ConfirmationResult {
  status: ConfirmationStatus;
  amountCents?: number;
  providerRef?: string;
  authorizationCode?: string;
  cardBrand?: string;
  cardLast4?: string;
  cardType?: 'Credit' | 'Debit';
  message?: string;
  raw?: unknown;
}

export interface WebhookEvent {
  clientTxId: string;
  result: ConfirmationResult;
}

export interface PaymentGateway {
  readonly name: string;
  createCheckout(req: CheckoutRequest): Promise<CheckoutResult>;
  /** Confirma con los parámetros que la pasarela devuelve al redirigir */
  confirm(params: Record<string, string>): Promise<ConfirmationResult>;
  /** Verifica la firma y traduce un webhook; null si el evento no interesa */
  parseWebhook?(rawBody: Buffer, headers: Record<string, string | string[] | undefined>): WebhookEvent | null;
}

export class GatewayError extends Error {}

export type FetchLike = (url: string, init: any) => Promise<{ ok: boolean; status: number; json(): Promise<any>; text?(): Promise<string> }>;
