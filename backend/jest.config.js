/**
 * Criterio SRS 8.2: cobertura mínima del 80 % en endpoints críticos del backend.
 * "Críticos" = la lógica de negocio detrás de los endpoints listados en
 * docs/UAT_ACCEPTANCE.md (auth, pacientes, agenda/RN-03, facturación, notas SOEP,
 * odontograma, consentimientos, cierre de caja) + los módulos clínicos nuevos y
 * la seguridad transversal (guards, auditoría, Redis, S3).
 *
 *   npm test          → ejecuta las pruebas
 *   npm run test:cov  → falla si la cobertura de esos archivos baja del umbral
 */
const CRITICAL = [
  'src/common/guards/**/*.ts',
  'src/common/interceptors/**/*.ts',
  'src/modules/auth/auth.service.ts',
  'src/modules/auth/jwt.strategy.ts',
  'src/modules/auth/mfa-policy.ts',
  'src/modules/patients/patients.service.ts',
  'src/modules/appointments/appointments.service.ts',
  'src/modules/billing/billing.service.ts',
  'src/modules/cash-closing/cash-closing.service.ts',
  'src/modules/clinical-notes/clinical-notes.service.ts',
  'src/modules/consents/consents.service.ts',
  'src/modules/odontogram/odontogram.service.ts',
  'src/modules/periodontogram/periodontogram.service.ts',
  'src/modules/treatments/treatments.service.ts',
  'src/modules/prescriptions/*.ts',
  'src/modules/vital-signs/*.ts',
  'src/modules/files/files.service.ts',
  'src/modules/storage/storage.service.ts',
  'src/modules/redis/redis.service.ts',
  'src/modules/notifications/notifications.service.ts',
  'src/modules/notifications/reminders.cron.ts',
  'src/modules/chairs/chairs.service.ts',
  'src/modules/procedures/procedures.service.ts',
  'src/modules/health/health.controller.ts',
  // Facturación electrónica SRI, pagos en línea y métricas RNF
  'src/modules/fiscal/fiscal.service.ts',
  'src/modules/fiscal/sri-invoicing.service.ts',
  'src/modules/fiscal/fiscal.cron.ts',
  'src/modules/fiscal/sri/*.ts',
  'src/modules/payments/online-payments.service.ts',
  'src/modules/payments/payments.cron.ts',
  'src/modules/payments/gateways/*.ts',
  'src/modules/metrics/metrics.service.ts',
  'src/modules/metrics/metrics.interceptor.ts',
  '!src/**/*.spec.ts',
  '!src/**/*.controller.ts',
  'src/modules/health/health.controller.ts',
];

module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '.*\\.spec\\.ts$',
  // Solo transpila (sin chequeo de tipos) para que las pruebas sean rápidas;
  // el chequeo de tipos lo hace `npm run build`.
  transform: { '^.+\\.(t|j)s$': ['ts-jest', { diagnostics: false }] },
  collectCoverageFrom: CRITICAL,
  coverageDirectory: './coverage',
  coverageReporters: ['text', 'text-summary', 'lcov', 'html'],
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  coverageThreshold: {
    global: {
      statements: 80,
      lines: 80,
      functions: 80,
      branches: 75,
    },
  },
};
