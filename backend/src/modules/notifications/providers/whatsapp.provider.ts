import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NotificationProvider, SendResult } from './notification.provider';

/**
 * Integración con Meta Cloud API (WhatsApp Business).
 * Requiere WHATSAPP_API_TOKEN y WHATSAPP_PHONE_NUMBER_ID en .env
 *
 * Documentación: https://developers.facebook.com/docs/whatsapp/cloud-api
 */
@Injectable()
export class WhatsAppProvider implements NotificationProvider {
  private readonly logger = new Logger('WhatsAppProvider');
  private readonly token: string;
  private readonly phoneNumberId: string;
  private readonly apiVersion = 'v21.0';

  constructor(private config: ConfigService) {
    this.token = this.config.get<string>('WHATSAPP_API_TOKEN') || '';
    this.phoneNumberId = this.config.get<string>('WHATSAPP_PHONE_NUMBER_ID') || '';
  }

  async send(to: string, message: string): Promise<SendResult> {
    if (!this.token || !this.phoneNumberId) {
      this.logger.warn('WhatsApp no configurado – usando fallback mock');
      return {
        success: true,
        providerMessageId: `wa-mock-${Date.now()}`,
        error: 'WHATSAPP_API_TOKEN o WHATSAPP_PHONE_NUMBER_ID no configurados',
      };
    }

    try {
      // Formato E.164 sin + (ej: 59170000000)
      const cleanTo = to.replace(/\D/g, '');

      const url = `https://graph.facebook.com/${this.apiVersion}/${this.phoneNumberId}/messages`;

      const body = {
        messaging_product: 'whatsapp',
        to: cleanTo,
        type: 'text',
        text: { body: message },
      };

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        this.logger.error(`WhatsApp error: ${JSON.stringify(data)}`);
        return { success: false, error: data.error?.message || 'Error WhatsApp' };
      }

      return {
        success: true,
        providerMessageId: data.messages?.[0]?.id,
      };
    } catch (err: any) {
      this.logger.error(`WhatsApp exception: ${err.message}`);
      return { success: false, error: err.message };
    }
  }
}
