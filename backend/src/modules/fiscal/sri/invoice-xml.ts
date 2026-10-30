/**
 * Generación del XML de factura electrónica (codDoc 01, versión 1.1.0) para el SRI.
 * Esquema: infoTributaria · infoFactura · detalles · infoAdicional.
 */

export interface Issuer {
  ruc: string;
  razonSocial: string;
  nombreComercial?: string;
  dirMatriz: string;
  dirEstablecimiento?: string;
  estab: string;
  ptoEmi: string;
  obligadoContabilidad: 'SI' | 'NO';
  contribuyenteEspecial?: string;
  /** Leyenda RIMPE: "CONTRIBUYENTE RÉGIMEN RIMPE" o "CONTRIBUYENTE NEGOCIO POPULAR - RÉGIMEN RIMPE" */
  contribuyenteRimpe?: string;
  agenteRetencion?: string;
}

export interface Buyer {
  idType: '04' | '05' | '06' | '07' | '08';
  id: string;
  name: string;
  address?: string;
  email?: string;
  phone?: string;
}

/** IVA: código 2. codigoPorcentaje 0 = 0 % (servicios de salud), 4 = 15 %, 5 = 5 %, 6 = no objeto, 7 = exento */
export interface VatRate {
  codigoPorcentaje: string;
  tarifa: number; // %
}

export interface InvoiceLine {
  code: string;
  description: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  vat: VatRate;
}

export interface PaymentLine {
  formaPago: string; // 01 efectivo, 16 débito, 19 crédito, 20 otros con sistema financiero
  total: number;
  plazo?: number;
  unidadTiempo?: string;
}

export interface FacturaInput {
  environment: '1' | '2';
  accessKey: string;
  sequential: string;
  issueDate: Date;
  issuer: Issuer;
  buyer: Buyer;
  lines: InvoiceLine[];
  payments: PaymentLine[];
  additional?: Record<string, string | undefined>;
}

export interface FacturaTotals {
  totalSinImpuestos: number;
  totalDescuento: number;
  impuestos: { codigoPorcentaje: string; tarifa: number; baseImponible: number; valor: number }[];
  importeTotal: number;
}

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const money = (n: number) => round2(n).toFixed(2);
const qty = (n: number) => (Number.isInteger(n) ? n.toFixed(2) : round2(n).toFixed(6).replace(/0+$/, '').replace(/\.$/, '.00'));

