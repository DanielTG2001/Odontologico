import { BadGatewayException, BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { InvoiceStatus, OnlinePaymentStatus, PaymentMethod } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BillingService } from '../billing/billing.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationChannel, NotificationType } from '../notifications/dto/send-notification.dto';
import { CreateOnlinePaymentDto } from './dto/online-payment.dto';
import { ConfirmationResult, GatewayError, PaymentGateway } from './gateways/payment-gateway';
import { PayphoneGateway } from './gateways/payphone.gateway';
import { StripeGateway } from './gateways/stripe.gateway';
import { MockGateway } from './gateways/mock.gateway';

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Pasarela de pagos (SRS 7.1): cobro en línea de facturas emitidas.
 * Al confirmarse el pago se registra automáticamente en la factura (RF-12),
 * de forma idempotente (un webhook duplicado no cobra dos veces).
 */
@Injectable()
export class OnlinePaymentsService {
  private readonly logger = new Logger('Payments');
  private gateways = new Map<string, PaymentGateway>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingService,
    private readonly notifications: NotificationsService,
    private readonly config: ConfigService,
  ) {}

  get defaultProvider(): string {
    return (this.config.get<string>('PAYMENTS_PROVIDER') || 'mock').toLowerCase();
  }

  private get frontendUrl() {
    return (this.config.get<string>('FRONTEND_URL') || 'http://localhost:3000').replace(/\/$/, '');
  }

  enabledProviders(): string[] {
    const list = (this.config.get<string>('PAYMENTS_ENABLED') || this.defaultProvider).split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
    return list.filter((p) => p !== 'mock' || process.env.NODE_ENV !== 'production');
  }

  /** Separado para poder sustituir las pasarelas en pruebas */
  protected createGateway(name: string): PaymentGateway {
    switch (name) {
      case 'payphone':
        return new PayphoneGateway({
          token: this.config.get<string>('PAYPHONE_TOKEN') || '',
          storeId: this.config.get<string>('PAYPHONE_STORE_ID'),
          baseUrl: this.config.get<string>('PAYPHONE_API_URL'),
        });
      case 'stripe':
        return new StripeGateway({
          secretKey: this.config.get<string>('STRIPE_SECRET_KEY') || '',
          webhookSecret: this.config.get<string>('STRIPE_WEBHOOK_SECRET'),
        });
      case 'mock':
        return new MockGateway(this.frontendUrl);
      default:
        throw new BadRequestException(`Pasarela desconocida: ${name}`);
    }
  }

  gateway(name: string): PaymentGateway {
    if (!this.enabledProviders().includes(name)) throw new BadRequestException(`La pasarela "${name}" no está habilitada`);
    if (!this.gateways.has(name)) {
      try {
        this.gateways.set(name, this.createGateway(name));
      } catch (err: any) {
        if (err instanceof GatewayError) throw new BadRequestException(err.message);
        throw err;
      }
    }
    return this.gateways.get(name)!;
  }

  // ---------- crear cobro ----------
  async create(dto: CreateOnlinePaymentDto, actorId: string) {
    const provider = dto.provider || this.defaultProvider;
    const gateway = this.gateway(provider);

    const invoice = await this.prisma.invoice.findUnique({
      where: { id: dto.invoiceId },
      include: { payments: true, patient: true },
    });
    if (!invoice) throw new NotFoundException('Factura no encontrada');
    if (invoice.status !== InvoiceStatus.EMITIDA && invoice.status !== InvoiceStatus.PARCIAL) {
      throw new BadRequestException(`No se puede cobrar en línea una factura en estado ${invoice.status}`);
    }
    const paid = invoice.payments.reduce((s, p) => s + Number(p.amount), 0);
    const remaining = round2(Number(invoice.total) - paid);
    const amount = round2(dto.amount ?? remaining);
    if (amount <= 0) throw new BadRequestException('La factura no tiene saldo pendiente');
    if (amount > remaining + 0.001) throw new BadRequestException(`El monto supera el saldo pendiente ($${remaining.toFixed(2)})`);

    const clientTxId = 'SIGO-' + randomUUID();
    const record = await this.prisma.onlinePayment.create({
      data: { invoiceId: invoice.id, provider, clientTxId, amount, currency: 'USD', createdById: actorId },
    });

    let checkout;
    try {
      checkout = await gateway.createCheckout({
        clientTxId,
        amountCents: Math.round(amount * 100),
        currency: 'USD',
        reference: `Factura ${invoice.number}`,
        customer: {
          name: `${invoice.patient.firstName} ${invoice.patient.lastName}`,
          email: invoice.patient.email || undefined,
          phone: invoice.patient.phone || undefined,
          documentId: invoice.patient.documentNumber,
        },
        returnUrl: `${this.frontendUrl}/pay/return?provider=${provider}&tx=${encodeURIComponent(clientTxId)}`,
        cancelUrl: `${this.frontendUrl}/pay/return?provider=${provider}&tx=${encodeURIComponent(clientTxId)}&cancelled=1`,
      });
    } catch (err: any) {
      await this.prisma.onlinePayment.update({ where: { id: record.id }, data: { status: OnlinePaymentStatus.FAILED, raw: { error: err.message } } });
      throw new BadGatewayException(err.message || 'No se pudo crear el cobro en la pasarela');
    }

    const updated = await this.prisma.onlinePayment.update({
      where: { id: record.id },
      data: {
        checkoutUrl: checkout.checkoutUrl,
        providerRef: checkout.providerRef,
        expiresAt: checkout.expiresAt,
        raw: (checkout.raw ?? undefined) as any,
      },
    });

    await this.prisma.auditLog.create({
      data: { actorId, action: 'ONLINE_PAYMENT_CREATE', entity: 'Invoice', entityId: invoice.id, newValues: { provider, amount, clientTxId } },
    });

    let sent: string | undefined;
    if (dto.sendVia === 'whatsapp' && invoice.patient.phone) {
      await this.notifications.send({
        channel: NotificationChannel.WHATSAPP,
        type: NotificationType.CUSTOM,
        to: invoice.patient.phone,
        customMessage: `Hola ${invoice.patient.firstName}, puedes pagar tu factura ${invoice.number} por $${amount.toFixed(2)} aquí: ${checkout.checkoutUrl}`,
      } as any);
      sent = 'whatsapp';
    } else if (dto.sendVia === 'email' && invoice.patient.email) {
      await this.notifications.send({
        channel: NotificationChannel.EMAIL,
        type: NotificationType.CUSTOM,
        to: invoice.patient.email,
        customMessage: `Factura ${invoice.number} – monto $${amount.toFixed(2)}. Enlace de pago seguro: ${checkout.checkoutUrl}`,
      } as any);
      sent = 'email';
    }

    return { ...updated, sentVia: sent };
  }

  // ---------- confirmar (redirección) ----------
  async confirm(provider: string, params: Record<string, string>) {
    const clientTxId = params.clientTransactionId || params.tx || params.clientTxId;
    if (!clientTxId) throw new BadRequestException('Falta el identificador de la transacción');
    const payment = await this.prisma.onlinePayment.findUnique({ where: { clientTxId } });
    if (!payment) throw new NotFoundException('Transacción no encontrada');
    if (payment.provider !== provider) throw new BadRequestException('La transacción pertenece a otra pasarela');
    if (payment.provider === 'mock' && process.env.NODE_ENV === 'production') throw new ForbiddenException('Pasarela simulada deshabilitada');
    if (payment.status !== OnlinePaymentStatus.PENDING) return this.publicView(payment.id);

    if (params.cancelled === '1' && !params.id && !params.session_id) {
      await this.prisma.onlinePayment.updateMany({ where: { id: payment.id, status: OnlinePaymentStatus.PENDING }, data: { status: OnlinePaymentStatus.CANCELLED } });
      return this.publicView(payment.id);
    }

    let result: ConfirmationResult;
    try {
      result = await this.gateway(provider).confirm({ ...params, amount: params.amount ?? String(Math.round(Number(payment.amount) * 100)) });
    } catch (err: any) {
      throw new BadGatewayException(err.message);
    }
    await this.settle(payment.id, result);
    return this.publicView(payment.id);
  }

  // ---------- webhooks ----------
  async handleWebhook(provider: string, rawBody: Buffer | undefined, headers: Record<string, any>) {
    const gw = this.gateway(provider);
    if (!gw.parseWebhook) throw new BadRequestException('Esta pasarela no usa webhooks');
    if (!rawBody) throw new BadRequestException('Cuerpo vacío');
    let event;
    try {
      event = gw.parseWebhook(rawBody, headers);
    } catch (err: any) {
      throw new BadRequestException(err.message);
    }
    if (!event) return { received: true, ignored: true };
    const payment = await this.prisma.onlinePayment.findUnique({ where: { clientTxId: event.clientTxId } });
    if (!payment || payment.provider !== provider) return { received: true, ignored: true };
    await this.settle(payment.id, event.result);
    return { received: true };
  }

  /**
   * Aplica el resultado una sola vez. La transición PENDING → PAID es atómica
   * (UPDATE … WHERE status = 'PENDING'), así redirección y webhook no duplican el pago.
   */
  async settle(paymentId: string, result: ConfirmationResult) {
    const payment = await this.prisma.onlinePayment.findUnique({ where: { id: paymentId } });
    if (!payment) throw new NotFoundException('Transacción no encontrada');
    const expectedCents = Math.round(Number(payment.amount) * 100);

    if (result.status === 'PENDING') return payment;

    if (result.status === 'PAID' && result.amountCents !== undefined && result.amountCents !== expectedCents) {
      this.logger.error(`Monto inconsistente en ${payment.clientTxId}: esperado ${expectedCents}, recibido ${result.amountCents}`);
      await this.prisma.onlinePayment.updateMany({
        where: { id: payment.id, status: OnlinePaymentStatus.PENDING },
        data: { status: OnlinePaymentStatus.FAILED, raw: { error: 'AMOUNT_MISMATCH', expectedCents, received: result.amountCents } as any },
      });
      return this.prisma.onlinePayment.findUnique({ where: { id: payment.id } });
    }

    const nextStatus =
      result.status === 'PAID' ? OnlinePaymentStatus.PAID : result.status === 'CANCELLED' ? OnlinePaymentStatus.CANCELLED : OnlinePaymentStatus.FAILED;

    const { count } = await this.prisma.onlinePayment.updateMany({
      where: { id: payment.id, status: OnlinePaymentStatus.PENDING },
      data: {
        status: nextStatus,
        providerRef: result.providerRef ?? payment.providerRef,
        authorizationCode: result.authorizationCode,
        cardBrand: result.cardBrand,
        cardLast4: result.cardLast4,
        cardType: result.cardType,
        paidAt: nextStatus === OnlinePaymentStatus.PAID ? new Date() : undefined,
        raw: (result.raw ?? { message: result.message }) as any,
      },
    });
    if (count === 0 || nextStatus !== OnlinePaymentStatus.PAID) {
      return this.prisma.onlinePayment.findUnique({ where: { id: payment.id } });
    }

    // Registrar el pago en la factura (método según el tipo de tarjeta)
    try {
      const invoice = await this.billing.addPayment(
        payment.invoiceId,
        {
          method: result.cardType === 'Debit' ? PaymentMethod.TARJETA_DEBITO : PaymentMethod.TARJETA_CREDITO,
          amount: Number(payment.amount),
          reference: `${payment.provider}:${result.authorizationCode || result.providerRef || payment.clientTxId}`,
          notes: `Pago en línea ${result.cardBrand || ''} ${result.cardLast4 ? '****' + result.cardLast4 : ''}`.trim(),
        },
        payment.createdById,
      );
      const created = [...invoice.payments].sort((a: any, b: any) => +new Date(b.paidAt) - +new Date(a.paidAt))[0];
      await this.prisma.onlinePayment.update({ where: { id: payment.id }, data: { paymentId: created?.id } });
    } catch (err: any) {
      // Cobrado en la pasarela pero no aplicable (p. ej. la factura se pagó en caja entretanto): requiere reembolso
      this.logger.error(`Pago ${payment.clientTxId} cobrado pero no aplicado: ${err.message}`);
      await this.prisma.auditLog.create({
        data: { actorId: payment.createdById, action: 'ONLINE_PAYMENT_UNAPPLIED', entity: 'Invoice', entityId: payment.invoiceId, newValues: { clientTxId: payment.clientTxId, error: err.message } },
      });
    }
    return this.prisma.onlinePayment.findUnique({ where: { id: payment.id } });
  }

  // ---------- consultas ----------
  /** Vista pública mínima para la página de resultado (sin datos clínicos) */
  async publicView(id: string) {
    const p = await this.prisma.onlinePayment.findUnique({
      where: { id },
      include: { invoice: { select: { number: true } } },
    });
    if (!p) throw new NotFoundException('Transacción no encontrada');
    return {
      clientTxId: p.clientTxId,
      status: p.status,
      amount: Number(p.amount),
      currency: p.currency,
      invoiceNumber: p.invoice.number,
      provider: p.provider,
      cardBrand: p.cardBrand,
      cardLast4: p.cardLast4,
      authorizationCode: p.status === OnlinePaymentStatus.PAID ? p.authorizationCode : null,
      checkoutUrl: p.status === OnlinePaymentStatus.PENDING ? p.checkoutUrl : null,
    };
  }

  async publicStatus(clientTxId: string) {
    const p = await this.prisma.onlinePayment.findUnique({ where: { clientTxId } });
    if (!p) throw new NotFoundException('Transacción no encontrada');
    return this.publicView(p.id);
  }

  listForInvoice(invoiceId: string) {
    return this.prisma.onlinePayment.findMany({
      where: { invoiceId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, provider: true, clientTxId: true, amount: true, status: true, checkoutUrl: true, authorizationCode: true,
        cardBrand: true, cardLast4: true, paidAt: true, expiresAt: true, createdAt: true,
      },
    });
  }

  /** Marca como vencidos los cobros pendientes (Payphone: enlace de 10 min; resto: expiresAt) */
  async expireStale(now = new Date()) {
    const cutoff = new Date(now.getTime() - 60 * 60 * 1000);
    const { count } = await this.prisma.onlinePayment.updateMany({
      where: {
        status: OnlinePaymentStatus.PENDING,
        OR: [{ expiresAt: { lt: now } }, { expiresAt: null, createdAt: { lt: cutoff } }],
      },
      data: { status: OnlinePaymentStatus.EXPIRED },
    });
    return { expired: count };
  }
}
