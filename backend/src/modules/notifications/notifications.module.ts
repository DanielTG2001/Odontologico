import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { ConsoleNotificationProvider } from './providers/console.provider';
import { WhatsAppProvider } from './providers/whatsapp.provider';
import { RemindersCron } from './reminders.cron';
import { PrismaModule } from '../prisma/prisma.module';
import { TwilioWhatsAppProvider } from './providers/twilio-whatsapp.provider';
import { EmailProvider } from './providers/email.provider';


@Module({
  imports: [PrismaModule],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    ConsoleNotificationProvider,
    WhatsAppProvider,
    RemindersCron,
    NotificationsService,
    ConsoleNotificationProvider,
    TwilioWhatsAppProvider,
    EmailProvider,
  ],
  exports: [NotificationsService],
})
export class NotificationsModule { }
