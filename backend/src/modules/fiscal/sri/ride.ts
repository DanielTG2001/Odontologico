import { xmlEscape } from './invoice-xml';

/**
 * RIDE (Representación Impresa del Documento Electrónico) en HTML imprimible.
 * Se entrega al paciente junto con el XML autorizado.
 */
export interface RideData {
  issuer: { razonSocial: string; nombreComercial?: string; ruc: string; dirMatriz: string; dirEstablecimiento?: string; obligadoContabilidad: string; contribuyenteRimpe?: string };
  number: string; // 001-001-000000123
  accessKey: string;
  environment: string;
  authorizationNumber?: string | null;
  authorizationDate?: Date | null;
  status: string;
  /** Comprobante generado en modo simulado (sin validez tributaria) */
  simulated?: boolean;
  issueDate: Date;
  buyer: { name: string; id: string; address?: string | null; email?: string | null };
  lines: { description: string; quantity: number; unitPrice: number; discount: number; total: number }[];
  totals: { subtotal: number; discount: number; vatLines: { label: string; base: number; value: number }[]; total: number };
  payments: { label: string; total: number }[];
}

const m = (n: number) => '$' + n.toFixed(2);
const e = (s: unknown) => xmlEscape(s === undefined || s === null ? '' : String(s));

export function renderRide(d: RideData): string {
  const rows = d.lines
    .map((l) => `<tr><td>${e(l.description)}</td><td class="n">${l.quantity}</td><td class="n">${m(l.unitPrice)}</td><td class="n">${m(l.discount)}</td><td class="n">${m(l.total)}</td></tr>`)
    .join('');
  const vat = d.totals.vatLines.map((v) => `<tr><td>Subtotal ${e(v.label)}</td><td class="n">${m(v.base)}</td></tr><tr><td>IVA ${e(v.label)}</td><td class="n">${m(v.value)}</td></tr>`).join('');
  const pays = d.payments.map((p) => `<tr><td>${e(p.label)}</td><td class="n">${m(p.total)}</td></tr>`).join('');
  const notAuth = d.status !== 'AUTORIZADO';
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Factura ${e(d.number)}</title>
<style>
body{font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#111;margin:24px}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.box{border:1px solid #333;border-radius:8px;padding:12px}
h1{font-size:18px;margin:0 0 4px}h2{font-size:15px;margin:0 0 8px}table{width:100%;border-collapse:collapse;margin-top:12px}
th,td{border:1px solid #999;padding:4px 6px;text-align:left}td.n,th.n{text-align:right}.key{font-family:monospace;font-size:11px;word-break:break-all;letter-spacing:.5px}
.warn{background:#fee2e2;color:#991b1b;padding:8px;border-radius:6px;margin-bottom:12px;font-weight:bold}
.tot{width:45%;margin-left:auto}@media print{.noprint{display:none}}
</style></head><body>
${d.simulated ? `<div class="warn">SIMULACIÓN – Documento de prueba generado sin firma electrónica ni conexión con el SRI. No tiene validez tributaria.</div>` : ''}
${notAuth ? `<div class="warn">Documento ${e(d.status)}: no tiene validez tributaria hasta ser AUTORIZADO por el SRI.</div>` : ''}
<div class="noprint" style="text-align:right"><button onclick="window.print()">Imprimir</button></div>
<div class="grid">
  <div class="box"><h1>${e(d.issuer.nombreComercial || d.issuer.razonSocial)}</h1><div>${e(d.issuer.razonSocial)}</div>
  <div>Dir. matriz: ${e(d.issuer.dirMatriz)}</div>${d.issuer.dirEstablecimiento ? `<div>Dir. establecimiento: ${e(d.issuer.dirEstablecimiento)}</div>` : ''}
  <div>Obligado a llevar contabilidad: ${e(d.issuer.obligadoContabilidad)}</div>${d.issuer.contribuyenteRimpe ? `<div>${e(d.issuer.contribuyenteRimpe)}</div>` : ''}</div>
  <div class="box"><div><b>R.U.C.:</b> ${e(d.issuer.ruc)}</div><h2>FACTURA</h2><div><b>No.</b> ${e(d.number)}</div>
  <div><b>Número de autorización:</b></div><div class="key">${e(d.authorizationNumber || '—')}</div>
  <div><b>Fecha y hora de autorización:</b> ${d.authorizationDate ? e(d.authorizationDate.toLocaleString('es-EC', { timeZone: 'America/Guayaquil' })) : '—'}</div>
  <div><b>Ambiente:</b> ${d.simulated ? 'SIMULADO' : d.environment === '2' ? 'PRODUCCIÓN' : 'PRUEBAS'} · <b>Emisión:</b> NORMAL</div>
  <div><b>Clave de acceso:</b></div><div class="key">${e(d.accessKey)}</div></div>
</div>
<div class="box" style="margin-top:12px">
  <div><b>Razón social / Nombres:</b> ${e(d.buyer.name)} &nbsp; <b>Identificación:</b> ${e(d.buyer.id)}</div>
  <div><b>Fecha de emisión:</b> ${e(d.issueDate.toLocaleDateString('es-EC', { timeZone: 'America/Guayaquil' }))}${d.buyer.address ? ` &nbsp; <b>Dirección:</b> ${e(d.buyer.address)}` : ''}</div>
</div>
<table><thead><tr><th>Descripción</th><th class="n">Cant.</th><th class="n">P. unitario</th><th class="n">Descuento</th><th class="n">Total</th></tr></thead><tbody>${rows}</tbody></table>
<div class="grid" style="margin-top:12px">
  <div><table><thead><tr><th>Forma de pago</th><th class="n">Valor</th></tr></thead><tbody>${pays}</tbody></table>
  ${d.buyer.email ? `<p>Información adicional · Email: ${e(d.buyer.email)}</p>` : ''}</div>
  <table class="tot"><tbody>${vat}<tr><td>Subtotal sin impuestos</td><td class="n">${m(d.totals.subtotal)}</td></tr>
  <tr><td>Total descuento</td><td class="n">${m(d.totals.discount)}</td></tr><tr><td><b>VALOR TOTAL</b></td><td class="n"><b>${m(d.totals.total)}</b></td></tr></tbody></table>
</div></body></html>`;
}
