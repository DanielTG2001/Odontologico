import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { PrismaService } from '../../modules/prisma/prisma.service';

/**
 * RNF-06: Trazabilidad y auditoría.
 * Registra cada acceso (lectura, creación, modificación, exportación) a
 * historias clínicas e información financiera con usuario, IP de origen,
 * user-agent y timestamp ISO-8601 (createdAt).
 */
const AUDITED_PREFIXES = [
  'patients',
  'appointments',
  'odontogram',
  'periodontogram',
  'clinical-notes',
  'consents',
  'treatments',
  'billing',
  'fiscal',
  'cash-closing',
  'settlements',
  'reports',
  'prescriptions',
  'vital-signs',
  'files',
  'payments',
];

const METHOD_ACTION: Record<string, string> = {
  GET: 'READ',
  POST: 'CREATE',
  PUT: 'UPDATE',
  PATCH: 'UPDATE',
  DELETE: 'DELETE',
};

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger('Audit');

  constructor(private prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const req = context.switchToHttp().getRequest();
    const path: string = (req.originalUrl || req.url || '').split('?')[0];
    const segments = path.replace(/^\/?api\/?/, '').split('/').filter(Boolean);
    const entity = segments[0];

    if (!entity || !AUDITED_PREFIXES.includes(entity)) return next.handle();

    const forwarded = req.headers?.['x-forwarded-for'];
    const ip =
      (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0]?.trim() ||
      req.ip ||
      req.socket?.remoteAddress ||
      null;

    const isExport = /export|pdf|csv|download/i.test(path);
    const action = isExport ? 'EXPORT' : `HTTP_${METHOD_ACTION[req.method] || req.method}`;

    return next.handle().pipe(
      tap({
        next: () => {
          this.prisma.auditLog
            .create({
              data: {
                actorId: req.user?.id ?? null,
                action,
                entity,
                entityId: req.params?.id ?? req.params?.patientId ?? null,
                newValues: { method: req.method, path, at: new Date().toISOString() },
                ipAddress: ip,
                userAgent: String(req.headers?.['user-agent'] || '').slice(0, 255),
              },
            })
            .catch((err: Error) => this.logger.error('No se pudo registrar auditoría: ' + err.message));
        },
      }),
    );
  }
}
