/**
 * Cliente SOAP de los web services "offline" del SRI.
 *  - RecepcionComprobantesOffline → validarComprobante(xml base64)
 *  - AutorizacionComprobantesOffline → autorizacionComprobante(claveAccesoComprobante)
 * Sin dependencias: usa fetch nativo de Node ≥ 18 y parseo por expresiones regulares
 * de la respuesta (estructura fija y documentada por el SRI).
 */

export const SRI_URLS = {
  '1': {
    reception: 'https://celcer.sri.gob.ec/comprobantes-electronicos-ws/RecepcionComprobantesOffline',
    authorization: 'https://celcer.sri.gob.ec/comprobantes-electronicos-ws/AutorizacionComprobantesOffline',
  },
  '2': {
    reception: 'https://cel.sri.gob.ec/comprobantes-electronicos-ws/RecepcionComprobantesOffline',
    authorization: 'https://cel.sri.gob.ec/comprobantes-electronicos-ws/AutorizacionComprobantesOffline',
  },
} as const;

export interface SriMessage {
  identificador?: string;
  mensaje: string;
  informacionAdicional?: string;
  tipo?: string; // ERROR | ADVERTENCIA | INFORMATIVO
}

export interface ReceptionResult {
  estado: 'RECIBIDA' | 'DEVUELTA' | string;
  mensajes: SriMessage[];
}

export interface AuthorizationResult {
  estado: 'AUTORIZADO' | 'NO AUTORIZADO' | 'EN PROCESAMIENTO' | 'SIN_RESPUESTA' | string;
  numeroAutorizacion?: string;
  fechaAutorizacion?: string;
  ambiente?: string;
  comprobante?: string;
  mensajes: SriMessage[];
}

export class SriNetworkError extends Error {}

type FetchLike = (url: string, init: any) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

const tag = (xml: string, name: string): string | undefined => {
  const m = xml.match(new RegExp(`<(?:\\w+:)?${name}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:\\w+:)?${name}>`));
  return m ? m[1].trim() : undefined;
};

const decodeEntities = (s: string) =>
  s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

const unwrapCdata = (s?: string) => {
  if (!s) return s;
  const m = s.match(/^<!\[CDATA\[([\s\S]*)\]\]>$/);
  return m ? m[1] : decodeEntities(s);
};

export function parseMessages(xml: string): SriMessage[] {
  // <mensajes><mensaje><identificador/><mensaje>texto</mensaje><informacionAdicional/><tipo/></mensaje>…</mensajes>
  return xml
    .split(/<(?:\w+:)?identificador>/)
    .slice(1)
    .map((part) => {
      const chunk = '<identificador>' + part.split(/<\/(?:\w+:)?mensajes>/)[0];
      const info = tag(chunk, 'informacionAdicional');
      return {
        identificador: tag(chunk, 'identificador'),
        mensaje: decodeEntities(tag(chunk, 'mensaje') || ''),
        informacionAdicional: info ? decodeEntities(info) : undefined,
        tipo: tag(chunk, 'tipo'),
      };
    });
}

export function parseReception(xml: string): ReceptionResult {
  const fault = tag(xml, 'faultstring');
  if (fault) return { estado: 'DEVUELTA', mensajes: [{ mensaje: fault, tipo: 'ERROR' }] };
  return { estado: tag(xml, 'estado') || 'DESCONOCIDO', mensajes: parseMessages(xml) };
}

export function parseAuthorization(xml: string): AuthorizationResult {
  const count = Number(tag(xml, 'numeroComprobantes') || '0');
  const auth = tag(xml, 'autorizacion');
  if (!auth || count === 0) return { estado: 'SIN_RESPUESTA', mensajes: [] };
  return {
    estado: tag(auth, 'estado') || 'DESCONOCIDO',
    numeroAutorizacion: tag(auth, 'numeroAutorizacion'),
    fechaAutorizacion: tag(auth, 'fechaAutorizacion'),
    ambiente: tag(auth, 'ambiente'),
    comprobante: unwrapCdata(tag(auth, 'comprobante')),
    mensajes: parseMessages(auth),
  };
}

export class SriClient {
  constructor(
    private readonly urls: { reception: string; authorization: string },
    private readonly fetchImpl: FetchLike = (globalThis as any).fetch,
    private readonly timeoutMs = 20000,
  ) {}

  private async post(url: string, envelope: string): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await this.fetchImpl(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: '' },
        body: envelope,
        signal: controller.signal,
      });
      const text = await res.text();
      if (!res.ok && !text.includes('Envelope')) throw new SriNetworkError(`SRI respondió HTTP ${res.status}`);
      return text;
    } catch (err: any) {
      if (err instanceof SriNetworkError) throw err;
      throw new SriNetworkError(err?.name === 'AbortError' ? 'Tiempo de espera agotado con el SRI' : `Sin conexión con el SRI: ${err?.message}`);
    } finally {
      clearTimeout(timer);
    }
  }

  async send(signedXml: string): Promise<ReceptionResult> {
    const b64 = Buffer.from(signedXml, 'utf8').toString('base64');
    const envelope =
      '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ec="http://ec.gob.sri.ws.recepcion">' +
      '<soapenv:Header/><soapenv:Body><ec:validarComprobante><xml>' + b64 + '</xml></ec:validarComprobante></soapenv:Body></soapenv:Envelope>';
    return parseReception(await this.post(this.urls.reception, envelope));
  }

  async authorize(accessKey: string): Promise<AuthorizationResult> {
    const envelope =
      '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ec="http://ec.gob.sri.ws.autorizacion">' +
      '<soapenv:Header/><soapenv:Body><ec:autorizacionComprobante><claveAccesoComprobante>' + accessKey +
      '</claveAccesoComprobante></ec:autorizacionComprobante></soapenv:Body></soapenv:Envelope>';
    return parseAuthorization(await this.post(this.urls.authorization, envelope));
  }
}
