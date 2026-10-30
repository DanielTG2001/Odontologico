import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import compression = require('compression');
import { AppModule } from './app.module';
import { NestExpressApplication } from '@nestjs/platform-express';

async function bootstrap() {
  // rawBody: necesario para verificar la firma de los webhooks de pago (Stripe)
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });

  // RNF-02: apagado ordenado (termina peticiones en curso y cierra BD/Redis al redeplegar)
  app.enableShutdownHooks();

  // RNF-01: compresión gzip de respuestas JSON (expediente, odontograma, listados)
  app.use(compression({ threshold: 1024 }));

  // IP real del cliente detrás de proxy / ingress (RNF-06)
  app.set('trust proxy', 1);

  // Seguridad HTTP headers (OWASP)
  app.use(helmet());

  app.enableCors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.setGlobalPrefix('api');

  // ---------- OpenAPI / Swagger v3 ----------
  const config = new DocumentBuilder()
    .setTitle('SIGO-Dental API')
    .setDescription(
      'Sistema Integral de Gestión Odontológica y Expediente Clínico Digital.\n\n' +
        'API REST para clínicas odontológicas: pacientes, agenda, odontograma, ' +
        'facturación, inventario, honorarios y más.',
    )
    .setVersion('1.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      'JWT',
    )
    .addTag('auth', 'Autenticación y MFA')
    .addTag('patients', 'Pacientes y anamnesis')
    .addTag('appointments', 'Agenda y turnos')
    .addTag('odontogram', 'Odontograma')
    .addTag('periodontogram', 'Periodontograma')
    .addTag('clinical-notes', 'Notas SOEP')
    .addTag('consents', 'Consentimientos informados')
    .addTag('billing', 'Facturación y pagos')
    .addTag('inventory', 'Inventario y descargos')
    .addTag('settlements', 'Honorarios y liquidaciones')
    .addTag('cash-closing', 'Cierre de caja')
    .addTag('reports', 'Reportes BI')
    .addTag('notifications', 'Notificaciones')
    .addTag('prescriptions', 'Recetas odontológicas')
    .addTag('vital-signs', 'Signos vitales')
    .addTag('files', 'Archivos del paciente (S3)')
    .addTag('payments', 'Pagos en línea (Payphone / Stripe)')
    .addTag('health', 'Health checks y métricas')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  // En producción se puede ocultar la documentación pública con SWAGGER_ENABLED=false
  if (process.env.SWAGGER_ENABLED !== 'false') SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: { persistAuthorization: true },
  });

  const port = process.env.PORT || 4000;
  const server = await app.listen(port);
  // Keep-alive mayor que el del balanceador (nginx: 65 s) para evitar 502 intermitentes
  server.keepAliveTimeout = 70_000;
  server.headersTimeout = 75_000;
  console.log(`🚀 SIGO-Dental API  → http://localhost:${port}/api`);
  console.log(`📖 Swagger docs     → http://localhost:${port}/api/docs`);
}

bootstrap();
