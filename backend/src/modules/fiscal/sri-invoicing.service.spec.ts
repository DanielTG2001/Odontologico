import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SriInvoicingService } from './sri-invoicing.service';
import { SriNetworkError } from './sri/sri-client';
import { FiscalService } from './fiscal.service';
import { FiscalCron } from './fiscal.cron';
import { isValidAccessKey } from './sri/access-key';
import { configOf, createPrismaMock, memoryRedis, PrismaMock } from '../../test-utils/mocks';

const CONFIG = {
  SRI_AMBIENTE: '1', SRI_RUC: '1710034065001', SRI_RAZON_SOCIAL: 'CLINICA DENTAL SONRISAS', SRI_DIR_MATRIZ: 'Av. Amazonas N34',
  SRI_ESTAB: '001', SRI_PTO_EMI: '001', SRI_AUTH_RETRIES: '2', SRI_AUTH_DELAY_MS: '0',
};

const invoice = (over: any = {}) => ({
  id: 'inv1', number: 'FAC-000010', status: 'PAGADA', total: 90, discount: 10, tax: 0,
  items: [{ description: 'Resina', quantity: 2, unitPrice: 40 }, { description: 'Profilaxis', quantity: 1, unitPrice: 20 }],
  payments: [{ method: 'TARJETA_CREDITO', amount: 60 }, { method: 'EFECTIVO', amount: 30 }],
  patient: { firstName: 'Ana', lastName: 'Paz', documentType: 'CI', documentNumber: '1710034065', email: 'ana@x.com', phone: null, address: null },
  ...over,
});

function build(config: Record<string, string> = CONFIG) {
  const prisma = createPrismaMock();
  const storage = { isEnabled: jest.fn().mockReturnValue(true), put: jest.fn().mockResolvedValue({}) };
  const signer = { sign: jest.fn(async (xml: string) => xml.replace('</factura>', '<ds:Signature/></factura>')) };
  const client = { send: jest.fn(), authorize: jest.fn() };
  class TestSri extends SriInvoicingService {
    protected createSigner() { return signer as any; }
    protected createClient() { return client as any; }
    protected sleep() { return Promise.resolve(); }
  }
  const sri = new TestSri(prisma as any, configOf(config), storage as any);
  // Persistencia simulada de electronic_documents
  const docs = new Map<string, any>();
  prisma.fiscalSequence.upsert.mockResolvedValue({});
  let seq = 1;
  prisma.fiscalSequence.update.mockImplementation(async () => ({ next: ++seq }));
  prisma.electronicDocument.create.mockImplementation(async ({ data }: any) => { const d = { id: 'doc' + (docs.size + 1), attempts: 0, ...data }; docs.set(d.id, d); return d; });
  prisma.electronicDocument.findUnique.mockImplementation(async ({ where }: any) => docs.get(where.id) ?? null);
  prisma.electronicDocument.update.mockImplementation(async ({ where, data }: any) => {
    const d = docs.get(where.id);
    const { attempts, ...rest } = data;
    Object.assign(d, rest, { attempts: d.attempts + (attempts?.increment ?? 0) });
    return d;
  });
  prisma.electronicDocument.findFirst.mockResolvedValue(null);
  prisma.invoice.findUnique.mockResolvedValue(invoice());
  return { prisma, storage, signer, client, sri, docs };
}

const AUTH_OK = { estado: 'AUTORIZADO', numeroAutorizacion: 'AUT-1', fechaAutorizacion: '2026-10-30T10:00:00-05:00', comprobante: '<factura autorizada/>', mensajes: [] };

