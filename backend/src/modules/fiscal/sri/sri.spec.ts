import { buildAccessKey, ecuadorDate, isValidAccessKey, isValidCedula, isValidRuc, mod11 } from './access-key';
import { buildFacturaXml, buyerIdType, computeTotals, formaPago, xmlEscape } from './invoice-xml';
import { parseAuthorization, parseReception, SriClient, SriNetworkError } from './sri-client';
import { OpenFacturaSigner } from './xml-signer';
import { renderRide } from './ride';

describe('Clave de acceso SRI', () => {
  it('valida el ejemplo oficial de la ficha técnica (módulo 11)', () => {
    const official = '2110201101179214673900110020010000000011234567813';
    expect(mod11(official.slice(0, 48))).toBe(3);
    expect(isValidAccessKey(official)).toBe(true);
    expect(isValidAccessKey(official.slice(0, 48) + '4')).toBe(false);
  });

  it('dígito 11 → 0 y 10 → 1', () => {
    // Se buscan cuerpos cuyo resultado sea 11 y 10
    let found0 = false, found1 = false;
    for (let i = 0; i < 2000 && !(found0 && found1); i++) {
      const body = String(i).padStart(12, '0');
      let sum = 0, f = 2;
      for (let j = body.length - 1; j >= 0; j--) { sum += Number(body[j]) * f; f = f === 7 ? 2 : f + 1; }
      const raw = 11 - (sum % 11);
      if (raw === 11) { expect(mod11(body)).toBe(0); found0 = true; }
      if (raw === 10) { expect(mod11(body)).toBe(1); found1 = true; }
    }
    expect(found0 && found1).toBe(true);
    expect(() => mod11('12a')).toThrow();
  });

  it('arma los 49 dígitos con la fecha de Ecuador (UTC−5)', () => {
    // 2026-10-31 03:00 UTC = 30/10/2026 22:00 en Guayaquil
    const key = buildAccessKey({
      issueDate: new Date('2026-10-31T03:00:00Z'), codDoc: '01', ruc: '1710034065001', environment: '1',
      estab: '001', ptoEmi: '002', sequential: 123, numericCode: '12345678',
    });
    expect(key).toHaveLength(49);
    expect(key.slice(0, 8)).toBe('30102026');
    expect(key.slice(8, 10)).toBe('01');
    expect(key.slice(10, 23)).toBe('1710034065001');
    expect(key.slice(23, 24)).toBe('1');
    expect(key.slice(24, 30)).toBe('001002');
    expect(key.slice(30, 39)).toBe('000000123');
    expect(key.slice(39, 47)).toBe('12345678');
    expect(key.slice(47, 48)).toBe('1');
    expect(isValidAccessKey(key)).toBe(true);
    expect(ecuadorDate(new Date('2026-01-05T12:00:00Z'), '/')).toBe('05/01/2026');
  });

  it('rechaza datos mal formados', () => {
    const base = { issueDate: new Date(), codDoc: '01', ruc: '1710034065001', environment: '1' as const, estab: '001', ptoEmi: '001', sequential: 1, numericCode: '12345678' };
    expect(() => buildAccessKey({ ...base, ruc: '123' })).toThrow('RUC');
    expect(() => buildAccessKey({ ...base, estab: '1' })).toThrow('3 dígitos');
    expect(() => buildAccessKey({ ...base, numericCode: '1' })).toThrow('8 dígitos');
    expect(() => buildAccessKey({ ...base, codDoc: 'X' })).toThrow('comprobante');
    expect(() => buildAccessKey({ ...base, sequential: '1234567890' })).toThrow('mal formada');
  });

  it('cédula y RUC', () => {
    expect(isValidCedula('1710034065')).toBe(true);
    expect(isValidCedula('1710034066')).toBe(false);
    expect(isValidCedula('9910034065')).toBe(false);
    expect(isValidCedula('1790034065')).toBe(false);
    expect(isValidCedula('123')).toBe(false);
    expect(isValidRuc('1710034065001')).toBe(true);
    expect(isValidRuc('1710034066001')).toBe(false);
    expect(isValidRuc('1790012345001')).toBe(true); // sociedad
    expect(isValidRuc('1710034065002')).toBe(false);
  });
});

