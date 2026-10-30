import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateInventoryItemDto,
  StockMovementDto,
  ProcedureRecipeDto,
  CreateLocationDto,
  SetStockDto,
} from './dto/inventory.dto';

@Injectable()
export class InventoryService {
  constructor(private prisma: PrismaService) {}

  // ---------- Items ----------
  createItem(dto: CreateInventoryItemDto) {
    return this.prisma.inventoryItem.create({
      data: {
        sku: dto.sku,
        name: dto.name,
        description: dto.description,
        category: dto.category,
        unit: dto.unit || 'unidad',
        stockMin: dto.stockMin || 0,
        stockCurrent: dto.stockCurrent || 0,
        costAverage: dto.costAverage || 0,
      },
    });
  }

  findAllItems() {
    return this.prisma.inventoryItem.findMany({
      where: { isActive: true },
      include: {
        stocks: {
          include: {
            location: { select: { id: true, code: true, name: true, type: true } },
          },
        },
      },
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });
  }

  async findLowStock(locationId?: string) {
    if (locationId) {
      const stocks = await this.prisma.inventoryStock.findMany({
        where: { locationId },
        include: {
          item: true,
          location: { select: { id: true, code: true, name: true } },
        },
      });
      return stocks
        .filter((s) => s.quantity <= s.stockMin)
        .map((s) => ({
          ...s.item,
          stockCurrent: s.quantity,
          stockMin: s.stockMin,
          location: s.location,
        }));
    }
    const items = await this.prisma.inventoryItem.findMany({
      where: { isActive: true },
    });
    return items.filter((i) => i.stockCurrent <= i.stockMin);
  }

  // ---------- Locations ----------
  createLocation(dto: CreateLocationDto) {
    return this.prisma.inventoryLocation.create({
      data: {
        code: dto.code,
        name: dto.name,
        type: dto.type,
        chairId: dto.chairId || null,
        doctorId: dto.doctorId || null,
      },
    });
  }

