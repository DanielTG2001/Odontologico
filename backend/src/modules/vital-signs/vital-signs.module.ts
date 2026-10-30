import { Module } from '@nestjs/common';
import { VitalSignsController } from './vital-signs.controller';
import { VitalSignsService } from './vital-signs.service';

@Module({
  controllers: [VitalSignsController],
  providers: [VitalSignsService],
})
export class VitalSignsModule {}
