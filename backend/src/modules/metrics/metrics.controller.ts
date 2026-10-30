import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Controller, ForbiddenException, Get, Header, Headers } from '@nestjs/common';
import { Role } from '@prisma/client';
import { MetricsService } from './metrics.service';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';

@ApiTags('health')
@Controller('metrics')
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  /** Para Prometheus/Grafana. Protegido con METRICS_TOKEN y bloqueado en nginx desde Internet. */
  @Public()
  @Get()
  @Header('Content-Type', 'text/plain; version=0.0.4')
  prometheus(@Headers('authorization') auth?: string) {
    const token = process.env.METRICS_TOKEN;
    if (token && auth !== `Bearer ${token}`) throw new ForbiddenException('Token de métricas inválido');
    if (!token && process.env.NODE_ENV === 'production') throw new ForbiddenException('Configure METRICS_TOKEN');
    return this.metrics.render();
  }

  /** Resumen de cumplimiento RNF-01/02/03 de esta instancia */
  @ApiBearerAuth('JWT')
  @Get('slo')
  @Roles(Role.ADMIN_TI, Role.AUDITOR)
  slo() {
    return this.metrics.slo();
  }
}
