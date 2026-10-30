import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { OnlinePaymentsController } from './online-payments.controller';
import { OnlinePaymentsService } from './online-payments.service';
import { PaymentsCron } from './payments.cron';

@Module({
  imports: [BillingModule, NotificationsModule],
  controllers: [OnlinePaymentsController],
  providers: [OnlinePaymentsService, PaymentsCron],
})
export class PaymentsModule {}
