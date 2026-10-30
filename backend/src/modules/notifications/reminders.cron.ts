import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { NotificationsService } from './notifications.service';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class RemindersCron {
  private readonly logger = new Logger(RemindersCron.name);

  constructor(
    private notifications: NotificationsService,
    private redis: RedisService,
  ) {}

  /** Cada hora: recordatorios 48h y 24h (RF-11) */
  @Cron(CronExpression.EVERY_HOUR)
  async handleReminders() {
    if (process.env.DISABLE_REMINDER_CRON === 'true') {
      return;
    }
    // Lock distribuido: con varias réplicas de la API solo una ejecuta el cron
    const lockKey = 'cron:reminders';
    if (!(await this.redis.acquireLock(lockKey, 50 * 60))) {
      this.logger.debug('Otra instancia ya ejecuta los recordatorios');
      return;
    }
    this.logger.log('Ejecutando recordatorios de citas…');
    try {
      const result = await this.notifications.sendPendingReminders();
      this.logger.log(
        `Recordatorios: 48h=${result.processed48h} 24h=${result.processed24h}`,
      );
    } catch (err: any) {
      this.logger.error('Error en cron de recordatorios: ' + err.message);
    }
  }
}
