import { randomBytes } from 'crypto';
import { Logger } from '@nestjs/common';

let devSecret: string | undefined;

/**
 * Secreto JWT. En producción es obligatorio y de al menos 32 caracteres
 * (antes había un valor por defecto fijo: cualquiera podía falsificar tokens).
 * En desarrollo, si falta, se genera uno aleatorio por arranque.
 */
export function jwtSecret(value: string | undefined = process.env.JWT_SECRET, env: string | undefined = process.env.NODE_ENV): string {
  if (value && value.length >= 32) return value;
  if (env === 'production') {
    throw new Error('JWT_SECRET es obligatorio en producción y debe tener al menos 32 caracteres');
  }
  if (value) return value; // desarrollo: se acepta corto
  if (!devSecret) {
    devSecret = randomBytes(48).toString('hex');
    new Logger('Auth').warn('JWT_SECRET no definido: se usa un secreto aleatorio (las sesiones se pierden al reiniciar).');
  }
  return devSecret;
}