  findAllLocations() {
    return this.prisma.inventoryLocation.findMany({
      where: { isActive: true },
      include: {
        chair: { select: { id: true, name: true } },
        doctor: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
    });
  }

  /** Stock de un ítem en todas las ubicaciones (o filtrado) */
  async getStockByLocation(itemId?: string, locationId?: string) {
    const where: any = {};
    if (itemId) where.itemId = itemId;
    if (locationId) where.locationId = locationId;
    return this.prisma.inventoryStock.findMany({
      where,
      include: {
        item: { select: { id: true, sku: true, name: true, unit: true, category: true } },
        location: { select: { id: true, code: true, name: true, type: true } },
      },
      orderBy: [{ location: { name: 'asc' } }, { item: { name: 'asc' } }],
    });
  }

  /** Ajuste directo de stock en una ubicación (set absolute) */
  async setStock(dto: SetStockDto, performedById: string) {
    const item = await this.prisma.inventoryItem.findUnique({
      where: { id: dto.itemId },
    });
    if (!item || !item.isActive) {
      throw new NotFoundException('Insumo no encontrado');
    }
    const location = await this.prisma.inventoryLocation.findUnique({
      where: { id: dto.locationId },
    });
    if (!location || !location.isActive) {
      throw new NotFoundException('Ubicación no encontrada');
    }

    const existing = await this.prisma.inventoryStock.findUnique({
      where: {
        itemId_locationId: { itemId: dto.itemId, locationId: dto.locationId },
      },
    });
    const prevQty = existing?.quantity ?? 0;
    const delta = dto.quantity - prevQty;

    const stock = await this.prisma.inventoryStock.upsert({
      where: {
        itemId_locationId: { itemId: dto.itemId, locationId: dto.locationId },
      },
      create: {
        itemId: dto.itemId,
        locationId: dto.locationId,
        quantity: dto.quantity,
        stockMin: dto.stockMin ?? 0,
      },
      update: {
        quantity: dto.quantity,
        ...(dto.stockMin !== undefined ? { stockMin: dto.stockMin } : {}),
      },
    });

    if (delta !== 0) {
      await this.prisma.stockMovement.create({
        data: {
          itemId: dto.itemId,
          locationId: dto.locationId,
          type: 'ADJUST',
          quantity: Math.abs(delta),
          reason: `Ajuste a ${dto.quantity} (antes ${prevQty})`,
          performedById,
        },
      });
    }

    await this.recomputeGlobalStock(dto.itemId);
    return stock;
  }

  // ---------- Movements (multi-ubicación) ----------
  async addMovement(dto: StockMovementDto, performedById: string): Promise<any> {
    const item = await this.prisma.inventoryItem.findUnique({
      where: { id: dto.itemId },
    });
    if (!item || !item.isActive) {
      throw new NotFoundException('Insumo no encontrado');
    }

    // TRANSFER entre ubicaciones
    if (dto.type === 'TRANSFER') {
      if (!dto.locationId || !dto.toLocationId) {
        throw new BadRequestException(
          'TRANSFER requiere locationId (origen) y toLocationId (destino)',
        );
      }
      return this.transfer(
        dto.itemId,
        dto.locationId,
        dto.toLocationId,
        dto.quantity,
        dto.reason,
        performedById,
      );
    }

    // Sin locationId → comportamiento legacy (stock global)
    if (!dto.locationId) {
      return this.legacyGlobalMovement(dto, item, performedById);
    }

    const location = await this.prisma.inventoryLocation.findUnique({
      where: { id: dto.locationId },
    });
    if (!location || !location.isActive) {
      throw new NotFoundException('Ubicación no encontrada');
    }

    let stock = await this.prisma.inventoryStock.findUnique({
      where: {
        itemId_locationId: { itemId: dto.itemId, locationId: dto.locationId },
      },
    });
    if (!stock) {
      stock = await this.prisma.inventoryStock.create({
        data: {
          itemId: dto.itemId,
          locationId: dto.locationId,
          quantity: 0,
          stockMin: 0,
        },
      });
    }

    let delta: number;
    if (dto.type === 'IN' || dto.type === 'ADJUST') {
      delta = dto.quantity;
    } else if (dto.type === 'OUT' || dto.type === 'AUTO_DEDUCT') {
      delta = -dto.quantity;
    } else {
      throw new BadRequestException('Tipo de movimiento inválido');
    }

    // RNF-03: descuento atómico. "UPDATE … SET quantity = quantity - n WHERE quantity >= n"
    // evita stock negativo cuando dos sillones descuentan el mismo insumo a la vez.
    const stockId = stock.id;
    const movement = await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.inventoryStock.updateMany({
        where: delta < 0 ? { id: stockId, quantity: { gte: dto.quantity } } : { id: stockId },
        data: { quantity: delta < 0 ? { decrement: dto.quantity } : { increment: dto.quantity } },
      });
      if (count === 0) {
        const current = await tx.inventoryStock.findUnique({ where: { id: stockId } });
        throw new BadRequestException(
          `Stock insuficiente de "${item.name}" en ${location.name} (disponible: ${current?.quantity ?? 0})`,
        );
      }
      return tx.stockMovement.create({
        data: {
          itemId: dto.itemId,
          locationId: dto.locationId,
          type: dto.type,
          quantity: dto.quantity,
          unitCost: dto.unitCost,
          reason: dto.reason,
          performedById,
        },
      });
    });