export function xmlEscape(s: string | undefined | null): string {
  return String(s ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
    .trim();
}

function lineBase(l: InvoiceLine) {
  return round2(l.quantity * l.unitPrice - l.discount);
}

export function computeTotals(lines: InvoiceLine[]): FacturaTotals {
  const byRate = new Map<string, { codigoPorcentaje: string; tarifa: number; baseImponible: number; valor: number }>();
  let totalSinImpuestos = 0;
  let totalDescuento = 0;
  for (const l of lines) {
    const base = lineBase(l);
    totalSinImpuestos += base;
    totalDescuento += l.discount;
    const key = l.vat.codigoPorcentaje;
    const acc = byRate.get(key) || { codigoPorcentaje: key, tarifa: l.vat.tarifa, baseImponible: 0, valor: 0 };
    acc.baseImponible = round2(acc.baseImponible + base);
    acc.valor = round2(acc.valor + (base * l.vat.tarifa) / 100);
    byRate.set(key, acc);
  }
  const impuestos = [...byRate.values()];
  const totalIva = impuestos.reduce((s, i) => s + i.valor, 0);
  return {
    totalSinImpuestos: round2(totalSinImpuestos),
    totalDescuento: round2(totalDescuento),
    impuestos,
    importeTotal: round2(totalSinImpuestos + totalIva),
  };
}

const el = (name: string, value: string | undefined | null) =>
  value === undefined || value === null || value === '' ? '' : `<${name}>${xmlEscape(value)}</${name}>`;

export function buildFacturaXml(f: FacturaInput): { xml: string; totals: FacturaTotals } {
  if (!f.lines.length) throw new Error('La factura debe tener al menos un detalle');
  const t = computeTotals(f.lines);
  const paid = round2(f.payments.reduce((s, p) => s + p.total, 0));
  if (Math.abs(paid - t.importeTotal) > 0.009) {
    throw new Error(`La suma de pagos (${money(paid)}) no coincide con el importe total (${money(t.importeTotal)})`);
  }
  const { issuer: i, buyer: b } = f;

  const infoTributaria =
    '<infoTributaria>' +
    el('ambiente', f.environment) +
    el('tipoEmision', '1') +
    el('razonSocial', i.razonSocial) +
    el('nombreComercial', i.nombreComercial) +
    el('ruc', i.ruc) +
    el('claveAcceso', f.accessKey) +
    el('codDoc', '01') +
    el('estab', i.estab) +
    el('ptoEmi', i.ptoEmi) +
    el('secuencial', f.sequential) +
    el('dirMatriz', i.dirMatriz) +
    el('agenteRetencion', i.agenteRetencion) +
    el('contribuyenteRimpe', i.contribuyenteRimpe) +
    '</infoTributaria>';

  const totalConImpuestos =
    '<totalConImpuestos>' +
    t.impuestos
      .map(
        (x) =>
          '<totalImpuesto>' +
          el('codigo', '2') +
          el('codigoPorcentaje', x.codigoPorcentaje) +
          el('baseImponible', money(x.baseImponible)) +
          el('valor', money(x.valor)) +
          '</totalImpuesto>',
      )
      .join('') +
    '</totalConImpuestos>';

  const pagos =
    '<pagos>' +
    f.payments
      .map(
        (p) =>
          '<pago>' +
          el('formaPago', p.formaPago) +
          el('total', money(p.total)) +
          (p.plazo ? el('plazo', String(p.plazo)) + el('unidadTiempo', p.unidadTiempo || 'dias') : '') +
          '</pago>',
      )
      .join('') +
    '</pagos>';

  const d = f.issueDate;
  const ec = new Date(d.getTime() - 5 * 3600 * 1000);
  const fecha = `${String(ec.getUTCDate()).padStart(2, '0')}/${String(ec.getUTCMonth() + 1).padStart(2, '0')}/${ec.getUTCFullYear()}`;

  const infoFactura =
    '<infoFactura>' +
    el('fechaEmision', fecha) +
    el('dirEstablecimiento', i.dirEstablecimiento || i.dirMatriz) +
    el('contribuyenteEspecial', i.contribuyenteEspecial) +
    el('obligadoContabilidad', i.obligadoContabilidad) +
    el('tipoIdentificacionComprador', b.idType) +
    el('razonSocialComprador', b.name) +
    el('identificacionComprador', b.id) +
    el('direccionComprador', b.address) +
    el('totalSinImpuestos', money(t.totalSinImpuestos)) +
    el('totalDescuento', money(t.totalDescuento)) +
    totalConImpuestos +
    el('propina', '0.00') +
    el('importeTotal', money(t.importeTotal)) +
    el('moneda', 'DOLAR') +
    pagos +
    '</infoFactura>';

  const detalles =
    '<detalles>' +
    f.lines
      .map((l) => {
        const base = lineBase(l);
        return (
          '<detalle>' +
          el('codigoPrincipal', l.code.slice(0, 25)) +
          el('descripcion', l.description.slice(0, 300)) +
          el('cantidad', qty(l.quantity)) +
          el('precioUnitario', qty(l.unitPrice)) +
          el('descuento', money(l.discount)) +
          el('precioTotalSinImpuesto', money(base)) +
          '<impuestos><impuesto>' +
          el('codigo', '2') +
          el('codigoPorcentaje', l.vat.codigoPorcentaje) +
          el('tarifa', String(l.vat.tarifa)) +
          el('baseImponible', money(base)) +
          el('valor', money((base * l.vat.tarifa) / 100)) +
          '</impuesto></impuestos>' +
          '</detalle>'
        );
      })
      .join('') +
    '</detalles>';

  const extras = Object.entries({ Email: b.email, Teléfono: b.phone, ...(f.additional || {}) }).filter(([, v]) => v);
  const infoAdicional = extras.length
    ? '<infoAdicional>' + extras.map(([k, v]) => `<campoAdicional nombre="${xmlEscape(k)}">${xmlEscape(v)}</campoAdicional>`).join('') + '</infoAdicional>'
    : '';

  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<factura id="comprobante" version="1.1.0">' +
    infoTributaria +
    infoFactura +
    detalles +
    infoAdicional +
    '</factura>';

  return { xml, totals: t };
}

/** Mapea el tipo de documento del paciente al código de identificación del SRI. */
export function buyerIdType(documentType: string, documentNumber: string): Buyer['idType'] {
  const t = (documentType || '').toUpperCase();
  if (documentNumber === '9999999999999') return '07'; // consumidor final
  if (t.includes('RUC') || /^\d{13}$/.test(documentNumber)) return '04';
  if (t === 'CI' || t.includes('CED') || t.includes('CÉD')) return '05';
  if (t.includes('PAS')) return '06';
  return '08';
}

/** Mapea el método de pago interno a la forma de pago del SRI (tabla 24). */
export function formaPago(method: string): string {
  switch (method) {
    case 'EFECTIVO':
      return '01';
    case 'TARJETA_DEBITO':
      return '16';
    case 'TARJETA_CREDITO':
      return '19';
    case 'TRANSFERENCIA':
    case 'SEGURO':
    default:
      return '20';
  }
}
