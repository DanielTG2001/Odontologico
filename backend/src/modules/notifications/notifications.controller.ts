import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Body, Controller, Param, Post } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { SendNotificationDto } from './dto/send-notification.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '@prisma/client';

@ApiTags('notifications')
@ApiBearerAuth('JWT')
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  /** Envío manual de cualquier notificación */
  @Post('send')
  @Roles(Role.ADMIN_TI, Role.RECEPCIONISTA)
  send(@Body() dto: SendNotificationDto) {
    return this.notificationsService.send(dto);
  }

  /** Dispara los recordatorios 48h y 24h (pensado para cron) */
  @Post('reminders/run')
  @Roles(Role.ADMIN_TI)
  runReminders() {
    return this.notificationsService.sendPendingReminders();
  }

  /** Envía confirmación de una cita específica */
  @Post('appointments/:id/confirm')
  @Roles(Role.ADMIN_TI, Role.RECEPCIONISTA, Role.ODONTOLOGO)
  confirmAppointment(@Param('id') id: string) {
    return this.notificationsService.notifyAppointmentConfirmation(id);
  }
}
