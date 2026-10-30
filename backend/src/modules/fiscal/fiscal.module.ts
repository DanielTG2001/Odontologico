import { Module } from '@nestjs/common';
import { FiscalService } from './fiscal.service';
import { FiscalController } from './fiscal.controller';
import { MockFiscalProvider } from './mock-fiscal.provider';
import { SriInvoicingService } from './sri-invoicing.service';
import { FiscalCron } from './fiscal.cron';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [FiscalController],
  providers: [FiscalService, MockFiscalProvider, SriInvoicingService, FiscalCron],
  exports: [FiscalService, SriInvoicingService],
})
export class FiscalModule {}
