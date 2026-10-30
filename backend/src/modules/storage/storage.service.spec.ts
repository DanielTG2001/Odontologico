import { ServiceUnavailableException } from '@nestjs/common';
import { StorageService } from './storage.service';
import { configOf } from '../../test-utils/mocks';

const CREDS = { S3_ACCESS_KEY: 'k', S3_SECRET_KEY: 's', S3_ENDPOINT: 'http://localhost:9000', S3_BUCKET: 'b' };

function withFakeClient(extra: Record<string, string> = {}) {
  const svc = new StorageService(configOf({ ...CREDS, ...extra }));
  const send = jest.fn().mockResolvedValue({});
  (svc as any).client = { send };
  return { svc, send };
}

describe('StorageService (S3 / MinIO)', () => {
  it('deshabilitado sin credenciales', async () => {
    const svc = new StorageService(configOf({}));
    expect(svc.isEnabled()).toBe(false);
    expect(svc.bucket).toBe('sigo-dental');
    await svc.onModuleInit();
    await expect(svc.put('k', Buffer.from('x'), 'image/png')).rejects.toThrow(ServiceUnavailableException);
    await expect(svc.ping()).resolves.toBe('disabled');
  });

  it('configura path-style para MinIO', () => {
    const svc = new StorageService(configOf(CREDS));
    expect(svc.isEnabled()).toBe(true);
    expect((svc as any).client.config.forcePathStyle).toBe(true);
  });

  it('put cifra con AES256 cuando S3_SSE=AES256 (RNF-04)', async () => {
    const { svc, send } = withFakeClient({ S3_SSE: 'AES256' });
    await expect(svc.put('patients/p1/a.jpg', Buffer.from('x'), 'image/jpeg', { sha256: 'h' })).resolves.toEqual({ bucket: 'b', key: 'patients/p1/a.jpg', encrypted: true });
    expect(send.mock.calls[0][0].input).toMatchObject({ Bucket: 'b', Key: 'patients/p1/a.jpg', ContentType: 'image/jpeg', ServerSideEncryption: 'AES256' });
  });

  it('put sin SSE (MinIO local sin KMS)', async () => {
    const { svc, send } = withFakeClient();
    await svc.put('k', Buffer.from('x'), 'image/png');
    expect(send.mock.calls[0][0].input.ServerSideEncryption).toBeUndefined();
  });

  it('URL firmada (se firma localmente, sin red)', async () => {
    const svc = new StorageService(configOf(CREDS));
    const url = await svc.signedDownloadUrl('k/1.pdf', 'informe "final".pdf', 60);
    expect(url).toContain('k/1.pdf');
  });

  it('ping y creación automática del bucket', async () => {
    const { svc, send } = withFakeClient({ S3_AUTO_CREATE_BUCKET: 'true' });
    await expect(svc.ping()).resolves.toBe('s3');
    send.mockRejectedValueOnce(new Error('NotFound')).mockResolvedValueOnce({});
    await svc.onModuleInit();
    expect(send).toHaveBeenCalledTimes(3);
    send.mockRejectedValueOnce(new Error('NotFound')).mockRejectedValueOnce(new Error('denied'));
    await svc.onModuleInit();
    send.mockRejectedValueOnce(new Error('down'));
    await expect(svc.ping()).resolves.toBe('down');
  });

  it('sin auto-creación no toca el bucket', async () => {
    const { svc, send } = withFakeClient();
    await svc.onModuleInit();
    expect(send).not.toHaveBeenCalled();
  });
});
