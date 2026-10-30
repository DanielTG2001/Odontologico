import { Injectable, Logger } from '@nestjs/common';
import { NotificationProvider, SendResult } from './notification.provider';

/**
 * Provider de desarrollo: solo imprime en consola.
 * En producción se reemplaza por WhatsAppProvider / TwilioProvider / EmailProvider.
 */
@Injectable()
export class ConsoleNotificationProvider implements NotificationProvider {
  private readonly logger = new Logger('Notification');

  async send(to: string, message: string, meta?: Record<string, any>): Promise<SendResult> {
    this.logger.log(`[MOCK] To: ${to}`);
    this.logger.log(`[MOCK] Message: ${message}`);
    if (meta) this.logger.debug(`[MOCK] Meta: ${JSON.stringify(meta)}`);

    return {
      success: true,
      providerMessageId: `mock-${Date.now()}`,
    };
  }
}
