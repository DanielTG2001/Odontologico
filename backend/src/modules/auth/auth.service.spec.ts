import { ForbiddenException, HttpException, NotFoundException, UnauthorizedException, BadRequestException, ConflictException } from '@nestjs/common';
import bcrypt = require('bcrypt');
import speakeasy = require('speakeasy');
import { AuthService, MAX_LOGIN_ATTEMPTS } from './auth.service';
import { configOf, createPrismaMock, memoryRedis, PrismaMock } from '../../test-utils/mocks';

const USER = {
  id: 'u1',
  email: 'doc@sigo.dental',
  passwordHash: 'hash',
  firstName: 'Ana',
  lastName: 'Ruiz',
  role: 'ODONTOLOGO',
  isActive: true,
  mfaEnabled: true,
  mfaSecret: 'SECRET',
};

describe('AuthService', () => {
  let prisma: PrismaMock;
  let jwt: { signAsync: jest.Mock };
  let redis: ReturnType<typeof memoryRedis>;
  let service: AuthService;
  const env = { ...process.env };

  beforeEach(() => {
    process.env.MFA_ENFORCE = 'true';
    delete process.env.MFA_REQUIRED_ROLES;
    prisma = createPrismaMock();
    jwt = { signAsync: jest.fn().mockResolvedValue('signed.jwt') };
    redis = memoryRedis();
    service = new AuthService(prisma as any, jwt as any, configOf({ JWT_SECRET: 's', JWT_EXPIRES_IN: '8h' }), redis);
    jest.spyOn(bcrypt, 'compare').mockImplementation(async (p: string) => p === 'ok-pass');
    jest.spyOn(bcrypt, 'hash').mockImplementation(async () => 'hashed');
    jest.spyOn(speakeasy.totp, 'verify').mockImplementation((o: any) => o.token === '123456');
  });

  afterEach(() => {
    jest.restoreAllMocks();
    process.env = { ...env };
  });

  // ---------------- registro ----------------
  describe('register / registerBootstrap', () => {
    const dto = { email: 'NEW@x.com', password: 'secret123', firstName: 'N', lastName: 'U', role: 'ADMIN_TI' } as any;

    it('crea el usuario con hash y audita', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({ id: 'n1', email: 'new@x.com', role: 'ADMIN_TI' });
      const res = await service.register(dto);
      expect(prisma.user.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ email: 'new@x.com', passwordHash: 'hashed' }) }));
      expect(res.user.id).toBe('n1');
      expect(prisma.auditLog.create).toHaveBeenCalled();
    });

    it('rechaza email duplicado', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'x' });
      await expect(service.register(dto)).rejects.toThrow(ConflictException);
    });

    it('registro público solo para el primer usuario', async () => {
      prisma.user.count.mockResolvedValue(3);
      await expect(service.registerBootstrap(dto)).rejects.toThrow(ForbiddenException);
      prisma.user.count.mockResolvedValue(0);
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({ id: 'first' });
      await expect(service.registerBootstrap(dto)).resolves.toMatchObject({ user: { id: 'first' } });
    });
  });

  // ---------------- login ----------------
  describe('login', () => {
    it('credenciales inválidas → 401 y cuenta el intento', async () => {
      prisma.user.findUnique.mockResolvedValue(USER);
      await expect(service.login({ email: USER.email, password: 'bad' })).rejects.toThrow(UnauthorizedException);
      expect(await redis.get(`login:fail:email:${USER.email}`)).toBe('1');
    });

    it('usuario inexistente o inactivo → 401', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.login({ email: 'x@x.com', password: 'ok-pass' })).rejects.toThrow(UnauthorizedException);
      prisma.user.findUnique.mockResolvedValue({ ...USER, isActive: false });
      await expect(service.login({ email: USER.email, password: 'ok-pass' })).rejects.toThrow(UnauthorizedException);
    });

    it(`bloquea tras ${MAX_LOGIN_ATTEMPTS} intentos fallidos (429)`, async () => {
      prisma.user.findUnique.mockResolvedValue(USER);
      for (let i = 0; i < MAX_LOGIN_ATTEMPTS; i++) {
        await expect(service.login({ email: USER.email, password: 'bad' }, '1.1.1.1')).rejects.toThrow(UnauthorizedException);
      }
      const err = await service.login({ email: USER.email, password: 'ok-pass' }, '1.1.1.1').catch((e) => e);
      expect(err).toBeInstanceOf(HttpException);
      expect(err.getStatus()).toBe(429);
      expect(err.message).toMatch(/Intente nuevamente en \d+ min/);
    });

    it('bloqueo por IP con límite más amplio', async () => {
      await redis.set('login:fail:ip:9.9.9.9', String(MAX_LOGIN_ATTEMPTS * 4), 60);
      prisma.user.findUnique.mockResolvedValue(USER);
      const err = await service.login({ email: 'otro@x.com', password: 'ok-pass' }, '9.9.9.9').catch((e) => e);
      expect(err.getStatus()).toBe(429);
    });

    it('MFA obligatoria sin configurar → token de configuración', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...USER, mfaEnabled: false, mfaSecret: null });
      const res: any = await service.login({ email: USER.email, password: 'ok-pass' });
      expect(res.requiresMfaSetup).toBe(true);
      expect(res.setupToken).toBe('signed.jwt');
      expect(res.accessToken).toBeUndefined();
      const [payload, opts] = jwt.signAsync.mock.calls[0];
      expect(payload).toMatchObject({ sub: 'u1', scope: 'mfa-setup' });
      expect(opts.expiresIn).toBe('10m');
    });

    it('con MFA_ENFORCE=false entra sin MFA', async () => {
      process.env.MFA_ENFORCE = 'false';
      prisma.user.findUnique.mockResolvedValue({ ...USER, mfaEnabled: false });
      const res: any = await service.login({ email: USER.email, password: 'ok-pass' });
      expect(res.accessToken).toBe('signed.jwt');
    });

    it('MFA activa: pide el código', async () => {
      prisma.user.findUnique.mockResolvedValue(USER);
      await expect(service.login({ email: USER.email, password: 'ok-pass' })).resolves.toEqual({ requiresMfa: true, message: 'Se requiere código MFA' });
    });

    it('MFA activa: código incorrecto → 401', async () => {
      prisma.user.findUnique.mockResolvedValue(USER);
      await expect(service.login({ email: USER.email, password: 'ok-pass', mfaCode: '000000' })).rejects.toThrow('Código MFA inválido');
    });

    it('login correcto: token completo, limpia intentos y audita con IP', async () => {
      await redis.set(`login:fail:email:${USER.email}`, '2', 60);
      prisma.user.findUnique.mockResolvedValue(USER);
      const res: any = await service.login({ email: 'DOC@sigo.dental', password: 'ok-pass', mfaCode: '123456' }, '10.0.0.5');
      expect(res.accessToken).toBe('signed.jwt');
      expect(res.user).toMatchObject({ id: 'u1', role: 'ODONTOLOGO' });
      expect(res.user.passwordHash).toBeUndefined();
      expect(jwt.signAsync.mock.calls[0][0]).toMatchObject({ scope: 'full', jti: expect.any(String) });
      expect(await redis.get(`login:fail:email:${USER.email}`)).toBeNull();
      expect(prisma.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: 'LOGIN', ipAddress: '10.0.0.5' }) });
    });
  });

  // ---------------- logout ----------------
  it('logout revoca el jti hasta su expiración', async () => {
    const exp = Math.floor(Date.now() / 1000) + 120;
    await service.logout('jti-1', exp, 'u1');
    expect(await redis.get('revoked:jti-1')).toBe('1');
    expect(await redis.ttl('revoked:jti-1')).toBeLessThanOrEqual(120);
    await service.logout(undefined, undefined, 'u1');
    await service.logout('jti-2', undefined, 'u1');
    expect(await redis.ttl('revoked:jti-2')).toBeGreaterThan(3600);
  });

  // ---------------- MFA ----------------
  describe('MFA', () => {
    it('setup genera secreto y QR', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...USER, mfaEnabled: false });
      const res = await service.setupMfa('u1');
      expect(res.secret).toBeDefined();
      expect(res.qrCode).toMatch(/^data:image\/png/);
      expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({ data: { mfaSecret: res.secret } }));
    });

    it('setup: errores', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.setupMfa('x')).rejects.toThrow(UnauthorizedException);
      prisma.user.findUnique.mockResolvedValue(USER);
      await expect(service.setupMfa('u1')).rejects.toThrow(BadRequestException);
    });

    it('enable: sin setup previo → 400', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...USER, mfaSecret: null });
      await expect(service.enableMfa('u1', '123456')).rejects.toThrow(BadRequestException);
    });

    it('enable: código inválido suma intentos y bloquea al 5.º', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...USER, mfaEnabled: false });
      for (let i = 0; i < MAX_LOGIN_ATTEMPTS; i++) {
        await expect(service.enableMfa('u1', '000000')).rejects.toThrow(UnauthorizedException);
      }
      const err = await service.enableMfa('u1', '123456').catch((e) => e);
      expect(err.getStatus()).toBe(429);
    });

    it('enable: activa y devuelve token completo', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...USER, mfaEnabled: false });
      prisma.user.update.mockResolvedValue({ ...USER, mfaEnabled: true });
      const res = await service.enableMfa('u1', '123456');
      expect(res.accessToken).toBe('signed.jwt');
      expect(res.user.mfaEnabled).toBe(true);
      expect(jwt.signAsync.mock.calls[0][0].scope).toBe('full');
    });

    it('disable: prohibido si la MFA es obligatoria para el rol', async () => {
      prisma.user.findUnique.mockResolvedValue(USER);
      await expect(service.disableMfa('u1', '123456')).rejects.toThrow(ForbiddenException);
    });

    it('disable: permitido para roles no obligatorios', async () => {
      process.env.MFA_REQUIRED_ROLES = 'CAJERO';
      prisma.user.findUnique.mockResolvedValue(USER);
      await expect(service.disableMfa('u1', '000000')).rejects.toThrow(UnauthorizedException);
      await expect(service.disableMfa('u1', '123456')).resolves.toMatchObject({ message: expect.stringContaining('desactivado') });
      expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { mfaEnabled: false, mfaSecret: null } });
    });

    it('disable: sin MFA activa → 400', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...USER, mfaEnabled: false });
      await expect(service.disableMfa('u1', '123456')).rejects.toThrow(BadRequestException);
    });

    it('admin reset: limpia la MFA de otro usuario', async () => {
      prisma.user.findUnique.mockResolvedValue(USER);
      await service.adminResetMfa('u1', 'admin');
      expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { mfaEnabled: false, mfaSecret: null } });
      expect(prisma.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: 'MFA_RESET', actorId: 'admin' }) });
    });

    it('admin reset: errores', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.adminResetMfa('nope', 'admin')).rejects.toThrow(NotFoundException);
      prisma.user.findUnique.mockResolvedValue(USER);
      await expect(service.adminResetMfa('u1', 'u1')).rejects.toThrow(ForbiddenException);
    });
  });

  it('perfil incluye si la MFA es obligatoria', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'u1', role: 'CAJERO' });
    await expect(service.getProfile('u1')).resolves.toMatchObject({ mfaRequired: true });
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(service.getProfile('x')).rejects.toThrow(UnauthorizedException);
  });

  it('listUsers filtra por rol', async () => {
    prisma.user.findMany.mockResolvedValue([]);
    await service.listUsers('ODONTOLOGO');
    expect(prisma.user.findMany.mock.calls[0][0].where).toEqual({ isActive: true, role: 'ODONTOLOGO' });
    await service.listUsers();
    expect(prisma.user.findMany.mock.calls[1][0].where).toEqual({ isActive: true });
  });
});
