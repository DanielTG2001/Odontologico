import { Module } from '@nestjs/common';
import { CashClosingService } from './cash-closing.service';
import { CashClosingController } from './cash-closing.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [CashClosingController],
  providers: [CashClosingService],
  exports: [CashClosingService],
})
export class CashClosingModule {}
