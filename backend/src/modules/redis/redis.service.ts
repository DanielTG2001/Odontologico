import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/**
 * Cache y mensajería (arquitectura sugerida del SRS, sección 7).
 * Usos en SIGO-Dental:
 *  - Rate limiting de login y MFA (SECURITY_CHECKLIST: 5 intentos / 15 min)
 *  - Revocación de tokens JWT al cerrar sesión
 *  - Lock distribuido para que el cron de recordatorios no se ejecute dos veces
 *  - Caché de catálogos (procedimientos, sillones)
 *
 * Si REDIS_URL no está definido o Redis no responde, cae a un almacén en memoria
 * para que el entorno de desarrollo siga funcionando (con un warning).
 */
@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('Redis');
  private client: Redis | null = null;
  private healthy = false;
  private readonly memory = new Map<string, { value: string; expiresAt: number | null }>();

  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    const url = this.config.get<string>('REDIS_URL');
    if (!url) {
      this.logger.warn('REDIS_URL no definido: usando almacén en memoria (solo desarrollo).');
      return;
    }
    this.client = this.createClient(url);
    this.client.on('ready', () => {
      this.healthy = true;
      this.logger.log('Conectado a Redis');
    });
    this.client.on('error', (err) => {
      if (this.healthy) this.logger.error('Redis no disponible: ' + err.message);
      this.healthy = false;
    });
    try {
      await this.client.connect();
    } catch (err: any) {
      this.logger.warn('No se pudo conectar a Redis (' + err.message + '); usando memoria.');
    }
  }

  /** Separado para poder sustituirlo en pruebas */
  protected createClient(url: string): Redis {
    return new Redis(url, {
      lazyConnect: true,
      maxRetriesPerRequest: 2,
      enableOfflineQueue: false,
    });
  }

  async onModuleDestroy() {
    if (this.client) await this.client.quit().catch(() => undefined);
  }

  isRedis() {
    return !!this.client && this.healthy;
  }

  // ---------- memoria (fallback) ----------
  private memGet(key: string) {
    const e = this.memory.get(key);
    if (!e) return null;
    if (e.expiresAt !== null && e.expiresAt <= Date.now()) {
      this.memory.delete(key);
      return null;
    }
    return e.value;
  }

  // ---------- API ----------
  async get(key: string): Promise<string | null> {
    if (this.isRedis()) return this.client!.get(key);
    return this.memGet(key);
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (this.isRedis()) {
      if (ttlSeconds) await this.client!.set(key, value, 'EX', ttlSeconds);
      else await this.client!.set(key, value);
      return;
    }
    this.memory.set(key, { value, expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : null });
  }

  async del(key: string): Promise<void> {
    if (this.isRedis()) {
      await this.client!.del(key);
      return;
    }
    this.memory.delete(key);
  }

  /** Incrementa un contador; fija el TTL solo en el primer incremento (ventana fija). */
  async incr(key: string, ttlSeconds: number): Promise<number> {
    if (this.isRedis()) {
      const n = await this.client!.incr(key);
      if (n === 1) await this.client!.expire(key, ttlSeconds);
      return n;
    }
    const current = Number(this.memGet(key) || 0) + 1;
    const existing = this.memory.get(key);
    this.memory.set(key, {
      value: String(current),
      expiresAt: existing?.expiresAt ?? Date.now() + ttlSeconds * 1000,
    });
    return current;
  }

  async ttl(key: string): Promise<number> {
    if (this.isRedis()) return this.client!.ttl(key);
    const e = this.memory.get(key);
    if (!e || e.expiresAt === null) return -1;
    return Math.max(0, Math.ceil((e.expiresAt - Date.now()) / 1000));
  }

  /** Lock distribuido (SET NX EX). Devuelve true si se obtuvo. */
  async acquireLock(key: string, ttlSeconds: number): Promise<boolean> {
    if (this.isRedis()) {
      const res = await this.client!.set(key, String(Date.now()), 'EX', ttlSeconds, 'NX');
      return res === 'OK';
    }
    if (this.memGet(key) !== null) return false;
    await this.set(key, String(Date.now()), ttlSeconds);
    return true;
  }

  async releaseLock(key: string) {
    await this.del(key);
  }

  /** Cache-aside: devuelve el valor cacheado o ejecuta loader y lo guarda. */
  async remember<T>(key: string, ttlSeconds: number, loader: () => Promise<T>): Promise<T> {
    const cached = await this.get(key);
    if (cached !== null) {
      try {
        return JSON.parse(cached) as T;
      } catch {
        /* valor corrupto: recargar */
      }
    }
    const value = await loader();
    await this.set(key, JSON.stringify(value), ttlSeconds);
    return value;
  }

  async ping(): Promise<'redis' | 'memory' | 'down'> {
    if (!this.client) return 'memory';
    try {
      await this.client.ping();
      return 'redis';
    } catch {
      return 'down';
    }
  }
}
