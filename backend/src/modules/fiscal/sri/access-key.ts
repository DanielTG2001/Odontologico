/**
 * Clave de acceso del SRI (49 dígitos) – Ficha técnica de comprobantes electrónicos.
 *
 *  fecha(ddmmaaaa,8) + tipoComprobante(2) + RUC(13) + ambiente(1) + serie(estab 3 + ptoEmi 3)
 *  + secuencial(9) + código numérico(8) + tipoEmisión(1) + dígito verificador módulo 11 (1)
 */

/** Dígito verificador módulo 11 con pesos 2..7 de derecha a izquierda (11 → 0, 10 → 1). */
export function mod11(digits: string): number {
  if (!/^\d+$/.test(digits)) throw new Error('mod11: solo se aceptan dígitos');
  let factor = 2;
  let sum = 0;
  for (let i = digits.length - 1; i >= 0; i--) {
    sum += Number(digits[i]) * factor;
    factor = factor === 7 ? 2 : factor + 1;
  }
  const dv = 11 - (sum % 11);
  if (dv === 11) return 0;
  if (dv === 10) return 1;
  return dv;
}

export interface AccessKeyParts {
  issueDate: Date;
  codDoc: string; // 01 factura
  ruc: string;
  environment: '1' | '2';
  estab: string;
  ptoEmi: string;
  sequential: string | number;
  numericCode: string; // 8 dígitos
  emissionType?: '1';
}

const pad = (v: string | number, n: number) => String(v).padStart(n, '0');

/** Fecha en la zona horaria de Ecuador (UTC−5), formato ddmmaaaa o dd/mm/aaaa. */
export function ecuadorDate(d: Date, sep = ''): string {
  const ec = new Date(d.getTime() - 5 * 3600 * 1000);
  return [pad(ec.getUTCDate(), 2), pad(ec.getUTCMonth() + 1, 2), String(ec.getUTCFullYear())].join(sep);
}

export function buildAccessKey(p: AccessKeyParts): string {
  if (!/^\d{13}$/.test(p.ruc)) throw new Error('RUC inválido: debe tener 13 dígitos');
  if (!/^\d{3}$/.test(p.estab) || !/^\d{3}$/.test(p.ptoEmi)) throw new Error('Establecimiento y punto de emisión deben tener 3 dígitos');
  if (!/^\d{8}$/.test(p.numericCode)) throw new Error('El código numérico debe tener 8 dígitos');
  if (!/^\d{2}$/.test(p.codDoc)) throw new Error('Tipo de comprobante inválido');
  const body =
    ecuadorDate(p.issueDate) +
    p.codDoc +
    p.ruc +
    p.environment +
    p.estab +
    p.ptoEmi +
    pad(p.sequential, 9) +
    p.numericCode +
    (p.emissionType ?? '1');
  if (body.length !== 48) throw new Error('Clave de acceso mal formada');
  return body + mod11(body);
}

export function isValidAccessKey(key: string): boolean {
  return /^\d{49}$/.test(key) && mod11(key.slice(0, 48)) === Number(key[48]);
}

/** Validación de cédula ecuatoriana (módulo 10). */
export function isValidCedula(ci: string): boolean {
  if (!/^\d{10}$/.test(ci)) return false;
  const province = Number(ci.slice(0, 2));
  if (!((province >= 1 && province <= 24) || province === 30)) return false;
  if (Number(ci[2]) >= 6) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    let v = Number(ci[i]) * (i % 2 === 0 ? 2 : 1);
    if (v > 9) v -= 9;
    sum += v;
  }
  const dv = (10 - (sum % 10)) % 10;
  return dv === Number(ci[9]);
}

/** RUC: 13 dígitos terminados en 001; persona natural (3.er dígito < 6) = cédula válida + 001. */
export function isValidRuc(ruc: string): boolean {
  if (!/^\d{13}$/.test(ruc) || !ruc.endsWith('001')) return false;
  return Number(ruc[2]) >= 6 || isValidCedula(ruc.slice(0, 10));
}
