#!/usr/bin/env node
/**
 * Código TOTP (RFC 6238, SHA-1, 6 dígitos, 30 s) compatible con Google Authenticator / speakeasy.
 * Uso: node totp.js <SECRETO_BASE32>
 */
const crypto = require('crypto');

function base32Decode(s) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const c of s.replace(/=+$/, '').replace(/\s/g, '').toUpperCase()) {
    const v = alphabet.indexOf(c);
    if (v < 0) throw new Error('Secreto base32 inválido');
    bits += v.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

function totp(secret, timeMs = Date.now(), digits = 6) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(timeMs / 1000 / 30)));
  const h = crypto.createHmac('sha1', base32Decode(secret)).update(counter).digest();
  const offset = h[h.length - 1] & 0xf;
  const code = (h.readUInt32BE(offset) & 0x7fffffff) % 10 ** digits;
  return String(code).padStart(digits, '0');
}

module.exports = { totp, base32Decode };

if (require.main === module) {
  if (process.argv[2] === '--new') {
    // Genera un secreto base32 aleatorio de 160 bits para LOADTEST_MFA_SECRET
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    const bytes = crypto.randomBytes(20);
    let bits = '';
    for (const b of bytes) bits += b.toString(2).padStart(8, '0');
    let out = '';
    for (let i = 0; i < bits.length; i += 5) out += alphabet[parseInt(bits.slice(i, i + 5).padEnd(5, '0'), 2)];
    process.stdout.write(out + '\n');
    process.exit(0);
  }
  const secret = process.argv[2] || process.env.LOADTEST_MFA_SECRET;
  if (!secret) {
    console.error('Uso: node totp.js <SECRETO_BASE32>');
    process.exit(1);
  }
  process.stdout.write(totp(secret));
}
