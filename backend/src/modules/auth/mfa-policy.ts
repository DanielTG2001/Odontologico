import { Role } from '@prisma/client';

/**
 * RNF-05: MFA obligatoria para acceso a expedientes clínicos e información financiera.
 * Por defecto aplica a TODOS los roles (todos acceden a uno u otro).
 *   MFA_ENFORCE=false        → desactiva la obligatoriedad (solo desarrollo)
 *   MFA_REQUIRED_ROLES=A,B   → restringe la obligatoriedad a esos roles
 */
export function isMfaRequired(role: Role | string, env: Record<string, string | undefined> = process.env): boolean {
  if ((env.MFA_ENFORCE ?? 'true').toLowerCase() === 'false') return false;
  const list = (env.MFA_REQUIRED_ROLES || '').split(',').map((r) => r.trim()).filter(Boolean);
  if (list.length === 0) return true;
  return list.includes(String(role));
}
