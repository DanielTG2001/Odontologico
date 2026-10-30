import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomInt } from 'crypto';
import { ElectronicDocStatus, InvoiceStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { buildAccessKey, isValidCedula, isValidRuc } from './sri/access-key';
import { buildFacturaXml, buyerIdType, computeTotals, formaPago, InvoiceLine, Issuer, PaymentLine, round2 } from './sri/invoice-xml';
import { SRI_URLS, SriClient, SriMessage, SriNetworkError } from './sri/sri-client';
import { OpenFacturaSigner, XmlSigner } from './sri/xml-signer';
import { renderRide } from './sri/ride';
import { SimulatedSigner, SimulatedSriClient } from './sri/simulated';

/** Estados en los que el comprobante sigue "vivo" y se puede reintentar. */
export const RESUMABLE: ElectronicDocStatus[] = [
  ElectronicDocStatus.FIRMADO,
  ElectronicDocStatus.PENDIENTE_ENVIO,
  ElectronicDocStatus.RECIBIDA,
  ElectronicDocStatus.EN_PROCESAMIENTO,
];

const FORMA_PAGO_LABEL: Record<string, string> = {
  '01': 'Sin utilización del sistema financiero',
  '16': 'Tarjeta de débito',
  '19': 'Tarjeta de crédito',
  '20': 'Otros con utilización del sistema financiero',
};

/**
 * Facturación electrónica con el SRI de Ecuador (esquema offline):
 * secuencial → clave de acceso → XML 1.1.0 → firma XAdES-BES → recepción → autorización.
 */
@Injectable()
export class SriInvoicingService {
  private readonly logger = new Logger('SRI');
  private signer?: XmlSigner;
  private client?: SriClient;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly storage: StorageService,
  ) {}

  // ---------- configuración ----------
  /** FISCAL_PROVIDER=sri-simulado: mismo flujo, sin firma real ni conexión con el SRI */
  get simulated(): boolean {
    return (this.config.get<string>('FISCAL_PROVIDER') || process.env.FISCAL_PROVIDER || '').toLowerCase() === 'sri-simulado';
  }

  get environment(): '1' | '2' {
    if (this.simulated) return '1';
    return this.config.get<string>('SRI_AMBIENTE') === '2' ? '2' : '1';
  }

  issuer(): Issuer {
    // En simulación se usan datos de una clínica de demostración si no se configuraron
    const demo: Record<string, string> = this.simulated
      ? { SRI_RUC: '1790012345001', SRI_RAZON_SOCIAL: 'CLINICA DENTAL DEMOSTRACION SIGO', SRI_NOMBRE_COMERCIAL: 'SIGO-Dental (demo)', SRI_DIR_MATRIZ: 'Av. Amazonas N34-56, Quito' }
      : {};
    const c = (k: string) => (this.config.get<string>(k) || demo[k] || '').trim();
    const issuer: Issuer = {
      ruc: c('SRI_RUC'),
      razonSocial: c('SRI_RAZON_SOCIAL'),
      nombreComercial: c('SRI_NOMBRE_COMERCIAL') || undefined,
      dirMatriz: c('SRI_DIR_MATRIZ'),
      dirEstablecimiento: c('SRI_DIR_ESTABLECIMIENTO') || undefined,
      estab: c('SRI_ESTAB') || '001',
      ptoEmi: c('SRI_PTO_EMI') || '001',
      obligadoContabilidad: c('SRI_OBLIGADO_CONTABILIDAD') === 'SI' ? 'SI' : 'NO',
      contribuyenteEspecial: c('SRI_CONTRIBUYENTE_ESPECIAL') || undefined,
      contribuyenteRimpe: c('SRI_CONTRIBUYENTE_RIMPE') || undefined,
      agenteRetencion: c('SRI_AGENTE_RETENCION') || undefined,
    };
    const missing = (['ruc', 'razonSocial', 'dirMatriz'] as const).filter((k) => !issuer[k]);
    if (missing.length) {
      throw new BadRequestException(`Faltan datos del emisor para el SRI: ${missing.map((k) => 'SRI_' + k.replace(/[A-Z]/g, (x) => '_' + x).toUpperCase()).join(', ')}`);
    }
    if (!isValidRuc(issuer.ruc)) throw new BadRequestException('SRI_RUC no es un RUC válido');
    return issuer;
  }

  protected createSigner(): XmlSigner {
    if (this.simulated) return new SimulatedSigner();
    return new OpenFacturaSigner({
      path: this.config.get<string>('SRI_CERT_PATH'),
      base64: this.config.get<string>('SRI_CERT_BASE64'),
      password: this.config.get<string>('SRI_CERT_PASSWORD') || '',
    });
  }

  protected createClient(): SriClient {
    if (this.simulated) return new SimulatedSriClient() as unknown as SriClient;
    const env = this.environment;
    return new SriClient({
      reception: this.config.get<string>('SRI_RECEPTION_URL') || SRI_URLS[env].reception,
      authorization: this.config.get<string>('SRI_AUTHORIZATION_URL') || SRI_URLS[env].authorization,
    });
  }

  protected sleep(ms: number) {
    return new Promise((r) => setTimeout(r, ms));
  }

  private getSigner() {
    return (this.signer ??= this.createSigner());
  }
  private getClient() {
    return (this.client ??= this.createClient());
  }

  // ---------- secuencial atómico ----------
  async nextSequential(estab: string, ptoEmi: string, codDoc = '01'): Promise<string> {
    const start = Number(this.config.get<string>('SRI_SECUENCIAL_INICIAL') || 1);
    const where = { codDoc_estab_ptoEmi: { codDoc, estab, ptoEmi } };
    await this.prisma.fiscalSequence.upsert({ where, create: { codDoc, estab, ptoEmi, next: start }, update: {} });
    // UPDATE … SET next = next + 1 RETURNING: atómico aunque haya varias réplicas de la API
    const row = await this.prisma.fiscalSequence.update({ where, data: { next: { increment: 1 } } });
    return String(row.next - 1).padStart(9, '0');
  }

  // ---------- emisión ----------
  async emit(invoiceId: string, actorId: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: { items: true, payments: true, patient: true },
    });
    if (!invoice) throw new NotFoundException('Factura no encontrada');
    if (invoice.status === InvoiceStatus.BORRADOR) throw new BadRequestException('Emita la factura antes de enviarla al SRI');
    if (invoice.status === InvoiceStatus.ANULADA) throw new BadRequestException('No se puede autorizar una factura anulada');

    const last = await this.prisma.electronicDocument.findFirst({ where: { invoiceId }, orderBy: { createdAt: 'desc' } });
    if (last?.status === ElectronicDocStatus.AUTORIZADO) return { document: last, alreadyAuthorized: true };
    if (last && RESUMABLE.includes(last.status)) return { document: await this.process(last.id) };

    const issuer = this.issuer();
    const p = invoice.patient;
    const idType = buyerIdType(p.documentType, p.documentNumber);
    if (idType === '05' && !isValidCedula(p.documentNumber)) {
      throw new BadRequestException(`La cédula del paciente (${p.documentNumber}) no es válida para el SRI`);
    }
    if (idType === '04' && !isValidRuc(p.documentNumber)) {
      throw new BadRequestException(`El RUC del paciente (${p.documentNumber}) no es válido`);
    }

    const lines = this.buildLines(invoice.items, Number(invoice.discount));
    const expected = computeTotals(lines).importeTotal;
    if (Math.abs(expected - Number(invoice.total)) > 0.01) {
      throw new BadRequestException(
        `El total calculado para el SRI (${expected.toFixed(2)}) no coincide con la factura (${Number(invoice.total).toFixed(2)}). ` +
          'Revise la tarifa de IVA configurada (SRI_IVA_CODIGO / SRI_IVA_TARIFA).',
      );
    }
    const payments = this.buildPayments(invoice.payments, Number(invoice.total));
    const issueDate = new Date();
    const sequential = await this.nextSequential(issuer.estab, issuer.ptoEmi);
    const accessKey = buildAccessKey({
      issueDate,
      codDoc: '01',
      ruc: issuer.ruc,
      environment: this.environment,
      estab: issuer.estab,
      ptoEmi: issuer.ptoEmi,
      sequential,
      numericCode: String(randomInt(0, 100_000_000)).padStart(8, '0'),
    });

    let xml: string;
    try {
      ({ xml } = buildFacturaXml({
        environment: this.environment,
        accessKey,
        sequential,
        issueDate,
        issuer,
        buyer: {
          idType,
          id: p.documentNumber,
          name: `${p.firstName} ${p.lastName}`.toUpperCase(),
          address: p.address || undefined,
          email: p.email || undefined,
          phone: p.phone || undefined,
        },
        lines,
        payments,
        additional: { 'Factura interna': invoice.number },
      }));
    } catch (err: any) {
      throw new BadRequestException(err.message);
    }

    const signedXml = await this.getSigner().sign(xml);
    const doc = await this.prisma.electronicDocument.create({
      data: {
        invoiceId,
        codDoc: '01',
        environment: this.environment,
        estab: issuer.estab,
        ptoEmi: issuer.ptoEmi,
        sequential,
        accessKey,
        issueDate,
        status: ElectronicDocStatus.FIRMADO,
        signedXml,
      },
    });
    await this.prisma.auditLog.create({
      data: { actorId, action: 'FISCAL_SIGN', entity: 'Invoice', entityId: invoiceId, newValues: { accessKey, sequential } },
    });
    return { document: await this.process(doc.id) };
  }

  /** Reparte el descuento global de la factura entre los detalles (el SRI lo exige por línea). */
  buildLines(items: { description: string; quantity: number; unitPrice: unknown }[], invoiceDiscount: number): InvoiceLine[] {
    const vat = {
      codigoPorcentaje: this.config.get<string>('SRI_IVA_CODIGO') || '0',
      tarifa: Number(this.config.get<string>('SRI_IVA_TARIFA') || 0),
    };
    const gross = items.map((i) => round2(i.quantity * Number(i.unitPrice)));
    const totalGross = gross.reduce((a, b) => a + b, 0);
    let remaining = round2(invoiceDiscount);
    return items.map((it, idx) => {
      const isLast = idx === items.length - 1;
      const share = isLast ? remaining : totalGross > 0 ? round2((invoiceDiscount * gross[idx]) / totalGross) : 0;
      remaining = round2(remaining - share);
      return {
        code: `SRV${String(idx + 1).padStart(3, '0')}`,
        description: it.description,
        quantity: it.quantity,
        unitPrice: Number(it.unitPrice),
        discount: share,
        vat,
      };
    });
  }

  /** Formas de pago agrupadas; el saldo pendiente se declara como crédito (20, con plazo). */
  buildPayments(payments: { method: string; amount: unknown }[], total: number): PaymentLine[] {
    const grouped = new Map<string, number>();
    for (const p of payments) {
      const code = formaPago(p.method);
      grouped.set(code, round2((grouped.get(code) || 0) + Number(p.amount)));
    }
    const lines: PaymentLine[] = [...grouped.entries()].map(([formaPago, t]) => ({ formaPago, total: t }));
    const paid = lines.reduce((s, l) => s + l.total, 0);
    const pending = round2(total - paid);
    if (pending > 0.004) {
      lines.push({ formaPago: this.config.get<string>('SRI_FORMA_PAGO_PENDIENTE') || '20', total: pending, plazo: 30, unidadTiempo: 'dias' });
    }
    return lines;
  }

  // ---------- envío y autorización ----------
  async process(documentId: string) {
    let doc = await this.prisma.electronicDocument.findUnique({ where: { id: documentId } });
    if (!doc) throw new NotFoundException('Comprobante no encontrado');
    const client = this.getClient();
    const touch = { attempts: { increment: 1 }, lastAttemptAt: new Date() };

    if (doc.status === ElectronicDocStatus.FIRMADO || doc.status === ElectronicDocStatus.PENDIENTE_ENVIO) {
      try {
        const rec = await client.send(doc.signedXml);
        // 43 = CLAVE ACCESO REGISTRADA: ya se había recibido en un intento anterior
        const alreadyReceived = rec.mensajes.some((m) => m.identificador === '43');
        if (rec.estado === 'RECIBIDA' || alreadyReceived) {
          doc = await this.prisma.electronicDocument.update({
            where: { id: doc.id },
            data: { status: ElectronicDocStatus.RECIBIDA, messages: rec.mensajes as any, ...touch },
          });
        } else {
          return this.prisma.electronicDocument.update({
            where: { id: doc.id },
            data: { status: ElectronicDocStatus.DEVUELTA, messages: rec.mensajes as any, ...touch },
          });
        }
      } catch (err) {
        if (!(err instanceof SriNetworkError)) throw err;
        this.logger.warn(`SRI no disponible (${err.message}); se reintentará ${doc.accessKey}`);
        return this.prisma.electronicDocument.update({
          where: { id: doc.id },
          data: { status: ElectronicDocStatus.PENDIENTE_ENVIO, messages: [{ mensaje: err.message, tipo: 'ERROR' }] as any, ...touch },
        });
      }
    }

    const retries = Number(this.config.get<string>('SRI_AUTH_RETRIES') || 3);
    const delay = Number(this.config.get<string>('SRI_AUTH_DELAY_MS') || 2000);
    for (let i = 0; i < retries; i++) {
      if (i > 0) await this.sleep(delay);
      let auth;
      try {
        auth = await client.authorize(doc!.accessKey);
      } catch (err) {
        if (!(err instanceof SriNetworkError)) throw err;
        return doc; // queda RECIBIDA; el cron reintenta
      }
      if (auth.estado === 'AUTORIZADO') return this.markAuthorized(doc!, auth);
      if (auth.estado === 'NO AUTORIZADO') {
        return this.prisma.electronicDocument.update({
          where: { id: doc!.id },
          data: { status: ElectronicDocStatus.NO_AUTORIZADO, messages: auth.mensajes as any, ...touch },
        });
      }
    }
    return this.prisma.electronicDocument.update({
      where: { id: doc!.id },
      data: { status: ElectronicDocStatus.EN_PROCESAMIENTO, ...touch },
    });
  }

  private async markAuthorized(doc: { id: string; invoiceId: string; accessKey: string; signedXml: string; environment: string }, auth: { numeroAutorizacion?: string; fechaAutorizacion?: string; comprobante?: string; mensajes: SriMessage[] }) {
    const authorizedXml = auth.comprobante || doc.signedXml;
    const authorizationDate = auth.fechaAutorizacion ? new Date(auth.fechaAutorizacion) : new Date();
    let storageKey: string | undefined;
    if (this.storage.isEnabled() && !this.simulated) {
      // Conservación del XML autorizado (obligación tributaria: 7 años)
      storageKey = `fiscal/${authorizationDate.getFullYear()}/${doc.accessKey}.xml`;
      try {
        await this.storage.put(storageKey, Buffer.from(authorizedXml, 'utf8'), 'application/xml', { accessKey: doc.accessKey });
      } catch (err: any) {
        this.logger.error(`No se pudo guardar el XML autorizado en S3: ${err.message}`);
        storageKey = undefined;
      }
    }
    const updated = await this.prisma.electronicDocument.update({
      where: { id: doc.id },
      data: {
        status: ElectronicDocStatus.AUTORIZADO,
        authorizedXml,
        authorizationNumber: auth.numeroAutorizacion || doc.accessKey,
        authorizationDate,
        messages: auth.mensajes as any,
        storageKey,
        attempts: { increment: 1 },
        lastAttemptAt: new Date(),
      },
    });
    await this.prisma.invoice.update({
      where: { id: doc.invoiceId },
      data: {
        fiscalData: {
          provider: this.simulated ? 'sri-simulado' : 'sri',
          environment: doc.environment,
          accessKey: doc.accessKey,
          authorizationNumber: updated.authorizationNumber,
          authorizationDate: authorizationDate.toISOString(),
          documentId: doc.id,
        },
      },
    });
    this.logger.log(`Factura ${doc.accessKey} AUTORIZADA`);
    return updated;
  }

  /** Reintenta los comprobantes pendientes (cron). */
  async retryPending(limit = 50) {
    const docs = await this.prisma.electronicDocument.findMany({
      where: { status: { in: RESUMABLE }, attempts: { lt: 100 } },
      orderBy: { lastAttemptAt: 'asc' },
      take: limit,
      select: { id: true },
    });
    const results: Record<string, string> = {};
    for (const d of docs) {
      try {
        const r: any = await this.process(d.id);
        results[d.id] = r?.status;
      } catch (err: any) {
        results[d.id] = 'ERROR: ' + err.message;
      }
    }
    return { processed: docs.length, results };
  }

  listForInvoice(invoiceId: string) {
    return this.prisma.electronicDocument.findMany({
      where: { invoiceId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, accessKey: true, sequential: true, estab: true, ptoEmi: true, environment: true, status: true,
        authorizationNumber: true, authorizationDate: true, messages: true, attempts: true, createdAt: true,
      },
    });
  }

  async getXml(documentId: string) {
    const doc = await this.prisma.electronicDocument.findUnique({ where: { id: documentId } });
    if (!doc) throw new NotFoundException('Comprobante no encontrado');
    return { fileName: `${doc.accessKey}.xml`, xml: doc.authorizedXml || doc.signedXml, authorized: !!doc.authorizedXml };
  }

  async getRide(documentId: string) {
    const doc = await this.prisma.electronicDocument.findUnique({
      where: { id: documentId },
      include: { invoice: { include: { items: true, payments: true, patient: true } } },
    });
    if (!doc) throw new NotFoundException('Comprobante no encontrado');
    const inv = doc.invoice;
    const lines = this.buildLines(inv.items, Number(inv.discount));
    const vatLabel = `${lines[0]?.vat.tarifa ?? 0}%`;
    const subtotal = round2(lines.reduce((s, l) => s + l.quantity * l.unitPrice - l.discount, 0));
    const vatValue = round2(Number(inv.total) - subtotal);
    return renderRide({
      issuer: this.issuer(),
      number: `${doc.estab}-${doc.ptoEmi}-${doc.sequential}`,
      accessKey: doc.accessKey,
      environment: doc.environment,
      authorizationNumber: doc.authorizationNumber,
      authorizationDate: doc.authorizationDate,
      status: doc.status,
      simulated: this.simulated || !!doc.authorizedXml?.includes('SIGO-SIMULADO') || !!doc.signedXml?.includes('SIGO-SIMULADO'),
      issueDate: doc.issueDate,
      buyer: { name: `${inv.patient.firstName} ${inv.patient.lastName}`.toUpperCase(), id: inv.patient.documentNumber, address: inv.patient.address, email: inv.patient.email },
      lines: lines.map((l) => ({ description: l.description, quantity: l.quantity, unitPrice: l.unitPrice, discount: l.discount, total: round2(l.quantity * l.unitPrice - l.discount) })),
      totals: { subtotal, discount: round2(lines.reduce((s, l) => s + l.discount, 0)), vatLines: [{ label: vatLabel, base: subtotal, value: vatValue }], total: Number(inv.total) },
      payments: this.buildPayments(inv.payments, Number(inv.total)).map((p) => ({ label: FORMA_PAGO_LABEL[p.formaPago] || p.formaPago, total: p.total })),
    });
  }
}
