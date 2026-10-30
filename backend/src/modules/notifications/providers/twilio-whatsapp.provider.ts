import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NotificationProvider, SendResult } from './notification.provider';

@Injectable()
export class TwilioWhatsAppProvider implements NotificationProvider {
  private readonly logger = new Logger('TwilioWhatsApp');
  private readonly sid: string;
  private readonly token: string;
  private readonly from: string;

  constructor(private config: ConfigService) {
    this.sid = this.config.get<string>('TWILIO_ACCOUNT_SID') || '';
    this.token = this.config.get<string>('TWILIO_AUTH_TOKEN') || '';
    this.from =
      this.config.get<string>('TWILIO_WHATSAPP_FROM') ||
      'whatsapp:+17372508034';
  }

  async send(to: string, message: string): Promise<SendResult> {
    if (!this.sid || !this.token) {
      this.logger.warn('Twilio no configurado');
      return { success: false, error: 'TWILIO_ACCOUNT_SID / AUTH_TOKEN faltan' };
    }

    // Destino: whatsapp:+5917xxxxxxx
    let toWa = to.trim();
    if (!toWa.startsWith('whatsapp:')) {
      const digits = toWa.replace(/\D/g, '');
      toWa = `whatsapp:+${digits}`;
    }

    const url = `https://api.twilio.com/2010-04-01/Accounts/${this.sid}/Messages.json`;
    const body = new URLSearchParams({
      From: this.from,
      To: toWa,
      Body: message,
    });

    try {
      const auth = Buffer.from(`${this.sid}:${this.token}`).toString('base64');
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
      });
      const data = await res.json();

      if (!res.ok) {
        this.logger.error(JSON.stringify(data));
        return {
          success: false,
          error: data.message || data.error_message || 'Error Twilio',
        };
      }

      return { success: true, providerMessageId: data.sid };
    } catch (err: any) {
      this.logger.error(err.message);
      return { success: false, error: err.message };
    }
  }
}