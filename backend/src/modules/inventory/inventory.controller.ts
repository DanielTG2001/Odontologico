import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import {
  CreateInventoryItemDto,
  StockMovementDto,
  ProcedureRecipeDto,
  CreateLocationDto,
  SetStockDto,
} from './dto/inventory.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '@prisma/client';

@ApiTags('inventory')
@ApiBearerAuth('JWT')
@Controller('inventory')
export class InventoryController {
  constructor(private readonly service: InventoryService) {}

  @Post('items')
  @Roles(Role.ADMIN_TI, Role.AUDITOR)
  createItem(@Body() dto: CreateInventoryItemDto) {
    return this.service.createItem(dto);
  }

  @Get('items')
  @Roles(Role.ADMIN_TI, Role.AUDITOR, Role.RECEPCIONISTA, Role.ASISTENTE_DENTAL)
  findAll() {
    return this.service.findAllItems();
  }

  @Get('items/low-stock')
  @Roles(Role.ADMIN_TI, Role.AUDITOR)
  lowStock(@Query('locationId') locationId?: string) {
    return this.service.findLowStock(locationId);
  }

  // ---------- Locations ----------
  @Post('locations')
  @Roles(Role.ADMIN_TI, Role.AUDITOR)
  createLocation(@Body() dto: CreateLocationDto) {
    return this.service.createLocation(dto);
  }

  @Get('locations')
  @Roles(Role.ADMIN_TI, Role.AUDITOR, Role.RECEPCIONISTA, Role.ASISTENTE_DENTAL)
  findLocations() {
    return this.service.findAllLocations();
  }

  @Get('stocks')
  @Roles(Role.ADMIN_TI, Role.AUDITOR, Role.RECEPCIONISTA, Role.ASISTENTE_DENTAL)
  getStocks(
    @Query('itemId') itemId?: string,
    @Query('locationId') locationId?: string,
  ) {
    return this.service.getStockByLocation(itemId, locationId);
  }

  @Post('stocks')
  @Roles(Role.ADMIN_TI, Role.AUDITOR)
  setStock(@Body() dto: SetStockDto, @CurrentUser('id') userId: string) {
    return this.service.setStock(dto, userId);
  }

  @Post('movements')
  @Roles(Role.ADMIN_TI, Role.AUDITOR, Role.ASISTENTE_DENTAL)
  addMovement(@Body() dto: StockMovementDto, @CurrentUser('id') userId: string) {
    return this.service.addMovement(dto, userId);
  }

  @Post('recipes')
  @Roles(Role.ADMIN_TI)
  setRecipe(@Body() dto: ProcedureRecipeDto) {
    return this.service.setRecipe(dto);
  }

  @Get('recipes/:procedureId')
  @Roles(Role.ADMIN_TI, Role.ODONTOLOGO)
  getRecipes(@Param('procedureId') procedureId: string) {
    return this.service.getRecipes(procedureId);
  }

  @Post('auto-deduct/:appointmentId')
  @Roles(Role.ADMIN_TI, Role.ODONTOLOGO, Role.ASISTENTE_DENTAL)
  autoDeduct(
    @Param('appointmentId') appointmentId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.autoDeductForAppointment(appointmentId, userId);
  }
}