describe('XML de factura 1.1.0', () => {
  const issuer = { ruc: '1710034065001', razonSocial: 'CLÍNICA DENTAL & ASOC.', nombreComercial: 'Sonrisas', dirMatriz: 'Av. Amazonas <N34>', estab: '001', ptoEmi: '001', obligadoContabilidad: 'NO' as const, contribuyenteRimpe: 'CONTRIBUYENTE RÉGIMEN RIMPE' };
  const vat0 = { codigoPorcentaje: '0', tarifa: 0 };
  const vat15 = { codigoPorcentaje: '4', tarifa: 15 };

  it('totales con descuento e IVA mixto', () => {
    const t = computeTotals([
      { code: 'A', description: 'Resina', quantity: 2, unitPrice: 40, discount: 10, vat: vat0 },
      { code: 'B', description: 'Kit blanqueamiento', quantity: 1, unitPrice: 100, discount: 0, vat: vat15 },
    ]);
    expect(t).toMatchObject({ totalSinImpuestos: 170, totalDescuento: 10, importeTotal: 185 });
    expect(t.impuestos).toEqual([
      { codigoPorcentaje: '0', tarifa: 0, baseImponible: 70, valor: 0 },
      { codigoPorcentaje: '4', tarifa: 15, baseImponible: 100, valor: 15 },
    ]);
  });

  it('genera el XML con la estructura del SRI y escapa caracteres', () => {
    const { xml, totals } = buildFacturaXml({
      environment: '1', accessKey: '1'.repeat(49), sequential: '000000001', issueDate: new Date('2026-10-30T15:00:00Z'), issuer,
      buyer: { idType: '05', id: '1710034065', name: 'ANA PAZ', email: 'ana@x.com', phone: '0999' },
      lines: [{ code: 'SRV001', description: 'Endodoncia "molar"', quantity: 1, unitPrice: 150, discount: 0, vat: vat0 }],
      payments: [{ formaPago: '19', total: 100 }, { formaPago: '20', total: 50, plazo: 30, unidadTiempo: 'dias' }],
      additional: { 'Factura interna': 'FAC-000001', Vacío: undefined },
    });
    expect(totals.importeTotal).toBe(150);
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?><factura id="comprobante" version="1.1.0">')).toBe(true);
    for (const frag of [
      '<ambiente>1</ambiente>', '<tipoEmision>1</tipoEmision>', '<codDoc>01</codDoc>', '<secuencial>000000001</secuencial>',
      '<fechaEmision>30/10/2026</fechaEmision>', '<obligadoContabilidad>NO</obligadoContabilidad>',
      '<tipoIdentificacionComprador>05</tipoIdentificacionComprador>', '<identificacionComprador>1710034065</identificacionComprador>',
      '<importeTotal>150.00</importeTotal>', '<moneda>DOLAR</moneda>', '<formaPago>19</formaPago>', '<plazo>30</plazo>',
      '<cantidad>1.00</cantidad>', '<precioUnitario>150.00</precioUnitario>', '<tarifa>0</tarifa>',
      '<razonSocial>CLÍNICA DENTAL &amp; ASOC.</razonSocial>', '<dirMatriz>Av. Amazonas &lt;N34&gt;</dirMatriz>',
      '<descripcion>Endodoncia &quot;molar&quot;</descripcion>', '<contribuyenteRimpe>CONTRIBUYENTE RÉGIMEN RIMPE</contribuyenteRimpe>',
      '<campoAdicional nombre="Email">ana@x.com</campoAdicional>', '<campoAdicional nombre="Factura interna">FAC-000001</campoAdicional>',
    ]) expect(xml).toContain(frag);
    expect(xml).not.toContain('Vacío');
    expect(xml).not.toContain('<direccionComprador>');
  });

  it('cantidades fraccionarias y validaciones', () => {
    const { xml } = buildFacturaXml({
      environment: '2', accessKey: '1'.repeat(49), sequential: '000000002', issueDate: new Date(), issuer,
      buyer: { idType: '06', id: 'P123', name: 'X' },
      lines: [{ code: 'A', description: 'Material', quantity: 1.5, unitPrice: 10, discount: 0, vat: vat0 }],
      payments: [{ formaPago: '01', total: 15 }],
    });
    expect(xml).toContain('<cantidad>1.5</cantidad>');
    expect(xml).not.toContain('<infoAdicional>');
    expect(() => buildFacturaXml({ environment: '1', accessKey: 'x', sequential: '1', issueDate: new Date(), issuer, buyer: { idType: '05', id: '1', name: 'x' }, lines: [], payments: [] })).toThrow('al menos un detalle');
    expect(() => buildFacturaXml({ environment: '1', accessKey: 'x', sequential: '1', issueDate: new Date(), issuer, buyer: { idType: '05', id: '1', name: 'x' }, lines: [{ code: 'A', description: 'a', quantity: 1, unitPrice: 10, discount: 0, vat: vat0 }], payments: [{ formaPago: '01', total: 9 }] })).toThrow('no coincide');
    expect(xmlEscape("a'b\u0001")).toBe('a&apos;b');
    expect(xmlEscape(null)).toBe('');
  });

  it('tipos de identificación y formas de pago', () => {
    expect(buyerIdType('RUC', '1710034065001')).toBe('04');
    expect(buyerIdType('CI', '1710034065')).toBe('05');
    expect(buyerIdType('Cédula', '1710034065')).toBe('05');
    expect(buyerIdType('Pasaporte', 'A123')).toBe('06');
    expect(buyerIdType('', '9999999999999')).toBe('07');
    expect(buyerIdType('', '1710034065001')).toBe('04');
    expect(buyerIdType('CF', '9999999999')).toBe('08');
    expect(formaPago('EFECTIVO')).toBe('01');
    expect(formaPago('TARJETA_DEBITO')).toBe('16');
    expect(formaPago('TARJETA_CREDITO')).toBe('19');
    expect(formaPago('TRANSFERENCIA')).toBe('20');
    expect(formaPago('SEGURO')).toBe('20');
  });
});

