import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Observable, tap, finalize } from 'rxjs';
import { MetricsService } from './metrics.service';

const SLOW_MS = Number(process.env.SLOW_REQUEST_MS || 1500);

/** Mide cada petición: histograma, cabecera Server-Timing y aviso de peticiones lentas (> 1,5 s). */
@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  private readonly logger = new Logger('Perf');
  constructor(private readonly metrics: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const http = context.switchToHttp();
    const req = http.getRequest();
    const res = http.getResponse();
    const start = process.hrtime.bigint();
    // Plantilla de la ruta (/api/patients/:id) para no crear una serie por id
    const route = req.route?.path || (req.originalUrl || req.url || '').split('?')[0].replace(/\/[0-9a-z]{20,}(?=\/|$)/gi, '/:id');
    let status = 200;
    this.metrics.begin();

    const elapsedMs = () => Number(process.hrtime.bigint() - start) / 1e6;

    return next.handle().pipe(
      tap({
        next: () => {
          if (!res.headersSent) res.setHeader?.('Server-Timing', `app;dur=${elapsedMs().toFixed(1)}`);
        },
        error: (err: any) => {
          status = typeof err?.getStatus === 'function' ? err.getStatus() : 500;
        },
      }),
      finalize(() => {
        const ms = elapsedMs();
        const code = status !== 200 ? status : res.statusCode || 200;
        this.metrics.end(req.method, route, code, ms / 1000);
        if (ms > SLOW_MS) this.logger.warn(`Petición lenta ${req.method} ${route}: ${ms.toFixed(0)} ms`);
      }),
    );
  }
}