describe('SriInvoicingService – emisión', () => {
  it('flujo feliz: firma, recibe, autoriza, guarda en S3 y actualiza la factura', async () => {
    const { sri, client, signer, storage, prisma, docs } = build();
    client.send.mockResolvedValue({ estado: 'RECIBIDA', mensajes: [] });
    client.authorize.mockResolvedValue(AUTH_OK);
    const { document } = await sri.emit('inv1', 'cajero');
    expect(document).toMatchObject({ status: 'AUTORIZADO', authorizationNumber: 'AUT-1', authorizedXml: '<factura autorizada/>' });
    expect(isValidAccessKey(document.accessKey)).toBe(true);
    expect(document.sequential).toBe('000000001');

    const xml: string = signer.sign.mock.calls[0][0];
    // Descuento global $10 repartido proporcionalmente: 80 → 8, 20 → 2
    expect(xml).toContain('<descuento>8.00</descuento>');
    expect(xml).toContain('<descuento>2.00</descuento>');
    expect(xml).toContain('<totalDescuento>10.00</totalDescuento>');
    expect(xml).toContain('<importeTotal>90.00</importeTotal>');
    expect(xml).toContain('<formaPago>19</formaPago><total>60.00</total>');
    expect(xml).toContain('<formaPago>01</formaPago><total>30.00</total>');
    expect(xml).toContain('<razonSocialComprador>ANA PAZ</razonSocialComprador>');

    expect(storage.put.mock.calls[0][0]).toBe(`fiscal/2026/${document.accessKey}.xml`);
    expect(document.storageKey).toBe(`fiscal/2026/${document.accessKey}.xml`);
    expect(prisma.invoice.update.mock.calls[0][0].data.fiscalData).toMatchObject({ provider: 'sri', accessKey: document.accessKey, authorizationNumber: 'AUT-1' });
    expect(docs.size).toBe(1);
  });

  it('es idempotente: si ya está autorizada no vuelve a emitir', async () => {
    const { sri, prisma, signer } = build();
    prisma.electronicDocument.findFirst.mockResolvedValue({ id: 'old', status: 'AUTORIZADO' });
    await expect(sri.emit('inv1', 'c')).resolves.toMatchObject({ alreadyAuthorized: true });
    expect(signer.sign).not.toHaveBeenCalled();
  });

  it('SRI caído → PENDIENTE_ENVIO, y el reintento lo completa', async () => {
    const { sri, client, prisma, docs } = build();
    client.send.mockRejectedValueOnce(new SriNetworkError('Sin conexión'));
    const { document } = await sri.emit('inv1', 'c');
    expect(document.status).toBe('PENDIENTE_ENVIO');
    expect(document.attempts).toBe(1);

    // Reanudación al volver a pulsar "Enviar" (reusa el mismo comprobante, mismo secuencial)
    prisma.electronicDocument.findFirst.mockResolvedValue(docs.get('doc1'));
    client.send.mockResolvedValue({ estado: 'RECIBIDA', mensajes: [] });
    client.authorize.mockResolvedValue(AUTH_OK);
    const again = await sri.emit('inv1', 'c');
    expect(again.document.status).toBe('AUTORIZADO');
    expect(docs.size).toBe(1);
  });

  it('DEVUELTA guarda los mensajes; un nuevo envío genera otro comprobante', async () => {
    const { sri, client, prisma, docs } = build();
    client.send.mockResolvedValue({ estado: 'DEVUELTA', mensajes: [{ identificador: '35', mensaje: 'ESTRUCTURA', tipo: 'ERROR' }] });
    const { document } = await sri.emit('inv1', 'c');
    expect(document).toMatchObject({ status: 'DEVUELTA', messages: [{ identificador: '35' }] });
    prisma.electronicDocument.findFirst.mockResolvedValue(docs.get('doc1'));
    client.send.mockResolvedValue({ estado: 'RECIBIDA', mensajes: [] });
    client.authorize.mockResolvedValue(AUTH_OK);
    const second = await sri.emit('inv1', 'c');
    expect(docs.size).toBe(2);
    expect(second.document.sequential).toBe('000000002');
  });

  it('"CLAVE ACCESO REGISTRADA" (43) se trata como recibida', async () => {
    const { sri, client } = build();
    client.send.mockResolvedValue({ estado: 'DEVUELTA', mensajes: [{ identificador: '43', mensaje: 'CLAVE ACCESO REGISTRADA' }] });
    client.authorize.mockResolvedValue(AUTH_OK);
    await expect(sri.emit('inv1', 'c')).resolves.toMatchObject({ document: { status: 'AUTORIZADO' } });
  });

  it('NO AUTORIZADO y EN PROCESAMIENTO', async () => {
    const a = build();
    a.client.send.mockResolvedValue({ estado: 'RECIBIDA', mensajes: [] });
    a.client.authorize.mockResolvedValue({ estado: 'NO AUTORIZADO', mensajes: [{ mensaje: 'FIRMA INVALIDA' }] });
    await expect(a.sri.emit('inv1', 'c')).resolves.toMatchObject({ document: { status: 'NO_AUTORIZADO' } });

    const b = build();
    b.client.send.mockResolvedValue({ estado: 'RECIBIDA', mensajes: [] });
    b.client.authorize.mockResolvedValue({ estado: 'EN PROCESAMIENTO', mensajes: [] });
    const res = await b.sri.emit('inv1', 'c');
    expect(res.document.status).toBe('EN_PROCESAMIENTO');
    expect(b.client.authorize).toHaveBeenCalledTimes(2);

    const c = build();
    c.client.send.mockResolvedValue({ estado: 'RECIBIDA', mensajes: [] });
    c.client.authorize.mockRejectedValue(new SriNetworkError('caído'));
    await expect(c.sri.emit('inv1', 'c')).resolves.toMatchObject({ document: { status: 'RECIBIDA' } });
  });

  it('si S3 falla, autoriza igual (el XML queda en BD)', async () => {
    const { sri, client, storage } = build();
    storage.put.mockRejectedValue(new Error('S3 down'));
    client.send.mockResolvedValue({ estado: 'RECIBIDA', mensajes: [] });
    client.authorize.mockResolvedValue({ ...AUTH_OK, comprobante: undefined, numeroAutorizacion: undefined, fechaAutorizacion: undefined });
    const { document } = await sri.emit('inv1', 'c');
    expect(document.status).toBe('AUTORIZADO');
    expect(document.storageKey).toBeUndefined();
    expect(document.authorizationNumber).toBe(document.accessKey);
    expect(document.authorizedXml).toContain('ds:Signature');
  });

  it('saldo pendiente se declara como forma de pago 20 con plazo', async () => {
    const { sri, client, signer, prisma } = build();
    prisma.invoice.findUnique.mockResolvedValue(invoice({ status: 'PARCIAL', payments: [{ method: 'EFECTIVO', amount: 40 }] }));
    client.send.mockResolvedValue({ estado: 'RECIBIDA', mensajes: [] });
    client.authorize.mockResolvedValue(AUTH_OK);
    await sri.emit('inv1', 'c');
    expect(signer.sign.mock.calls[0][0]).toContain('<formaPago>20</formaPago><total>50.00</total><plazo>30</plazo><unidadTiempo>dias</unidadTiempo>');
  });

  it('validaciones previas al envío', async () => {
    const { sri, prisma } = build();
    prisma.invoice.findUnique.mockResolvedValueOnce(null);
    await expect(sri.emit('x', 'c')).rejects.toThrow(NotFoundException);
    prisma.invoice.findUnique.mockResolvedValueOnce(invoice({ status: 'BORRADOR' }));
    await expect(sri.emit('x', 'c')).rejects.toThrow('Emita');
    prisma.invoice.findUnique.mockResolvedValueOnce(invoice({ status: 'ANULADA' }));
    await expect(sri.emit('x', 'c')).rejects.toThrow('anulada');
    prisma.invoice.findUnique.mockResolvedValueOnce(invoice({ patient: { ...invoice().patient, documentNumber: '1710034066' } }));
    await expect(sri.emit('x', 'c')).rejects.toThrow('cédula');
    prisma.invoice.findUnique.mockResolvedValueOnce(invoice({ patient: { ...invoice().patient, documentType: 'RUC', documentNumber: '1710034066001' } }));
    await expect(sri.emit('x', 'c')).rejects.toThrow('RUC del paciente');
    prisma.invoice.findUnique.mockResolvedValueOnce(invoice({ tax: 12, total: 102 }));
    await expect(sri.emit('x', 'c')).rejects.toThrow('SRI_IVA');
  });

  it('exige los datos del emisor', async () => {
    const { sri } = build({ SRI_AMBIENTE: '2' });
    expect(sri.environment).toBe('2');
    await expect(sri.emit('inv1', 'c')).rejects.toThrow('SRI_RUC, SRI_RAZON_SOCIAL, SRI_DIR_MATRIZ');
    const bad = build({ ...CONFIG, SRI_RUC: '1710034066001' });
    await expect(bad.sri.emit('inv1', 'c')).rejects.toThrow('RUC válido');
  });

  it('IVA 15 % configurado', async () => {
    const { sri, client, signer, prisma } = build({ ...CONFIG, SRI_IVA_CODIGO: '4', SRI_IVA_TARIFA: '15' });
    prisma.invoice.findUnique.mockResolvedValue(invoice({ items: [{ description: 'Kit', quantity: 1, unitPrice: 100 }], discount: 0, tax: 15, total: 115, payments: [{ method: 'TARJETA_DEBITO', amount: 115 }] }));
    client.send.mockResolvedValue({ estado: 'RECIBIDA', mensajes: [] });
    client.authorize.mockResolvedValue(AUTH_OK);
    await sri.emit('inv1', 'c');
    const xml = signer.sign.mock.calls[0][0];
    expect(xml).toContain('<codigoPorcentaje>4</codigoPorcentaje><tarifa>15</tarifa><baseImponible>100.00</baseImponible><valor>15.00</valor>');
    expect(xml).toContain('<formaPago>16</formaPago>');
  });
});

