import { RedisService } from '../redis/redis.service';
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TwilioWhatsAppProvider } from './providers/twilio-whatsapp.provider';
import { EmailProvider } from './providers/email.provider';
import {
  NotificationChannel,
  NotificationType,
  SendNotificationDto,
} from './dto/send-notification.dto';
import { ConsoleNotificationProvider } from './providers/console.provider';
import { WhatsAppProvider } from './providers/whatsapp.provider';
import { NotificationProvider } from './providers/notification.provider';
import { AppointmentStatus } from '@prisma/client';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private prisma: PrismaService,
    private consoleProvider: ConsoleNotificationProvider,
    private whatsappProvider: WhatsAppProvider,
    private twilioWhatsApp: TwilioWhatsAppProvider,
    private emailProvider: EmailProvider,
    private redis: RedisService,
  ) { }

  private getProvider(channel: NotificationChannel): NotificationProvider {
    switch (channel) {
      case NotificationChannel.WHATSAPP:
        return this.twilioWhatsApp;
      case NotificationChannel.EMAIL:
        return this.emailProvider;
      case NotificationChannel.SMS:
      default:
        return this.consoleProvider;
    }
  }

  private buildMessage(dto: SendNotificationDto): string {
    const clinic = dto.clinicName || 'nuestra clínica';
    const patient = dto.patientName || 'paciente';
    const date = dto.appointmentDate || '';
    const time = dto.appointmentTime || '';
    const doctor = dto.doctorName || '';

    switch (dto.type) {
      case NotificationType.APPOINTMENT_CONFIRMATION:
        return (
          `Hola ${patient}, tu cita en ${clinic} ha sido confirmada.\n` +
          `📅 Fecha: ${date}\n🕐 Hora: ${time}\n` +
          (doctor ? `👨‍⚕️ Doctor/a: ${doctor}\n` : '') +
          `Por favor llega 10 minutos antes. ¡Te esperamos!`
        );

      case NotificationType.APPOINTMENT_REMINDER_48H:
        return (
          `Recordatorio: Hola ${patient}, tienes una cita en ${clinic} en 48 horas.\n` +
          `📅 ${date} a las ${time}` +
          (doctor ? ` con ${doctor}` : '') +
          `.\nSi necesitas reprogramar, contáctanos.`
        );

      case NotificationType.APPOINTMENT_REMINDER_24H:
        return (
          `⏰ Recordatorio: Hola ${patient}, mañana tienes cita en ${clinic}.\n` +
          `📅 ${date} a las ${time}` +
          (doctor ? ` con ${doctor}` : '') +
          `.\n¡Te esperamos!`
        );

      case NotificationType.APPOINTMENT_CANCELLED:
        return (
          `Hola ${patient}, tu cita en ${clinic} del ${date} a las ${time} ha sido cancelada.\n` +
          `Si deseas reagendar, contáctanos.`
        );

      case NotificationType.CUSTOM:
        return dto.customMessage || '';

      default:
        return dto.customMessage || 'Notificación de la clínica';
    }
  }

  async send(dto: SendNotificationDto) {
    const message = this.buildMessage(dto);
    const provider = this.getProvider(dto.channel);

    const result = await provider.send(dto.to, message, {
      type: dto.type,
      channel: dto.channel,
    });

    this.logger.log(
      `Notification ${dto.type} via ${dto.channel} to ${dto.to}: ${result.success ? 'OK' : result.error}`,
    );

    return {
      ...result,
      channel: dto.channel,
      type: dto.type,
      to: dto.to,
      message,
    };
  }

  /**
   * Envía recordatorios de citas que están a 48h o 24h.
   * Diseñado para ser llamado por un cron job (BullMQ / node-cron).
   */
  async sendPendingReminders() {
    const now = new Date();

    // Ventana 48h: entre 47h y 49h desde ahora
    const in47h = new Date(now.getTime() + 47 * 60 * 60 * 1000);
    const in49h = new Date(now.getTime() + 49 * 60 * 60 * 1000);

    // Ventana 24h: entre 23h y 25h
    const in23h = new Date(now.getTime() + 23 * 60 * 60 * 1000);
    const in25h = new Date(now.getTime() + 25 * 60 * 60 * 1000);

    const appointments48h = await this.prisma.appointment.findMany({
      where: {
        status: {
          in: [AppointmentStatus.PROGRAMADO, AppointmentStatus.CONFIRMADO],
        },
        reminderSent: false,
        startAt: { gte: in47h, lte: in49h },
      },
      include: {
        patient: true,
        doctor: { select: { firstName: true, lastName: true } },
      },
    });

    const appointments24h = await this.prisma.appointment.findMany({
      where: {
        status: {
          in: [AppointmentStatus.PROGRAMADO, AppointmentStatus.CONFIRMADO],
        },
        startAt: { gte: in23h, lte: in25h },
      },
      include: {
        patient: true,
        doctor: { select: { firstName: true, lastName: true } },
      },
    });

    const results = [];

    const DEDUPE_TTL = 3 * 24 * 3600;

    for (const appt of appointments48h) {
      if (!appt.patient.phone) continue;
      // Redis: evita duplicados si el cron corre en varias instancias
      if (!(await this.redis.acquireLock(`reminder:48h:${appt.id}`, DEDUPE_TTL))) continue;

      const result = await this.send({
        channel: NotificationChannel.WHATSAPP,
        type: NotificationType.APPOINTMENT_REMINDER_48H,
        to: appt.patient.phone,
        patientName: `${appt.patient.firstName} ${appt.patient.lastName}`,
        appointmentDate: appt.startAt.toLocaleDateString('es'),
        appointmentTime: appt.startAt.toLocaleTimeString('es', {
          hour: '2-digit',
          minute: '2-digit',
        }),
        doctorName: `Dr/a. ${appt.doctor.firstName} ${appt.doctor.lastName}`,
      });

      if (!result.success) await this.redis.releaseLock(`reminder:48h:${appt.id}`);
      if (result.success) {
        await this.prisma.appointment.update({
          where: { id: appt.id },
          data: { reminderSent: true },
        });
      }

      results.push({ ...result, appointmentId: appt.id, type: '48h' });
    }

    for (const appt of appointments24h) {
      if (!appt.patient.phone) continue;
      // La ventana de 23–25 h abarca dos ejecuciones del cron horario: sin esto
      // el paciente recibía el recordatorio de 24 h dos veces.
      if (!(await this.redis.acquireLock(`reminder:24h:${appt.id}`, DEDUPE_TTL))) continue;

      const result = await this.send({
        channel: NotificationChannel.WHATSAPP,
        type: NotificationType.APPOINTMENT_REMINDER_24H,
        to: appt.patient.phone,
        patientName: `${appt.patient.firstName} ${appt.patient.lastName}`,
        appointmentDate: appt.startAt.toLocaleDateString('es'),
        appointmentTime: appt.startAt.toLocaleTimeString('es', {
          hour: '2-digit',
          minute: '2-digit',
        }),
        doctorName: `Dr/a. ${appt.doctor.firstName} ${appt.doctor.lastName}`,
      });

      if (!result.success) await this.redis.releaseLock(`reminder:24h:${appt.id}`);
      results.push({ ...result, appointmentId: appt.id, type: '24h' });
    }

    return {
      processed48h: appointments48h.length,
      processed24h: appointments24h.length,
      results,
    };
  }

  /**
   * Notificación de confirmación al crear/confirmar una cita.
   */
  async notifyAppointmentConfirmation(appointmentId: string) {
    const appt = await this.prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: {
        patient: true,
        doctor: { select: { firstName: true, lastName: true } },
      },
    });

    if (!appt || !appt.patient.phone) {
      return { success: false, error: 'Cita o teléfono no encontrado' };
    }

    return this.send({
      channel: NotificationChannel.WHATSAPP,
      type: NotificationType.APPOINTMENT_CONFIRMATION,
      to: appt.patient.phone,
      patientName: `${appt.patient.firstName} ${appt.patient.lastName}`,
      appointmentDate: appt.startAt.toLocaleDateString('es'),
      appointmentTime: appt.startAt.toLocaleTimeString('es', {
        hour: '2-digit',
        minute: '2-digit',
      }),
      doctorName: `Dr/a. ${appt.doctor.firstName} ${appt.doctor.lastName}`,
    });
  }
}
