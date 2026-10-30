import { UnauthorizedException } from '@nestjs/common';
import { JwtStrategy } from './jwt.strategy';
import { configOf, createPrismaMock, memoryRedis } from '../../test-utils/mocks';

describe('JwtStrategy', () => {
  const user = { id: 'u1', email: 'a@b.c', role: 'ODONTOLOGO', isActive: true, mfaEnabled: true };

  function build() {
    const prisma = createPrismaMock();
    const redis = memoryRedis();
    const strategy = new JwtStrategy(configOf({ JWT_SECRET: 'test-secret' }), prisma as any, redis);
    return { prisma, redis, strategy };
  }

  it('devuelve el usuario con el scope del token', async () => {
    const { prisma, strategy } = build();
    prisma.user.findUnique.mockResolvedValue(user);
    await expect(strategy.validate({ sub: 'u1', email: '', role: '', jti: 'j', exp: 9, scope: 'mfa-setup' })).resolves.toMatchObject({ id: 'u1', tokenScope: 'mfa-setup', jti: 'j', exp: 9 });
    await expect(strategy.validate({ sub: 'u1', email: '', role: '' })).resolves.toMatchObject({ tokenScope: 'full' });
  });

  it('rechaza tokens revocados (logout)', async () => {
    const { redis, strategy } = build();
    await redis.set('revoked:j1', '1', 60);
    await expect(strategy.validate({ sub: 'u1', email: '', role: '', jti: 'j1' })).rejects.toThrow(UnauthorizedException);
  });

  it('rechaza usuarios inexistentes o inactivos', async () => {
    const { prisma, strategy } = build();
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(strategy.validate({ sub: 'x', email: '', role: '' })).rejects.toThrow(UnauthorizedException);
    prisma.user.findUnique.mockResolvedValue({ ...user, isActive: false });
    await expect(strategy.validate({ sub: 'u1', email: '', role: '' })).rejects.toThrow(UnauthorizedException);
  });
});