describe('SriInvoicingService – consultas y cron', () => {
  it('retryPending procesa los pendientes y reporta errores', async () => {
    const { sri, prisma } = build();
    prisma.electronicDocument.findMany.mockResolvedValue([{ id: 'a' }, { id: 'b' }]);
    jest.spyOn(sri, 'process').mockResolvedValueOnce({ status: 'AUTORIZADO' } as any).mockRejectedValueOnce(new Error('x'));
    await expect(sri.retryPending()).resolves.toEqual({ processed: 2, results: { a: 'AUTORIZADO', b: 'ERROR: x' } });
  });

  it('process de un comprobante inexistente', async () => {
    const { sri } = build();
    await expect(sri.process('nope')).rejects.toThrow(NotFoundException);
  });

  it('XML, RIDE y listado', async () => {
    const { sri, prisma } = build();
    prisma.electronicDocument.findUnique.mockResolvedValueOnce({ accessKey: 'K', signedXml: '<s/>', authorizedXml: null });
    await expect(sri.getXml('d')).resolves.toEqual({ fileName: 'K.xml', xml: '<s/>', authorized: false });
    prisma.electronicDocument.findUnique.mockResolvedValueOnce(null);
    await expect(sri.getXml('d')).rejects.toThrow(NotFoundException);
    prisma.electronicDocument.findUnique.mockResolvedValueOnce({ estab: '001', ptoEmi: '001', sequential: '000000001', accessKey: 'K', environment: '1', status: 'AUTORIZADO', issueDate: new Date(), authorizationNumber: 'A', authorizationDate: new Date(), invoice: invoice() });
    const html = await sri.getRide('d');
    expect(html).toContain('001-001-000000001');
    expect(html).toContain('$90.00');
    prisma.electronicDocument.findUnique.mockResolvedValueOnce(null);
    await expect(sri.getRide('d')).rejects.toThrow(NotFoundException);
    prisma.electronicDocument.findMany.mockResolvedValue([]);
    await expect(sri.listForInvoice('inv1')).resolves.toEqual([]);
  });

  it('el cron solo corre con FISCAL_PROVIDER=sri y con lock', async () => {
    const env = { ...process.env };
    const retry = jest.fn().mockResolvedValue({ processed: 1 });
    const redis = memoryRedis();
    const cron = new FiscalCron({ retryPending: retry } as any, redis);
    process.env.FISCAL_PROVIDER = 'mock';
    await cron.handle();
    expect(retry).not.toHaveBeenCalled();
    delete process.env.FISCAL_PROVIDER; // por defecto: sri-simulado → sí corre
    await cron.handle();
    expect(retry).toHaveBeenCalledTimes(1);
    await redis.releaseLock('cron:sri-retry');
    retry.mockClear();
    process.env.FISCAL_PROVIDER = 'sri';
    await cron.handle();
    await cron.handle();
    expect(retry).toHaveBeenCalledTimes(1);
    await redis.releaseLock('cron:sri-retry');
    retry.mockRejectedValueOnce(new Error('x'));
    await expect(cron.handle()).resolves.toBeUndefined();
    process.env = env;
  });
});