    await this.recomputeGlobalStock(dto.itemId);
    return movement;
  }

  private async legacyGlobalMovement(
    dto: StockMovementDto,
    item: { id: string; name: string; stockCurrent: number },
    performedById: string,
  ) {
    const out = dto.type === 'OUT' || dto.type === 'AUTO_DEDUCT';
    if (!out && dto.type !== 'IN' && dto.type !== 'ADJUST') {
      throw new BadRequestException('Tipo de movimiento inválido');
    }
    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.inventoryItem.updateMany({
        where: out ? { id: dto.itemId, stockCurrent: { gte: dto.quantity } } : { id: dto.itemId },
        data: { stockCurrent: out ? { decrement: dto.quantity } : { increment: dto.quantity } },
      });
      if (count === 0) {
        throw new BadRequestException(`Stock insuficiente de "${item.name}" (disponible: ${item.stockCurrent})`);
      }
      return tx.stockMovement.create({
        data: {
          itemId: dto.itemId,
          type: dto.type,
          quantity: dto.quantity,
          unitCost: dto.unitCost,
          reason: dto.reason,
          performedById,
        },
      });
    });
  }

  private async transfer(
    itemId: string,
    fromLocationId: string,
    toLocationId: string,
    quantity: number,
    reason: string | undefined,
    performedById: string,
  ): Promise<any> {
    await this.addMovement(
      {
        itemId,
        type: 'OUT',
        quantity,
        locationId: fromLocationId,
        reason: reason || `Transferencia a ${toLocationId}`,
      },
      performedById,
    );
    const inMovement = await this.addMovement(
      {
        itemId,
        type: 'IN',
        quantity,
        locationId: toLocationId,
        reason: reason || `Transferencia desde ${fromLocationId}`,
      },
      performedById,
    );
    // Marcar referencia
    await this.prisma.stockMovement.update({
      where: { id: inMovement.id },
      data: { referenceType: 'Transfer', type: 'TRANSFER' },
    });
    return inMovement;
  }

  private async recomputeGlobalStock(itemId: string) {
    const stocks = await this.prisma.inventoryStock.findMany({
      where: { itemId },
    });
    const total = stocks.reduce((sum, s) => sum + s.quantity, 0);
    await this.prisma.inventoryItem.update({
      where: { id: itemId },
      data: { stockCurrent: total },
    });
  }

  // ---------- Recipes ----------
  async setRecipe(dto: ProcedureRecipeDto) {
    return this.prisma.procedureRecipe.upsert({
      where: {
        procedureId_itemId: {
          procedureId: dto.procedureId,
          itemId: dto.itemId,
        },
      },
      create: dto,
      update: { quantity: dto.quantity },
    });
  }

  getRecipes(procedureId: string) {
    return this.prisma.procedureRecipe.findMany({
      where: { procedureId },
      include: { item: true },
    });
  }

  /**
   * RF-14: Descargo automático al completar un procedimiento clínico.
   * Usa la ubicación asociada al sillón de la cita (si existe).
   */
  async autoDeductForAppointment(appointmentId: string, performedById: string) {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: {
        chair: { include: { inventoryLocation: true } },
        items: { include: { procedure: { include: { recipes: true } } } },
      },
    });
    if (!appointment) throw new NotFoundException('Cita no encontrada');

    const locationId =
      appointment.chair?.inventoryLocation?.id || undefined;

    const deductions = [];

    for (const apptItem of appointment.items) {
      for (const recipe of apptItem.procedure.recipes) {
        const qty = recipe.quantity * (apptItem.quantity || 1);
        try {
          const movement = await this.addMovement(
            {
              itemId: recipe.itemId,
              type: 'AUTO_DEDUCT',
              quantity: qty,
              locationId,
              reason: `Descargo automático – cita ${appointmentId} – ${apptItem.procedure.name}`,
            },
            performedById,
          );
          await this.prisma.stockMovement.update({
            where: { id: movement.id },
            data: {
              referenceType: 'Appointment',
              referenceId: appointmentId,
            },
          });
          deductions.push({
            itemId: recipe.itemId,
            quantity: qty,
            locationId: locationId || null,
            ok: true,
          });
        } catch (err: any) {
          deductions.push({
            itemId: recipe.itemId,
            quantity: qty,
            locationId: locationId || null,
            ok: false,
            error: err.message,
          });
        }
      }
    }

    return { appointmentId, locationId: locationId || null, deductions };
  }
}
