import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { OnlinePaymentsService } from './online-payments.service';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class PaymentsCron {
  constructor(
    private readonly service: OnlinePaymentsService,
    private readonly redis: RedisService,
  ) {}

  @Cron(CronExpression.EVERY_10_MINUTES)
  async expire() {
    if (!(await this.redis.acquireLock('cron:payments-expire', 9 * 60))) return;
    await this.service.expireStale();
  }
}