describe('FiscalService', () => {
  const env = { ...process.env };
  afterEach(() => { process.env = { ...env }; });

  it('delegación al SRI', async () => {
    process.env.FISCAL_PROVIDER = 'sri';
    const prisma = createPrismaMock();
    prisma.invoice.findUnique.mockResolvedValue({ id: 'inv1' });
    const sri = { emit: jest.fn().mockResolvedValue({ document: { status: 'AUTORIZADO' } }) };
    const svc = new FiscalService(prisma as any, {} as any, sri as any);
    expect(svc.provider).toBe('sri');
    delete process.env.FISCAL_PROVIDER;
    expect(svc.provider).toBe('sri-simulado');
    process.env.FISCAL_PROVIDER = 'sri';
    await expect(svc.stampInvoice('inv1', 'c')).resolves.toMatchObject({ provider: 'sri', document: { status: 'AUTORIZADO' } });
  });

  it('modo mock', async () => {
    process.env.FISCAL_PROVIDER = 'mock';
    const prisma = createPrismaMock();
    prisma.invoice.findUnique.mockResolvedValue({ id: 'inv1', number: 'F1', status: 'EMITIDA', total: 10, subtotal: 10, tax: 0, issuedAt: null, items: [{ description: 'x', quantity: 1, unitPrice: 10 }], patient: { documentNumber: '1', firstName: 'A', lastName: 'B' } });
    prisma.invoice.update.mockResolvedValue({ id: 'inv1' });
    const mock = { stamp: jest.fn().mockResolvedValue({ success: true, uuid: 'MOCK-1', provider: 'mock' }) };
    const svc = new FiscalService(prisma as any, mock as any, {} as any);
    await expect(svc.stampInvoice('inv1', 'c')).resolves.toMatchObject({ stamp: { uuid: 'MOCK-1' } });
    mock.stamp.mockResolvedValue({ success: false, error: 'x' });
    await expect(svc.stampInvoice('inv1', 'c')).rejects.toThrow(BadRequestException);
    prisma.invoice.findUnique.mockResolvedValue({ status: 'BORRADOR' });
    await expect(svc.stampInvoice('inv1', 'c')).rejects.toThrow(BadRequestException);
    prisma.invoice.findUnique.mockResolvedValue({ status: 'ANULADA' });
    await expect(svc.stampInvoice('inv1', 'c')).rejects.toThrow(BadRequestException);
    prisma.invoice.findUnique.mockResolvedValue(null);
    await expect(svc.stampInvoice('inv1', 'c')).rejects.toThrow(NotFoundException);
  });
});
