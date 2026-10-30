import { isValidAccessKey } from './access-key';
import { AuthorizationResult, ReceptionResult, SriMessage } from './sri-client';
import { XmlSigner } from './xml-signer';

/**
 * Modo SRI SIMULADO (FISCAL_PROVIDER=sri-simulado).
 * Recorre el mismo flujo que el SRI real (XML 1.1.0, clave de acceso, recepción, autorización,
 * RIDE) pero sin firma electrónica ni conexión: útil para desarrollo, demos y UAT
 * cuando aún no se tiene RUC autorizado ni certificado .p12.
 * Los comprobantes NO tienen validez tributaria.
 */
export const SIMULATED_SIGNATURE_ID = 'SIGO-SIMULADO';

export class SimulatedSigner implements XmlSigner {
  async sign(xml: string): Promise<string> {
    const marker =
      `<ds:Signature xmlns:ds="http://www.w3.org/2000/09/xmldsig#" Id="${SIMULATED_SIGNATURE_ID}">` +
      '<!-- Firma simulada: comprobante sin validez tributaria --></ds:Signature>';
    return xml.replace(/<\/factura>\s*$/, marker + '</factura>');
  }
}

const tag = (xml: string, name: string) => xml.match(new RegExp(`<${name}>([^<]*)</${name}>`))?.[1];
const all = (xml: string, re: RegExp) => [...xml.matchAll(re)].map((m) => m[1]);

/** Validaciones equivalentes a las de recepción del SRI (las más comunes). */
export function validateLikeSri(xml: string): SriMessage[] {
  const errors: SriMessage[] = [];
  const err = (identificador: string, mensaje: string, informacionAdicional?: string) =>
    errors.push({ identificador, mensaje, informacionAdicional, tipo: 'ERROR' });

  if (!xml.includes('<factura id="comprobante"')) err('35', 'ARCHIVO NO CUMPLE ESTRUCTURA XML', 'Falta el nodo factura id="comprobante"');
  if (!xml.includes('<ds:Signature')) err('39', 'FIRMA INVALIDA', 'El comprobante no está firmado');
  for (const t of ['ambiente', 'ruc', 'razonSocial', 'claveAcceso', 'estab', 'ptoEmi', 'secuencial', 'dirMatriz', 'fechaEmision', 'tipoIdentificacionComprador', 'identificacionComprador', 'razonSocialComprador', 'importeTotal']) {
    if (!tag(xml, t)) err('35', 'ARCHIVO NO CUMPLE ESTRUCTURA XML', `Falta el campo obligatorio ${t}`);
  }
  const key = tag(xml, 'claveAcceso');
  if (key && !isValidAccessKey(key)) err('70', 'CLAVE DE ACCESO EN PROCESAMIENTO', 'La clave de acceso no es válida (dígito verificador)');
  const total = Number(tag(xml, 'importeTotal') || 0);
  const pagosBlock = xml.match(/<pagos>([\s\S]*?)<\/pagos>/)?.[1] || '';
  const pagos = all(pagosBlock, /<total>([^<]*)<\/total>/g).reduce((s, v) => s + Number(v), 0);
  if (Math.abs(pagos - total) > 0.01) err('52', 'ERROR EN DIFERENCIAS', `La suma de pagos (${pagos.toFixed(2)}) difiere del importe total (${total.toFixed(2)})`);
  if (tag(xml, 'tipoIdentificacionComprador') === '07' && total > 50) {
    err('52', 'ERROR EN DIFERENCIAS', 'Consumidor final: el importe no puede superar USD 50');
  }
  return errors;
}

/** Cliente que imita las respuestas del SRI. Mantiene en memoria lo recibido. */
export class SimulatedSriClient {
  private received = new Map<string, string>();

  async send(signedXml: string): Promise<ReceptionResult> {
    const key = tag(signedXml, 'claveAcceso') || '';
    if (this.received.has(key)) {
      return { estado: 'DEVUELTA', mensajes: [{ identificador: '43', mensaje: 'CLAVE ACCESO REGISTRADA', tipo: 'ERROR' }] };
    }
    const errors = validateLikeSri(signedXml);
    if (errors.length) return { estado: 'DEVUELTA', mensajes: errors };
    this.received.set(key, signedXml);
    return { estado: 'RECIBIDA', mensajes: [] };
  }

  /** Sin estado: funciona aunque la API se reinicie o haya varias réplicas */
  async authorize(accessKey: string): Promise<AuthorizationResult> {
    if (!isValidAccessKey(accessKey)) return { estado: 'NO AUTORIZADO', mensajes: [{ identificador: '70', mensaje: 'CLAVE DE ACCESO INVALIDA', tipo: 'ERROR' }] };
    const xml = this.received.get(accessKey);
    return {
      estado: 'AUTORIZADO',
      numeroAutorizacion: accessKey,
      fechaAutorizacion: new Date().toISOString(),
      ambiente: 'SIMULADO',
      comprobante: xml, // si no está en memoria, el servicio usa el XML firmado guardado
      mensajes: [{ identificador: '60', mensaje: 'ESTE PROCESO FUE REALIZADO EN MODO SIMULADO', tipo: 'INFORMATIVO' }],
    };
  }
}
