import { RedisService } from './redis.service';
import { configOf } from '../../test-utils/mocks';

describe('RedisService', () => {
  describe('fallback en memoria (sin REDIS_URL)', () => {
    let redis: RedisService;
    beforeEach(async () => {
      redis = new RedisService(configOf({}));
      await redis.onModuleInit();
    });

    it('get/set/del', async () => {
      expect(redis.isRedis()).toBe(false);
      expect(await redis.get('k')).toBeNull();
      await redis.set('k', 'v');
      expect(await redis.get('k')).toBe('v');
      await redis.del('k');
      expect(await redis.get('k')).toBeNull();
    });

    it('respeta el TTL', async () => {
      await redis.set('t', 'v', 1);
      expect(await redis.ttl('t')).toBeGreaterThan(0);
      const realNow = Date.now;
      Date.now = () => realNow() + 2000;
      try {
        expect(await redis.get('t')).toBeNull();
      } finally {
        Date.now = realNow;
      }
      expect(await redis.ttl('none')).toBe(-1);
      await redis.set('forever', 'x');
      expect(await redis.ttl('forever')).toBe(-1);
    });

    it('incr cuenta y conserva la ventana', async () => {
      expect(await redis.incr('c', 60)).toBe(1);
      expect(await redis.incr('c', 60)).toBe(2);
      expect(await redis.incr('c', 60)).toBe(3);
      expect(await redis.ttl('c')).toBeLessThanOrEqual(60);
    });

    it('acquireLock es exclusivo hasta liberarlo', async () => {
      expect(await redis.acquireLock('L', 30)).toBe(true);
      expect(await redis.acquireLock('L', 30)).toBe(false);
      await redis.releaseLock('L');
      expect(await redis.acquireLock('L', 30)).toBe(true);
    });

    it('remember cachea el resultado del loader', async () => {
      const loader = jest.fn().mockResolvedValue({ a: 1 });
      expect(await redis.remember('r', 60, loader)).toEqual({ a: 1 });
      expect(await redis.remember('r', 60, loader)).toEqual({ a: 1 });
      expect(loader).toHaveBeenCalledTimes(1);
    });

    it('remember recarga si el valor cacheado está corrupto', async () => {
      await redis.set('bad', '{no-json');
      const loader = jest.fn().mockResolvedValue([1]);
      expect(await redis.remember('bad', 60, loader)).toEqual([1]);
      expect(loader).toHaveBeenCalledTimes(1);
    });

    it('ping devuelve memory', async () => {
      expect(await redis.ping()).toBe('memory');
      await redis.onModuleDestroy();
    });
  });

  describe('con cliente Redis', () => {
    let redis: RedisService;
    let client: any;
    beforeEach(() => {
      redis = new RedisService(configOf({}));
      client = {
        get: jest.fn().mockResolvedValue('v'),
        set: jest.fn().mockResolvedValue('OK'),
        del: jest.fn().mockResolvedValue(1),
        incr: jest.fn().mockResolvedValue(1),
        expire: jest.fn().mockResolvedValue(1),
        ttl: jest.fn().mockResolvedValue(42),
        ping: jest.fn().mockResolvedValue('PONG'),
        quit: jest.fn().mockResolvedValue('OK'),
      };
      (redis as any).client = client;
      (redis as any).healthy = true;
    });

    it('delega en el cliente', async () => {
      expect(redis.isRedis()).toBe(true);
      expect(await redis.get('k')).toBe('v');
      await redis.set('k', 'v', 10);
      expect(client.set).toHaveBeenCalledWith('k', 'v', 'EX', 10);
      await redis.set('k2', 'v');
      expect(client.set).toHaveBeenCalledWith('k2', 'v');
      await redis.del('k');
      expect(client.del).toHaveBeenCalledWith('k');
      expect(await redis.ttl('k')).toBe(42);
    });

    it('incr fija expiración solo en el primer incremento', async () => {
      await redis.incr('c', 900);
      expect(client.expire).toHaveBeenCalledWith('c', 900);
      client.incr.mockResolvedValueOnce(2);
      client.expire.mockClear();
      expect(await redis.incr('c', 900)).toBe(2);
      expect(client.expire).not.toHaveBeenCalled();
    });

    it('acquireLock usa SET NX EX', async () => {
      expect(await redis.acquireLock('L', 5)).toBe(true);
      expect(client.set).toHaveBeenCalledWith('L', expect.any(String), 'EX', 5, 'NX');
      client.set.mockResolvedValueOnce(null);
      expect(await redis.acquireLock('L', 5)).toBe(false);
    });

    it('ping: redis o down', async () => {
      expect(await redis.ping()).toBe('redis');
      client.ping.mockRejectedValueOnce(new Error('x'));
      expect(await redis.ping()).toBe('down');
      await redis.onModuleDestroy();
      expect(client.quit).toHaveBeenCalled();
    });
  });

  describe('onModuleInit con REDIS_URL', () => {
    function withClient(fake: any) {
      class TestRedis extends RedisService {
        protected createClient() {
          return fake;
        }
      }
      return new TestRedis(configOf({ REDIS_URL: 'redis://localhost:6379' }));
    }

    it('conecta y marca healthy al recibir ready', async () => {
      const handlers: Record<string, (...a: any[]) => void> = {};
      const fake = {
        on: jest.fn((ev: string, h: any) => { handlers[ev] = h; }),
        connect: jest.fn(async () => handlers.ready()),
        quit: jest.fn().mockResolvedValue('OK'),
      };
      const redis = withClient(fake);
      await redis.onModuleInit();
      expect(fake.connect).toHaveBeenCalled();
      expect(redis.isRedis()).toBe(true);
      handlers.error(new Error('se cayó'));
      expect(redis.isRedis()).toBe(false);
      handlers.error(new Error('sigue caído'));
      await redis.onModuleDestroy();
    });

    it('si no conecta, sigue funcionando en memoria', async () => {
      const fake = { on: jest.fn(), connect: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')), quit: jest.fn().mockResolvedValue('OK') };
      const redis = withClient(fake);
      await redis.onModuleInit();
      expect(redis.isRedis()).toBe(false);
      await redis.set('x', '1');
      expect(await redis.get('x')).toBe('1');
    });
  });
});
