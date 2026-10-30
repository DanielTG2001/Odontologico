import { of, Observable } from 'rxjs';
import { ForbiddenException } from '@nestjs/common';
import { MetricsService, BUCKETS } from './metrics.service';
import { MetricsInterceptor } from './metrics.interceptor';
import { MetricsController } from './metrics.controller';

describe('MetricsService (RNF-01/02/03)', () => {
  it('histograma, p95, % dentro de 1,5 s, errores y concurrencia', () => {
    const m = new MetricsService();
    m.begin(); m.begin(); m.begin();
    m.end('GET', '/api/patients/:id', 200, 0.08);
    m.end('GET', '/api/patients/:id', 200, 0.2);
    m.end('GET', '/api/patients/:id', 500, 2);
    const slo = m.slo();
    expect(slo.maxConcurrentRequests).toBe(3);
    expect(slo.inFlight).toBe(0);
    expect(slo.requests).toBe(3);
    expect(slo.errorRatePct).toBe(33.33);
    expect(slo.routes[0]).toMatchObject({ route: 'GET /api/patients/:id', requests: 3, withinSloPct: 66.7, errorRatePct: 33.3, p95Seconds: 2.5 });
    const text = m.render();
    expect(text).toContain('http_request_duration_seconds_bucket{method="GET",route="/api/patients/:id",le="1.5"} 2');
    expect(text).toContain('le="+Inf"} 3');
    expect(text).toContain('http_requests_total{method="GET",route="/api/patients/:id",status="500"} 1');
    expect(text).toContain('http_requests_in_flight_max 3');
    m.end('GET', '/slow', 200, 30);
    expect(MetricsService.percentile([0, 0, 0, 0, 0, 0, 0, 0, 0, 1], 1, 0.95)).toBe(Infinity);
    expect(MetricsService.percentile([], 0, 0.5)).toBe(0);
    expect(BUCKETS).toContain(1.5);
    expect(new MetricsService().slo().errorRatePct).toBe(0);
  });
});

function ctx(req: any, res: any, type = 'http') {
  return { getType: () => type, switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }) } as any;
}

describe('MetricsInterceptor', () => {
  it('mide, agrega Server-Timing y normaliza ids en la ruta', async () => {
    const m = new MetricsService();
    const i = new MetricsInterceptor(m);
    const res = { statusCode: 200, headersSent: false, setHeader: jest.fn() };
    await new Promise((done) => i.intercept(ctx({ method: 'GET', originalUrl: '/api/patients/cjld2cjxh0000qzrmn831i7rn?x=1' }, res), { handle: () => of({ ok: 1 }) }).subscribe({ complete: done as any }));
    expect(res.setHeader).toHaveBeenCalledWith('Server-Timing', expect.stringMatching(/^app;dur=\d/));
    expect(m.slo().routes[0].route).toBe('GET /api/patients/:id');
  });

  it('registra el código de error y usa la plantilla de ruta de Express', async () => {
    const m = new MetricsService();
    const i = new MetricsInterceptor(m);
    const err = Object.assign(new Error('x'), { getStatus: () => 404 });
    await new Promise((done) =>
      i.intercept(ctx({ method: 'GET', route: { path: '/api/x/:id' }, url: '/api/x/1' }, { statusCode: 200 }), { handle: () => new Observable((o) => o.error(err)) }).subscribe({ error: done as any }),
    );
    await new Promise((done) =>
      i.intercept(ctx({ method: 'POST', url: '/api/y' }, { statusCode: 201 }), { handle: () => new Observable((o) => o.error(new Error('boom'))) }).subscribe({ error: done as any }),
    );
    const text = m.render();
    expect(text).toContain('route="/api/x/:id",status="404"');
    expect(text).toContain('route="/api/y",status="500"');
    const passthrough = i.intercept(ctx({}, {}, 'rpc'), { handle: () => of(1) });
    expect(passthrough).toBeDefined();
  });

  it('avisa peticiones lentas', async () => {
    const m = new MetricsService();
    const i = new MetricsInterceptor(m);
    const realHr = process.hrtime.bigint;
    let t = BigInt(0);
    (process.hrtime as any).bigint = () => (t += BigInt(2_000_000_000));
    try {
      await new Promise((done) => i.intercept(ctx({ method: 'GET', url: '/lento' }, { statusCode: 200, headersSent: true }), { handle: () => of(1) }).subscribe({ complete: done as any }));
    } finally {
      (process.hrtime as any).bigint = realHr;
    }
    expect(m.slo().routes[0].withinSloPct).toBe(0);
  });
});

describe('MetricsController', () => {
  const env = { ...process.env };
  afterEach(() => { process.env = { ...env }; });

  it('protege /metrics con token', () => {
    const c = new MetricsController(new MetricsService());
    process.env.METRICS_TOKEN = 'secreto';
    expect(() => c.prometheus('Bearer otro')).toThrow(ForbiddenException);
    expect(c.prometheus('Bearer secreto')).toContain('process_uptime_seconds');
    delete process.env.METRICS_TOKEN;
    process.env.NODE_ENV = 'production';
    expect(() => c.prometheus()).toThrow('METRICS_TOKEN');
    process.env.NODE_ENV = 'development';
    expect(c.prometheus()).toContain('nodejs_heap_used_bytes');
    expect(c.slo()).toHaveProperty('sloSeconds', 1.5);
  });
});
