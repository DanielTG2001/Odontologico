import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';

import { PrismaModule } from './modules/prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { PatientsModule } from './modules/patients/patients.module';
import { AppointmentsModule } from './modules/appointments/appointments.module';
import { ProceduresModule } from './modules/procedures/procedures.module';
import { ChairsModule } from './modules/chairs/chairs.module';
import { BillingModule } from './modules/billing/billing.module';
import { AuditModule } from './modules/audit/audit.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { ClinicalNotesModule } from './modules/clinical-notes/clinical-notes.module';
import { OdontogramModule } from './modules/odontogram/odontogram.module';
import { PeriodontogramModule } from './modules/periodontogram/periodontogram.module';
import { ConsentsModule } from './modules/consents/consents.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { SettlementsModule } from './modules/settlements/settlements.module';
import { CashClosingModule } from './modules/cash-closing/cash-closing.module';
import { ReportsModule } from './modules/reports/reports.module';
import { HealthModule } from './modules/health/health.module';
import { TreatmentsModule } from './modules/treatments/treatments.module';
import { FiscalModule } from './modules/fiscal/fiscal.module';
import { RedisModule } from './modules/redis/redis.module';
import { StorageModule } from './modules/storage/storage.module';
import { FilesModule } from './modules/files/files.module';
import { PrescriptionsModule } from './modules/prescriptions/prescriptions.module';
import { VitalSignsModule } from './modules/vital-signs/vital-signs.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { MetricsModule } from './modules/metrics/metrics.module';

import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { MfaGuard } from './common/guards/mfa.guard';
import { AuditInterceptor } from './common/interceptors/audit.interceptor';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['../../.env', '.env'],
    }),
    ScheduleModule.forRoot(),
    PrismaModule,
    RedisModule,
    StorageModule,
    AuthModule,
    PatientsModule,
    AppointmentsModule,
    ProceduresModule,
    ChairsModule,
    BillingModule,
    AuditModule,
    NotificationsModule,
    ClinicalNotesModule,
    OdontogramModule,
    PeriodontogramModule,
    ConsentsModule,
    InventoryModule,
    SettlementsModule,
    CashClosingModule,
    ReportsModule,
    HealthModule,
    TreatmentsModule,
    FiscalModule,
    FilesModule,
    PrescriptionsModule,
    VitalSignsModule,
    PaymentsModule,
    MetricsModule,
  ],
  providers: [
    // Orden: autenticación → MFA obligatoria (RNF-05) → roles
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: MfaGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
})
export class AppModule {}
