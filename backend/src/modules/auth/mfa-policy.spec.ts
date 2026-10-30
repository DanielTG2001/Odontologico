import { isMfaRequired } from './mfa-policy';

describe('isMfaRequired (RNF-05)', () => {
  it('obligatoria para todos los roles por defecto', () => {
    expect(isMfaRequired('CAJERO', {})).toBe(true);
    expect(isMfaRequired('ODONTOLOGO', { MFA_ENFORCE: 'true' })).toBe(true);
  });
  it('se puede desactivar en desarrollo', () => {
    expect(isMfaRequired('CAJERO', { MFA_ENFORCE: 'false' })).toBe(false);
    expect(isMfaRequired('CAJERO', { MFA_ENFORCE: 'FALSE' })).toBe(false);
  });
  it('se puede limitar a ciertos roles', () => {
    const env = { MFA_REQUIRED_ROLES: 'ODONTOLOGO, CAJERO' };
    expect(isMfaRequired('CAJERO', env)).toBe(true);
    expect(isMfaRequired('ODONTOLOGO', env)).toBe(true);
    expect(isMfaRequired('AUDITOR', env)).toBe(false);
  });
});
