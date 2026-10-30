# Checklist de Seguridad – SIGO-Dental (Fase 4)

Basado en OWASP Top 10 y los RNF del SRS.

## 1. Autenticación y control de acceso
- [x] JWT con expiración configurable (default 8h)
- [x] MFA TOTP **obligatoria** (RNF-05): `MfaGuard` global bloquea con 403 `MFA_SETUP_REQUIRED` a quien no la activó; el primer login entrega un token limitado (10 min) solo para enrolarse. No se puede desactivar en roles obligatorios. Admin TI puede restablecerla (`POST /auth/admin/users/:id/mfa/reset`)
- [x] Registro público deshabilitado salvo para el primer usuario (antes permitía crear `ADMIN_TI`)
- [x] Revocación de tokens al cerrar sesión (`jti` en Redis)
- [x] RBAC con roles granulares
- [x] Guards globales JWT + Roles
- [x] Rate limiting en login (5 intentos / 15 min por email, 20 por IP) y en la activación de MFA – Redis
- [x] Límite de 5 intentos para el OTP de consentimientos; OTP generado con CSPRNG (`crypto.randomInt`)
- [x] Cierre de sesión por inactividad 15 min (frontend, aviso 60 s antes)

## 2. Protección de datos (RNF-04)
- [x] TLS 1.3 en tránsito: `deploy/nginx/sigo.conf.template` (`ssl_protocols TLSv1.3`, HSTS)
- [x] Helmet headers activados
- [x] Archivos (Rx, fotos, PDFs) en S3 con SSE AES-256 (`S3_SSE=AES256`) y descarga solo por URL firmada de 5 min
- [x] Validación del tipo real de archivo por *magic bytes* (no se confía en el mimetype)
- [x] Respaldos de PostgreSQL cifrados con AES-256 (`BACKUP_ENCRYPTION_KEY`)
- [ ] Volumen de PostgreSQL sobre disco cifrado (LUKS o disco cifrado del proveedor) – infraestructura
- [x] Passwords bcrypt cost 12
- [x] Secrets en variables de entorno

## 3. Auditoría (RNF-06)
- [x] Log de acciones CRUD clínicas y financieras, **incluidas lecturas y descargas** (`AuditInterceptor`)
- [x] Timestamp ISO-8601 + actor + entidad + **IP de origen** + user-agent
- [x] Log inmutable: trigger en PostgreSQL impide UPDATE/DELETE en `audit_logs`
- [x] RN-01 en BD: triggers impiden borrar notas, adendas, recetas, signos vitales, archivos y citas atendidas
- [ ] Retención de logs ≥ 5 años (política operativa)

## 4. Inyección y validación
- [x] ValidationPipe global (whitelist)
- [x] Prisma (queries parametrizadas)
- [x] DTOs con class-validator

## 5. Escaneos requeridos (criterio de aceptación)
- [x] SAST automatizado: Semgrep (`p/owasp-top-ten`, `p/nodejsscan`, `p/secrets`) en cada push – `.github/workflows/ci.yml`
- [x] DAST automatizado: OWASP ZAP baseline + API scan semanal contra staging – `.github/workflows/dast.yml`
- [x] `npm audit --audit-level=high` en CI
- [x] Revisión SAST manual (patrones de Semgrep OWASP/secrets), hallazgos corregidos:
  - **Alto:** secreto JWT por defecto fijo (`fallback-secret-change-me`) → ahora obligatorio ≥ 32 caracteres en producción
  - **Medio:** uso de `new Function` (equivalente a eval) para cargar la librería de firma → `require` diferido
  - **Bajo:** credenciales de demostración precargadas en el login → solo en desarrollo
  - Documentación Swagger desactivable en producción (`SWAGGER_ENABLED=false`)
- [x] gitleaks en CI (historial completo)
- [ ] Revisar la primera ejecución automática de Semgrep y ZAP en GitHub Actions

## 6. Pagos y facturación
- [x] Sin datos de tarjeta en el sistema (redirección a la pasarela)
- [x] Firma de webhooks verificada (Stripe HMAC-SHA256, tolerancia 5 min)
- [x] Monto confirmado validado contra el esperado
- [x] Comprobantes autorizados por el SRI inmutables (trigger)
- [x] Certificado de firma electrónica fuera del repositorio (`SRI_CERT_PATH` como secreto)

## Comandos pre-producción
```bash
npm audit --audit-level=high
npx semgrep --config=auto src/
npm run test:cov
```
