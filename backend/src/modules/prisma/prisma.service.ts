import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/** Umbral de consulta lenta (ms). RNF-01: el expediente completo debe cargar en < 1,5 s. */
const SLOW_QUERY_MS = Number(process.env.SLOW_QUERY_MS || 300);

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('Prisma');

  constructor() {
    // El tamaño del pool se controla con ?connection_limit=N en DATABASE_URL (ver docs/PRODUCTION.md)
    super({ log: [{ emit: 'event', level: 'query' }, { emit: 'stdout', level: 'warn' }, { emit: 'stdout', level: 'error' }] });
    (this as any).$on?.('query', (e: { duration: number; query: string }) => {
      if (e.duration >= SLOW_QUERY_MS) this.logger.warn(`Consulta lenta (${e.duration} ms): ${e.query.slice(0, 300)}`);
    });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
