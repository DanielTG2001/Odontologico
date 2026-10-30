import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ConsentsService } from './consents.service';
import { CreateConsentDto } from './dto/create-consent.dto';
import { SignConsentDto } from './dto/sign-consent.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '@prisma/client';

@ApiTags('consents')
@ApiBearerAuth('JWT')
@Controller('consents')
export class ConsentsController {
  constructor(private readonly service: ConsentsService) {}

  @Post()
  @Roles(Role.ODONTOLOGO, Role.ESPECIALISTA, Role.ADMIN_TI, Role.RECEPCIONISTA)
  create(@Body() dto: CreateConsentDto, @CurrentUser('id') userId: string) {
    return this.service.create(dto, userId);
  }

  @Post(':id/send-otp')
  @Roles(Role.ODONTOLOGO, Role.ESPECIALISTA, Role.RECEPCIONISTA, Role.ADMIN_TI)
  sendOtp(@Param('id') id: string) {
    return this.service.sendOtp(id);
  }

  @Post(':id/sign')
  @Roles(Role.ODONTOLOGO, Role.ESPECIALISTA, Role.RECEPCIONISTA, Role.ADMIN_TI, Role.ASISTENTE_DENTAL)
  sign(
    @Param('id') id: string,
    @Body() dto: SignConsentDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.sign(id, dto, userId);
  }

  @Get('patient/:patientId')
  @Roles(Role.ODONTOLOGO, Role.ESPECIALISTA, Role.ADMIN_TI, Role.AUDITOR, Role.RECEPCIONISTA)
  findByPatient(@Param('patientId') patientId: string) {
    return this.service.findByPatient(patientId);
  }

  @Get(':id')
  @Roles(Role.ODONTOLOGO, Role.ESPECIALISTA, Role.ADMIN_TI, Role.AUDITOR, Role.RECEPCIONISTA)
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id/revoke')
  @Roles(Role.ODONTOLOGO, Role.ESPECIALISTA, Role.ADMIN_TI)
  revoke(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.service.revoke(id, userId);
  }
}
