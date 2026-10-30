import { HealthController } from './health.controller';
import { createPrismaMock } from '../../test-utils/mocks';

describe('HealthController', () => {
  it('reporta base de datos, caché y almacenamiento', async () => {
    const prisma = createPrismaMock();
    const redis = { ping: jest.fn().mockResolvedValue('redis') };
    const storage = { ping: jest.fn().mockResolvedValue('s3') };
    const c = new HealthController(prisma as any, redis as any, storage as any);
    await expect(c.check()).resolves.toMatchObject({ status: 'ok', checks: { database: 'up', cache: 'redis', storage: 's3' } });
    redis.ping.mockResolvedValue('down');
    await expect(c.check()).resolves.toMatchObject({ status: 'degraded' });
    prisma.$queryRaw.mockRejectedValue(new Error('db'));
    await expect(c.check()).resolves.toMatchObject({ checks: { database: 'down' } });
    await expect(c.ready()).rejects.toThrow('db');
    expect(c.live()).toEqual({ alive: true });
  });
});
