import { Module } from '@nestjs/common';
import { PeriodontogramService } from './periodontogram.service';
import { PeriodontogramController } from './periodontogram.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [PeriodontogramController],
  providers: [PeriodontogramService],
  exports: [PeriodontogramService],
})
export class PeriodontogramModule {}
