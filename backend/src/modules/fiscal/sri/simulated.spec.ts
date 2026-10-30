import { SimulatedSigner, SimulatedSriClient, validateLikeSri } from './simulated';
import { buildAccessKey } from './access-key';
import { buildFacturaXml } from './invoice-xml';
import { SriInvoicingService } from '../sri-invoicing.service';
import { configOf, createPrismaMock } from '../../../test-utils/mocks';

const key = buildAccessKey({ issueDate: new Date('2026-10-30T15:00:00Z'), codDoc: '01', ruc: '1790012345001', environment: '1', estab: '001', ptoEmi: '001', sequential: 1, numericCode: '12345678' });
const xmlFor = (over: Partial<Parameters<typeof buildFacturaXml>[0]> = {}) =>
  buildFacturaXml({
    environment: '1', accessKey: key, sequential: '000000001', issueDate: new Date(),
    issuer: { ruc: '1790012345001', razonSocial: 'DEMO', dirMatriz: 'Quito', estab: '001', ptoEmi: '001', obligadoContabilidad: 'NO' },
    buyer: { idType: '05', id: '1710034065', name: 'ANA' },
    lines: [{ code: 'A', description: 'Resina', quantity: 1, unitPrice: 40, discount: 0, vat: { codigoPorcentaje: '0', tarifa: 0 } }],
    payments: [{ formaPago: '01', total: 40 }],
    ...over,
  }).xml;

describe('SRI simulado', () => {
  it('firma marcada como simulada y recepción/autorización como el SRI', async () => {
    const signed = await new SimulatedSigner().sign(xmlFor());
    expect(signed).toContain('Id="SIGO-SIMULADO"');
    expect(signed.endsWith('</ds:Signature></factura>')).toBe(true);
    const sri = new SimulatedSriClient();
    await expect(sri.send(signed)).resolves.toEqual({ estado: 'RECIBIDA', mensajes: [] });
    await expect(sri.send(signed)).resolves.toMatchObject({ estado: 'DEVUELTA', mensajes: [{ identificador: '43' }] });
    const auth = await sri.authorize(key);
    expect(auth).toMatchObject({ estado: 'AUTORIZADO', numeroAutorizacion: key, ambiente: 'SIMULADO', comprobante: signed });
    // Sin estado: otra instancia (otra réplica o tras reinicio) también autoriza
    await expect(new SimulatedSriClient().authorize(key)).resolves.toMatchObject({ estado: 'AUTORIZADO', comprobante: undefined });
    await expect(sri.authorize('123')).resolves.toMatchObject({ estado: 'NO AUTORIZADO' });
  });

  it('devuelve los mismos errores típicos del SRI', async () => {
    expect(validateLikeSri(xmlFor())).toEqual([{ identificador: '39', mensaje: 'FIRMA INVALIDA', informacionAdicional: 'El comprobante no está firmado', tipo: 'ERROR' }]);
    const signer = new SimulatedSigner();
    const badKey = await signer.sign(xmlFor().replace(key, key.slice(0, 48) + ((Number(key[48]) + 1) % 10)));
    expect(validateLikeSri(badKey).map((m) => m.identificador)).toEqual(['70']);
    const cf = await signer.sign(xmlFor({ buyer: { idType: '07', id: '9999999999999', name: 'CONSUMIDOR FINAL' }, lines: [{ code: 'A', description: 'x', quantity: 1, unitPrice: 80, discount: 0, vat: { codigoPorcentaje: '0', tarifa: 0 } }], payments: [{ formaPago: '01', total: 80 }] }));
    expect(validateLikeSri(cf)[0].informacionAdicional).toContain('Consumidor final');
    const broken = (await signer.sign(xmlFor())).replace('<pagos><pago><formaPago>01</formaPago><total>40.00</total>', '<pagos><pago><formaPago>01</formaPago><total>30.00</total>').replace(/<razonSocial>[^<]*<\/razonSocial>/, '');
    const ids = validateLikeSri(broken.replace('<factura id="comprobante"', '<factura'));
    expect(ids.map((m) => m.identificador).sort()).toEqual(['35', '35', '52']);
    await expect(new SimulatedSriClient().send(broken)).resolves.toMatchObject({ estado: 'DEVUELTA' });
  });

  it('flujo completo del servicio en modo simulado (sin certificado ni datos del emisor)', async () => {
    const prisma = createPrismaMock();
    const docs = new Map<string, any>();
    prisma.invoice.findUnique.mockResolvedValue({
      id: 'inv1', number: 'FAC-1', status: 'PAGADA', total: 40, discount: 0, tax: 0,
      items: [{ description: 'Resina', quantity: 1, unitPrice: 40 }], payments: [{ method: 'EFECTIVO', amount: 40 }],
      patient: { firstName: 'Ana', lastName: 'Paz', documentType: 'CI', documentNumber: '1710034065', email: null, phone: null, address: null },
    });
    prisma.electronicDocument.findFirst.mockResolvedValue(null);
    prisma.fiscalSequence.upsert.mockResolvedValue({});
    prisma.fiscalSequence.update.mockResolvedValue({ next: 2 });
    prisma.electronicDocument.create.mockImplementation(async ({ data }: any) => { const d = { id: 'd1', attempts: 0, ...data }; docs.set('d1', d); return d; });
    prisma.electronicDocument.findUnique.mockImplementation(async () => docs.get('d1'));
    prisma.electronicDocument.update.mockImplementation(async ({ data }: any) => { const { attempts, ...rest } = data; return Object.assign(docs.get('d1'), rest); });
    const storage = { isEnabled: () => true, put: jest.fn() };
    const svc = new SriInvoicingService(prisma as any, configOf({ FISCAL_PROVIDER: 'sri-simulado', SRI_AUTH_DELAY_MS: '0' }), storage as any);
    expect(svc.simulated).toBe(true);
    expect(svc.environment).toBe('1');
    expect(svc.issuer()).toMatchObject({ ruc: '1790012345001', razonSocial: 'CLINICA DENTAL DEMOSTRACION SIGO' });
    const { document } = await svc.emit('inv1', 'cajero');
    expect(document.status).toBe('AUTORIZADO');
    expect(document.authorizedXml).toContain('SIGO-SIMULADO');
    expect(storage.put).not.toHaveBeenCalled(); // los simulados no ocupan el archivo fiscal en S3
    expect(prisma.invoice.update.mock.calls[0][0].data.fiscalData.provider).toBe('sri-simulado');
    prisma.electronicDocument.findUnique.mockResolvedValue({ ...docs.get('d1'), invoice: await prisma.invoice.findUnique() });
    const ride = await svc.getRide('d1');
    expect(ride).toContain('SIMULACIÓN');
    expect(ride).toContain('SIMULADO');
  });
});
