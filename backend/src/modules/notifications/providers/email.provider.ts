import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { NotificationProvider, SendResult } from './notification.provider';

@Injectable()
export class EmailProvider implements NotificationProvider {
  private readonly logger = new Logger('EmailProvider');
  private transporter: nodemailer.Transporter | null = null;
  private from: string;

  constructor(private config: ConfigService) {
    this.from =
      this.config.get<string>('SMTP_FROM') ||
      this.config.get<string>('SMTP_USER') ||
      'noreply@sigo.dental';

    const host = this.config.get<string>('SMTP_HOST');
    const user = this.config.get<string>('SMTP_USER');
    const pass = this.config.get<string>('SMTP_PASS');
    const port = Number(this.config.get<string>('SMTP_PORT') || 587);

    if (host && user && pass) {
      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass },
      });
    }
  }

  async send(to: string, message: string, meta?: Record<string, any>): Promise<SendResult> {
    if (!this.transporter) {
      this.logger.warn('SMTP no configurado');
      return { success: false, error: 'SMTP_HOST / USER / PASS faltan' };
    }

    const subject =
      meta?.type === 'APPOINTMENT_REMINDER_24H'
        ? 'Recordatorio de cita – mañana'
        : meta?.type === 'APPOINTMENT_REMINDER_48H'
          ? 'Recordatorio de cita – en 48 horas'
          : meta?.type === 'APPOINTMENT_CONFIRMATION'
            ? 'Confirmación de cita'
            : meta?.type === 'APPOINTMENT_CANCELLED'
              ? 'Cita cancelada'
              : 'Notificación SIGO-Dental';

    try {
      const info = await this.transporter.sendMail({
        from: this.from,
        to,
        subject,
        text: message,
        html: `<pre style="font-family:sans-serif;white-space:pre-wrap">${message}</pre>`,
      });
      return { success: true, providerMessageId: info.messageId };
    } catch (err: any) {
      this.logger.error(err.message);
      return { success: false, error: err.message };
    }
  }
}