import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { SettlementsService } from './settlements.service';
import { CreateCommissionRuleDto, CreateSettlementDto } from './dto/settlement.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '@prisma/client';

@ApiTags('settlements')
@ApiBearerAuth('JWT')
@Controller('settlements')
export class SettlementsController {
  constructor(private readonly service: SettlementsService) {}

  @Post('rules')
  @Roles(Role.ADMIN_TI, Role.CONTADOR)
  createRule(@Body() dto: CreateCommissionRuleDto) {
    return this.service.createRule(dto);
  }

  @Get('rules/:doctorId')
  @Roles(Role.ADMIN_TI, Role.CONTADOR, Role.ODONTOLOGO)
  getRules(@Param('doctorId') doctorId: string) {
    return this.service.getRules(doctorId);
  }

  @Post()
  @Roles(Role.ADMIN_TI, Role.CONTADOR)
  create(
    @Body() dto: CreateSettlementDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.createSettlement(dto, userId);
  }

  @Get('doctor/:doctorId')
  @Roles(Role.ADMIN_TI, Role.CONTADOR, Role.ODONTOLOGO)
  findByDoctor(@Param('doctorId') doctorId: string) {
    return this.service.findByDoctor(doctorId);
  }

  @Get(':id')
  @Roles(Role.ADMIN_TI, Role.CONTADOR, Role.ODONTOLOGO)
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id/approve')
  @Roles(Role.ADMIN_TI, Role.CONTADOR)
  approve(@Param('id') id: string) {
    return this.service.approve(id);
  }

  @Patch(':id/paid')
  @Roles(Role.ADMIN_TI, Role.CONTADOR)
  markPaid(@Param('id') id: string) {
    return this.service.markPaid(id);
  }
}
