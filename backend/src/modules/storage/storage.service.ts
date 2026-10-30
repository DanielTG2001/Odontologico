import { Injectable, Logger, OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CreateBucketCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

/**
 * Almacenamiento de archivos planos (Rx, fotos, PDFs) en S3 / MinIO / Azure Blob (API S3).
 * RNF-04: cifrado en reposo con SSE AES-256 (S3_SSE=AES256).
 * Las descargas se hacen con URLs firmadas de vida corta: el bucket nunca es público.
 */
@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger('Storage');
  private client: S3Client | null = null;
  readonly bucket: string;
  private readonly sse?: 'AES256';

  constructor(private readonly config: ConfigService) {
    this.bucket = this.config.get<string>('S3_BUCKET') || 'sigo-dental';
    this.sse = this.config.get<string>('S3_SSE') === 'AES256' ? 'AES256' : undefined;

    const accessKeyId = this.config.get<string>('S3_ACCESS_KEY');
    const secretAccessKey = this.config.get<string>('S3_SECRET_KEY');
    if (!accessKeyId || !secretAccessKey) return;

    const endpoint = this.config.get<string>('S3_ENDPOINT') || undefined;
    this.client = new S3Client({
      region: this.config.get<string>('S3_REGION') || 'us-east-1',
      endpoint,
      forcePathStyle: !!endpoint, // MinIO necesita path-style
      credentials: { accessKeyId, secretAccessKey },
    });
  }

  async onModuleInit() {
    if (!this.client) {
      this.logger.warn('S3 no configurado (S3_ACCESS_KEY/S3_SECRET_KEY): la subida de archivos está deshabilitada.');
      return;
    }
    if (this.config.get<string>('S3_AUTO_CREATE_BUCKET') !== 'true') return;
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch {
      try {
        await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
        this.logger.log(`Bucket ${this.bucket} creado`);
      } catch (err: any) {
        this.logger.error(`No se pudo crear el bucket ${this.bucket}: ${err.message}`);
      }
    }
  }

  isEnabled() {
    return !!this.client;
  }

  private require(): S3Client {
    if (!this.client) {
      throw new ServiceUnavailableException('El almacenamiento de archivos (S3) no está configurado');
    }
    return this.client;
  }

  async put(key: string, body: Buffer, contentType: string, metadata?: Record<string, string>) {
    await this.require().send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        Metadata: metadata,
        ...(this.sse ? { ServerSideEncryption: this.sse } : {}),
      }),
    );
    return { bucket: this.bucket, key, encrypted: !!this.sse };
  }

  /** URL firmada de descarga (por defecto 5 min). */
  async signedDownloadUrl(key: string, fileName: string, expiresInSeconds = 300) {
    const safeName = fileName.replace(/[^\w.\- ]+/g, '_');
    return getSignedUrl(
      this.require(),
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ResponseContentDisposition: `inline; filename="${safeName}"`,
      }),
      { expiresIn: expiresInSeconds },
    );
  }

  async ping(): Promise<'s3' | 'disabled' | 'down'> {
    if (!this.client) return 'disabled';
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
      return 's3';
    } catch {
      return 'down';
    }
  }
}
