import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { TreatmentsService } from './treatments.service';
import { CreateTreatmentPlanDto, ApproveItemsDto, ReviewDiscountDto } from './dto/treatment.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '@prisma/client';

@ApiTags('treatments')
@ApiBearerAuth('JWT')
@Controller('treatments')
export class TreatmentsController {
  constructor(private readonly service: TreatmentsService) {}

  @Post()
  @Roles(Role.ODONTOLOGO, Role.ESPECIALISTA, Role.ADMIN_TI, Role.RECEPCIONISTA)
  create(@Body() dto: CreateTreatmentPlanDto, @CurrentUser('id') userId: string) {
    return this.service.create(dto, userId);
  }

  /** RF-07: bandeja de descuentos por autorizar */
  @Get('discounts/pending')
  @Roles(Role.ADMIN_TI, Role.ODONTOLOGO, Role.ESPECIALISTA)
  pendingDiscounts() {
    return this.service.pendingDiscounts();
  }

  @Post(':id/discount/review')
  @Roles(Role.ADMIN_TI, Role.ODONTOLOGO, Role.ESPECIALISTA)
  reviewDiscount(
    @Param('id') id: string,
    @Body() dto: ReviewDiscountDto,
    @CurrentUser() user: { id: string; role: Role },
  ) {
    return this.service.reviewDiscount(id, dto, user);
  }

  @Get('patient/:patientId')
  @Roles(Role.ODONTOLOGO, Role.ESPECIALISTA, Role.ADMIN_TI, Role.RECEPCIONISTA, Role.CAJERO, Role.AUDITOR)
  byPatient(@Param('patientId') patientId: string) {
    return this.service.findByPatient(patientId);
  }

  @Get(':id')
  @Roles(Role.ODONTOLOGO, Role.ESPECIALISTA, Role.ADMIN_TI, Role.RECEPCIONISTA, Role.CAJERO)
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id/send')
  @Roles(Role.ODONTOLOGO, Role.ESPECIALISTA, Role.ADMIN_TI, Role.RECEPCIONISTA)
  send(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.service.sendToPatient(id, userId);
  }

  @Post(':id/approve')
  @Roles(Role.ODONTOLOGO, Role.ESPECIALISTA, Role.ADMIN_TI, Role.RECEPCIONISTA)
  approve(
    @Param('id') id: string,
    @Body() dto: ApproveItemsDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.approve(id, dto, userId);
  }
}