const RECIBIDA = `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><ns2:validarComprobanteResponse xmlns:ns2="http://ec.gob.sri.ws.recepcion"><RespuestaRecepcionComprobante><estado>RECIBIDA</estado><comprobantes/></RespuestaRecepcionComprobante></ns2:validarComprobanteResponse></soap:Body></soap:Envelope>`;
const DEVUELTA = `<soap:Envelope><soap:Body><ns2:validarComprobanteResponse><RespuestaRecepcionComprobante><estado>DEVUELTA</estado><comprobantes><comprobante><claveAcceso>123</claveAcceso><mensajes><mensaje><identificador>35</identificador><mensaje>ARCHIVO NO CUMPLE ESTRUCTURA XML</mensaje><informacionAdicional>Se encontró &lt;x&gt;</informacionAdicional><tipo>ERROR</tipo></mensaje><mensaje><identificador>43</identificador><mensaje>CLAVE ACCESO REGISTRADA</mensaje><tipo>ERROR</tipo></mensaje></mensajes></comprobante></comprobantes></RespuestaRecepcionComprobante></ns2:validarComprobanteResponse></soap:Body></soap:Envelope>`;
const AUTORIZADO = `<soap:Envelope><soap:Body><ns2:autorizacionComprobanteResponse><RespuestaAutorizacionComprobante><claveAccesoConsultada>123</claveAccesoConsultada><numeroComprobantes>1</numeroComprobantes><autorizaciones><autorizacion><estado>AUTORIZADO</estado><numeroAutorizacion>3010202601171003406500110010010000000011234567811</numeroAutorizacion><fechaAutorizacion>2026-10-30T10:15:22-05:00</fechaAutorizacion><ambiente>PRUEBAS</ambiente><comprobante><![CDATA[<?xml version="1.0"?><factura id="comprobante"><x/></factura>]]></comprobante><mensajes/></autorizacion></autorizaciones></RespuestaAutorizacionComprobante></ns2:autorizacionComprobanteResponse></soap:Body></soap:Envelope>`;
const NO_AUT = `<RespuestaAutorizacionComprobante><numeroComprobantes>1</numeroComprobantes><autorizaciones><autorizacion><estado>NO AUTORIZADO</estado><fechaAutorizacion>2026-10-30</fechaAutorizacion><comprobante>&lt;factura/&gt;</comprobante><mensajes><mensaje><identificador>39</identificador><mensaje>FIRMA INVALIDA</mensaje><tipo>ERROR</tipo></mensaje></mensajes></autorizacion></autorizaciones></RespuestaAutorizacionComprobante>`;

