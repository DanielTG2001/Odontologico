import { of } from 'rxjs';
import { AuditInterceptor } from './audit.interceptor';
import { createPrismaMock } from '../../test-utils/mocks';

function httpCtx(req: any, type = 'http') {
  return { getType: () => type, switchToHttp: () => ({ getRequest: () => req }) } as any;
}
const handler = () => ({ handle: () => of({ ok: true }) });
const flush = () => new Promise((r) => setImmediate(r));

describe('AuditInterceptor (RNF-06)', () => {
  it('registra lecturas de historias clínicas con IP, user-agent y fecha ISO', async () => {
    const prisma = createPrismaMock();
    const i = new AuditInterceptor(prisma as any);
    const req = {
      method: 'GET', originalUrl: '/api/patients/p1?x=1', params: { id: 'p1' },
      user: { id: 'u1' }, headers: { 'x-forwarded-for': '200.1.1.1, 10.0.0.1', 'user-agent': 'Chrome' }, ip: '10.0.0.1',
    };
    await new Promise((res) => i.intercept(httpCtx(req), handler()).subscribe({ next: res }));
    await flush();
    const data = prisma.auditLog.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ actorId: 'u1', action: 'HTTP_READ', entity: 'patients', entityId: 'p1', ipAddress: '200.1.1.1', userAgent: 'Chrome' });
    expect(new Date(data.newValues.at).toISOString()).toBe(data.newValues.at);
  });

  it('clasifica exportaciones/descargas como EXPORT', async () => {
    const prisma = createPrismaMock();
    const i = new AuditInterceptor(prisma as any);
    const req = { method: 'GET', url: '/api/files/f1/download', params: { id: 'f1' }, headers: {}, ip: '1.2.3.4' };
    await new Promise((res) => i.intercept(httpCtx(req), handler()).subscribe({ next: res }));
    await flush();
    expect(prisma.auditLog.create.mock.calls[0][0].data).toMatchObject({ action: 'EXPORT', entity: 'files', actorId: null, ipAddress: '1.2.3.4' });
  });

  it('mapea métodos a acciones y usa patientId si no hay id', async () => {
    const prisma = createPrismaMock();
    const i = new AuditInterceptor(prisma as any);
    for (const [method, action] of [['POST', 'HTTP_CREATE'], ['PATCH', 'HTTP_UPDATE'], ['DELETE', 'HTTP_DELETE'], ['OPTIONS', 'HTTP_OPTIONS']]) {
      const req = { method, url: '/api/prescriptions/patient/p9', params: { patientId: 'p9' }, headers: { 'x-forwarded-for': ['5.5.5.5'] }, socket: { remoteAddress: '7.7.7.7' } };
      await new Promise((res) => i.intercept(httpCtx(req), handler()).subscribe({ next: res }));
    }
    await flush();
    const actions = prisma.auditLog.create.mock.calls.map((c: any) => c[0].data.action);
    expect(actions).toEqual(['HTTP_CREATE', 'HTTP_UPDATE', 'HTTP_DELETE', 'HTTP_OPTIONS']);
    expect(prisma.auditLog.create.mock.calls[0][0].data).toMatchObject({ entityId: 'p9', ipAddress: '5.5.5.5' });
  });

  it('no audita rutas no clínicas/financieras ni contextos no HTTP', async () => {
    const prisma = createPrismaMock();
    const i = new AuditInterceptor(prisma as any);
    await new Promise((res) => i.intercept(httpCtx({ method: 'GET', url: '/api/health', headers: {} }), handler()).subscribe({ next: res }));
    await new Promise((res) => i.intercept(httpCtx({ method: 'GET', url: '/', headers: {} }), handler()).subscribe({ next: res }));
    await new Promise((res) => i.intercept(httpCtx({}, 'rpc'), handler()).subscribe({ next: res }));
    await flush();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it('un fallo al auditar no rompe la respuesta', async () => {
    const prisma = createPrismaMock();
    prisma.auditLog.create.mockRejectedValue(new Error('db down'));
    const i = new AuditInterceptor(prisma as any);
    const out = await new Promise((res) => i.intercept(httpCtx({ method: 'GET', url: '/api/billing', headers: {}, params: {} }), handler()).subscribe({ next: res }));
    await flush();
    expect(out).toEqual({ ok: true });
  });
});
