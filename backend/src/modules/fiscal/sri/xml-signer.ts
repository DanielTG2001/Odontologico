import { readFileSync } from 'fs';

/**
 * Firma XAdES-BES exigida por el SRI. Se delega en la librería `open-factura`
 * (usa node-forge para leer el certificado .p12 de Security Data, BCE, Uanataca, etc.).
 * Interfaz separada para poder sustituirla en pruebas o por otra implementación.
 */
export interface XmlSigner {
  sign(xml: string): Promise<string>;
}

export interface CertificateConfig {
  /** Ruta al .p12 (SRI_CERT_PATH) o contenido en base64 (SRI_CERT_BASE64) */
  path?: string;
  base64?: string;
  password: string;
}

// open-factura se publica como CommonJS: carga diferida con require (sin eval / new Function)
const loadOpenFactura = async () => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('open-factura');
  } catch {
    throw new Error('Instale la dependencia de firma: npm install open-factura');
  }
};

export class OpenFacturaSigner implements XmlSigner {
  private p12?: ArrayBuffer;

  constructor(
    private readonly cert: CertificateConfig,
    private readonly loader: () => Promise<any> = loadOpenFactura,
  ) {}

  private certificate(): ArrayBuffer {
    if (this.p12) return this.p12;
    let buf: Buffer;
    if (this.cert.base64) buf = Buffer.from(this.cert.base64, 'base64');
    else if (this.cert.path) buf = readFileSync(this.cert.path);
    else throw new Error('Configure SRI_CERT_PATH o SRI_CERT_BASE64 con la firma electrónica (.p12)');
    this.p12 = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
    return this.p12;
  }

  async sign(xml: string): Promise<string> {
    const lib = await this.loader();
    const signXml = lib.signXml ?? lib.default?.signXml;
    if (typeof signXml !== 'function') throw new Error('No se encontró signXml en open-factura');
    const signed: string = await signXml(this.certificate(), this.cert.password, xml);
    if (!signed || !signed.includes('Signature')) throw new Error('La firma XAdES no se generó');
    return signed;
  }
}
