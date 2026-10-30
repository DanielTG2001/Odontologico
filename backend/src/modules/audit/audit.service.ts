import { Injectable } from '@nestjs/common';

@Injectable()
export class AuditService {
  // TODO: log every CRUD on clinical and financial data
  async log(action: string, entity: string, entityId: string, actorId?: string, meta?: any) {
    // Implement with Prisma
  }
}
