/**
 * Utilidades de prueba: Prisma y servicios simulados con jest.fn().
 * Permiten probar la lógica real de los servicios sin base de datos.
 */
const MODEL_METHODS = [
  'findUnique', 'findFirst', 'findMany', 'create', 'createMany', 'update',
  'updateMany', 'upsert', 'delete', 'count', 'aggregate',
] as const;

const MODELS = [
  'user', 'patient', 'medicalHistory', 'chair', 'procedure', 'appointment', 'appointmentItem',
  'treatmentPlan', 'treatmentPlanItem', 'invoice', 'invoiceItem', 'payment', 'clinicalNote',
  'clinicalNoteAddendum', 'odontogramRecord', 'periodontogramRecord', 'consent', 'inventoryItem',
  'inventoryLocation', 'inventoryStock', 'stockMovement', 'procedureRecipe', 'doctorCommissionRule',
  'doctorSettlement', 'cashClosing', 'auditLog', 'prescription', 'vitalSign', 'patientFile',
  'fiscalSequence', 'electronicDocument', 'onlinePayment',
] as const;

type ModelMock = Record<(typeof MODEL_METHODS)[number], jest.Mock>;
export type PrismaMock = Record<(typeof MODELS)[number], ModelMock> & {
  $transaction: jest.Mock;
  $queryRaw: jest.Mock;
};

export function createPrismaMock(): PrismaMock {
  const prisma: any = {};
  for (const model of MODELS) {
    prisma[model] = {};
    for (const m of MODEL_METHODS) prisma[model][m] = jest.fn();
  }
  prisma.auditLog.create.mockResolvedValue({ id: 'audit-1' });
  prisma.$transaction = jest.fn(async (arg: any) => (Array.isArray(arg) ? Promise.all(arg) : arg(prisma)));
  prisma.$queryRaw = jest.fn().mockResolvedValue([{ '?column?': 1 }]);
  return prisma as PrismaMock;
}

/** ConfigService mínimo */
export function configOf(values: Record<string, string | undefined> = {}) {
  return { get: (k: string) => values[k] } as any;
}

/** RedisService en memoria (comportamiento real del fallback sin Redis) */
export function memoryRedis() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { RedisService } = require('../modules/redis/redis.service');
  return new RedisService(configOf({}));
}

export const H = 3600 * 1000;
