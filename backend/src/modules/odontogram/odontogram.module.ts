import { Module } from '@nestjs/common';
import { OdontogramService } from './odontogram.service';
import { OdontogramController } from './odontogram.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [OdontogramController],
  providers: [OdontogramService],
  exports: [OdontogramService],
})
export class OdontogramModule {}
