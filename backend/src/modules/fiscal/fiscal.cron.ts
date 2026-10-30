import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SriInvoicingService } from './sri-invoicing.service';
import { RedisService } from '../redis/redis.service';

/** Reintenta envíos al SRI que quedaron pendientes (SRI caído, en procesamiento, etc.). */
@Injectable()
export class FiscalCron {
  private readonly logger = new Logger('FiscalCron');

  constructor(
    private readonly sri: SriInvoicingService,
    private readonly redis: RedisService,
  ) {}

  @Cron(CronExpression.EVERY_10_MINUTES)
  async handle() {
    const provider = (process.env.FISCAL_PROVIDER || 'sri-simulado').toLowerCase();
    if (provider !== 'sri' && provider !== 'sri-simulado') return;
    if (!(await this.redis.acquireLock('cron:sri-retry', 9 * 60))) return;
    try {
      const r = await this.sri.retryPending();
      if (r.processed) this.logger.log(`Comprobantes reintentados: ${r.processed}`);
    } catch (err: any) {
      this.logger.error('Error reintentando comprobantes: ' + err.message);
    }
  }
}
