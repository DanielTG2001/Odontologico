import { ForbiddenException } from '@nestjs/common';
import { MfaGuard } from './mfa.guard';
import { RolesGuard } from './roles.guard';
import { JwtAuthGuard } from './jwt-auth.guard';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { ALLOW_MFA_SETUP_KEY } from '../decorators/allow-mfa-setup.decorator';
import { ROLES_KEY } from '../decorators/roles.decorator';

function ctx(user?: any) {
  return {
    getHandler: () => 'handler',
    getClass: () => 'class',
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as any;
}

function reflectorWith(meta: Record<string, unknown>) {
  return { getAllAndOverride: jest.fn((key: string) => meta[key]) } as any;
}

describe('MfaGuard (RNF-05)', () => {
  const env = { ...process.env };
  beforeEach(() => {
    process.env.MFA_ENFORCE = 'true';
    delete process.env.MFA_REQUIRED_ROLES;
  });
  afterEach(() => { process.env = { ...env }; });

  it('deja pasar rutas públicas y peticiones sin usuario', () => {
    expect(new MfaGuard(reflectorWith({ [IS_PUBLIC_KEY]: true })).canActivate(ctx())).toBe(true);
    expect(new MfaGuard(reflectorWith({})).canActivate(ctx(undefined))).toBe(true);
  });

  it('permite rutas de configuración de MFA con token limitado', () => {
    const g = new MfaGuard(reflectorWith({ [ALLOW_MFA_SETUP_KEY]: true }));
    expect(g.canActivate(ctx({ role: 'CAJERO', mfaEnabled: false, tokenScope: 'mfa-setup' }))).toBe(true);
  });

  it('bloquea el token de configuración en cualquier otra ruta', () => {
    const g = new MfaGuard(reflectorWith({}));
    expect(() => g.canActivate(ctx({ role: 'CAJERO', mfaEnabled: true, tokenScope: 'mfa-setup' }))).toThrow(ForbiddenException);
  });

  it('bloquea usuarios sin MFA cuando es obligatoria', () => {
    const g = new MfaGuard(reflectorWith({}));
    try {
      g.canActivate(ctx({ role: 'ODONTOLOGO', mfaEnabled: false, tokenScope: 'full' }));
      throw new Error('no lanzó');
    } catch (e: any) {
      expect(e).toBeInstanceOf(ForbiddenException);
      expect(e.getResponse()).toMatchObject({ code: 'MFA_SETUP_REQUIRED' });
    }
  });

  it('deja pasar usuarios con MFA activa o roles no obligatorios', () => {
    const g = new MfaGuard(reflectorWith({}));
    expect(g.canActivate(ctx({ role: 'ODONTOLOGO', mfaEnabled: true, tokenScope: 'full' }))).toBe(true);
    process.env.MFA_REQUIRED_ROLES = 'CAJERO';
    expect(g.canActivate(ctx({ role: 'AUDITOR', mfaEnabled: false, tokenScope: 'full' }))).toBe(true);
  });
});

describe('RolesGuard (RBAC)', () => {
  it('sin roles requeridos deja pasar', () => {
    expect(new RolesGuard(reflectorWith({})).canActivate(ctx({ role: 'CAJERO' }))).toBe(true);
    expect(new RolesGuard(reflectorWith({ [ROLES_KEY]: [] })).canActivate(ctx({ role: 'CAJERO' }))).toBe(true);
  });
  it('exige que el rol esté en la lista', () => {
    const g = new RolesGuard(reflectorWith({ [ROLES_KEY]: ['ADMIN_TI'] }));
    expect(g.canActivate(ctx({ role: 'ADMIN_TI' }))).toBe(true);
    expect(g.canActivate(ctx({ role: 'CAJERO' }))).toBe(false);
    expect(g.canActivate(ctx(undefined))).toBe(false);
  });
});

describe('JwtAuthGuard', () => {
  it('rutas públicas no requieren token', () => {
    expect(new JwtAuthGuard(reflectorWith({ [IS_PUBLIC_KEY]: true })).canActivate(ctx())).toBe(true);
  });
});
