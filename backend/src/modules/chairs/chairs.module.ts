import { Module } from '@nestjs/common';
import { ChairsService } from './chairs.service';
import { ChairsController } from './chairs.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [ChairsController],
  providers: [ChairsService],
  exports: [ChairsService],
})
export class ChairsModule {}