describe('Cliente SOAP del SRI', () => {
  it('interpreta recepción RECIBIDA y DEVUELTA con mensajes', () => {
    expect(parseReception(RECIBIDA)).toEqual({ estado: 'RECIBIDA', mensajes: [] });
    const dev = parseReception(DEVUELTA);
    expect(dev.estado).toBe('DEVUELTA');
    expect(dev.mensajes).toEqual([
      { identificador: '35', mensaje: 'ARCHIVO NO CUMPLE ESTRUCTURA XML', informacionAdicional: 'Se encontró <x>', tipo: 'ERROR' },
      { identificador: '43', mensaje: 'CLAVE ACCESO REGISTRADA', informacionAdicional: undefined, tipo: 'ERROR' },
    ]);
    expect(parseReception('<faultstring>Error interno</faultstring>')).toMatchObject({ estado: 'DEVUELTA', mensajes: [{ mensaje: 'Error interno' }] });
  });

  it('interpreta autorización', () => {
    const a = parseAuthorization(AUTORIZADO);
    expect(a).toMatchObject({ estado: 'AUTORIZADO', numeroAutorizacion: '3010202601171003406500110010010000000011234567811', ambiente: 'PRUEBAS' });
    expect(a.comprobante).toBe('<?xml version="1.0"?><factura id="comprobante"><x/></factura>');
    const n = parseAuthorization(NO_AUT);
    expect(n.estado).toBe('NO AUTORIZADO');
    expect(n.comprobante).toBe('<factura/>');
    expect(n.mensajes[0].mensaje).toBe('FIRMA INVALIDA');
    expect(parseAuthorization('<numeroComprobantes>0</numeroComprobantes>').estado).toBe('SIN_RESPUESTA');
  });

  it('envía el XML en base64 dentro del sobre SOAP', async () => {
    const fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, text: async () => RECIBIDA });
    const c = new SriClient({ reception: 'https://r', authorization: 'https://a' }, fetch);
    await expect(c.send('<factura/>')).resolves.toMatchObject({ estado: 'RECIBIDA' });
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('https://r');
    expect(init.body).toContain('<ec:validarComprobante><xml>' + Buffer.from('<factura/>').toString('base64') + '</xml>');
    fetch.mockResolvedValue({ ok: true, status: 200, text: async () => AUTORIZADO });
    await c.authorize('123');
    expect(fetch.mock.calls[1][1].body).toContain('<claveAccesoComprobante>123</claveAccesoComprobante>');
  });

  it('errores de red → SriNetworkError (para reintentar)', async () => {
    const c1 = new SriClient({ reception: 'r', authorization: 'a' }, jest.fn().mockRejectedValue(new Error('ECONNRESET')));
    await expect(c1.send('x')).rejects.toThrow(SriNetworkError);
    const c2 = new SriClient({ reception: 'r', authorization: 'a' }, jest.fn().mockResolvedValue({ ok: false, status: 503, text: async () => 'Service Unavailable' }));
    await expect(c2.send('x')).rejects.toThrow('HTTP 503');
    const abort = Object.assign(new Error('aborted'), { name: 'AbortError' });
    const c3 = new SriClient({ reception: 'r', authorization: 'a' }, jest.fn().mockRejectedValue(abort));
    await expect(c3.authorize('1')).rejects.toThrow('Tiempo de espera');
  });
});

describe('Firma XAdES (open-factura)', () => {
  it('firma con el certificado en base64 y lo cachea', async () => {
    const signXml = jest.fn().mockResolvedValue('<factura><ds:Signature/></factura>');
    const signer = new OpenFacturaSigner({ base64: Buffer.from('p12').toString('base64'), password: 'clave' }, async () => ({ signXml }));
    await expect(signer.sign('<factura/>')).resolves.toContain('Signature');
    await signer.sign('<factura/>');
    const [cert, pass, xml] = signXml.mock.calls[0];
    expect(Buffer.from(cert).toString()).toBe('p12');
    expect(pass).toBe('clave');
    expect(xml).toBe('<factura/>');
  });

  it('errores claros', async () => {
    await expect(new OpenFacturaSigner({ password: 'x' }, async () => ({ signXml: jest.fn() })).sign('x')).rejects.toThrow('SRI_CERT_PATH');
    await expect(new OpenFacturaSigner({ base64: 'AA==', password: 'x' }, async () => ({})).sign('x')).rejects.toThrow('signXml');
    await expect(new OpenFacturaSigner({ base64: 'AA==', password: 'x' }, async () => ({ default: { signXml: async () => '<x/>' } })).sign('x')).rejects.toThrow('no se generó');
    await expect(new OpenFacturaSigner({ path: '/no/existe.p12', password: 'x' }, async () => ({ signXml: jest.fn() })).sign('x')).rejects.toThrow();
  });
});

describe('RIDE', () => {
  it('muestra datos clave y advierte si no está autorizado', () => {
    const base = {
      issuer: { razonSocial: 'CLÍNICA', ruc: '1710034065001', dirMatriz: 'Quito', obligadoContabilidad: 'NO' },
      number: '001-001-000000001', accessKey: '1'.repeat(49), environment: '1', status: 'RECIBIDA', issueDate: new Date('2026-10-30T15:00:00Z'),
      buyer: { name: 'ANA <PAZ>', id: '1710034065', email: 'a@b.c' },
      lines: [{ description: 'Resina', quantity: 1, unitPrice: 40, discount: 0, total: 40 }],
      totals: { subtotal: 40, discount: 0, vatLines: [{ label: '0%', base: 40, value: 0 }], total: 40 },
      payments: [{ label: 'Tarjeta de crédito', total: 40 }],
    };
    const html = renderRide(base);
    expect(html).toContain('no tiene validez tributaria');
    expect(html).toContain('ANA &lt;PAZ&gt;');
    expect(html).toContain('PRUEBAS');
    const ok = renderRide({ ...base, status: 'AUTORIZADO', environment: '2', authorizationNumber: '123', authorizationDate: new Date(), issuer: { ...base.issuer, nombreComercial: 'Sonrisas', dirEstablecimiento: 'Sucursal', contribuyenteRimpe: 'RIMPE' }, buyer: { ...base.buyer, address: 'Av. 1' } });
    expect(ok).not.toContain('validez');
    expect(ok).toContain('PRODUCCIÓN');
    expect(ok).toContain('$40.00');
  });
});
