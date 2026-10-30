# SIGO-Dental

Sistema Integral de Gestión Odontológica y Expediente Clínico Digital

```
sigo-dental/
├── backend/          # API NestJS + Prisma
│   ├── src/
│   ├── prisma/
│   └── package.json
├── frontend/         # Next.js (App Router) + Tailwind
│   ├── src/
│   └── package.json
├── docs/             # Seguridad, UAT, Producción
├── docker-compose.yml
└── .env.example
```

**Stack:** NestJS · Next.js 15 · PostgreSQL + Prisma · Redis · MinIO/S3

## Requisitos
- Node.js >= 20
- Docker (Postgres, Redis, MinIO)

## 1. Infraestructura
```bash
cp .env.example .env
docker compose up -d        # PostgreSQL (5434), Redis (6379) y MinIO (9000 / consola 9001)
```

## 2. Backend
```bash
cd backend
cp ../.env.example .env   # o enlaza DATABASE_URL, JWT_SECRET, etc.
npm install
npx prisma generate
npx prisma migrate dev       # aplica init + auditoría inmutable + recetas/signos/archivos/adendas
npx prisma db seed
npm test                     # 261 pruebas, no necesitan BD
npm run dev
# API:     http://localhost:4000/api
# Swagger: http://localhost:4000/api/docs
```

> **Primer login:** la MFA es obligatoria. Al entrar con `admin@sigo.dental / Admin123!`
> el sistema muestra un QR para escanear con Google Authenticator o Authy.
> Para desarrollo rápido puedes poner `MFA_ENFORCE=false` en `backend/.env`.

## 3. Frontend
```bash
cd frontend
cp .env.example .env.local
# NEXT_PUBLIC_API_URL=http://localhost:4000/api
npm install
npm run dev
# → http://localhost:3000
```

## Fases
| Fase | Contenido | Estado |
|------|-----------|--------|
| 1 | Auth, Pacientes, Agenda (RN-03), Facturación, Notificaciones | ✅ |
| 2 | Odontograma (32+20, FDI+Universal), Periodontograma, SOEP, Consentimientos | ✅ |
| 3 | Inventario multi-ubicación, Honorarios, Cierre caja ciego, Reportes | ✅ |
| 4 | OpenAPI, Health, Seguridad, Tests (≥ 80 % en críticos), UAT, Producción | ✅ |
| + | MFA obligatoria, adendas SOEP, recetas, signos vitales, archivos S3, Redis | ✅ |
| + | Facturación electrónica SRI, pasarela de pagos, RF-07, métricas RNF, despliegue HA, CI SAST/DAST | ✅ |

## Odontograma (RF-03)
- Permanente (32) y temporal/decidua (20)
- Notación FDI y Universal (ADA)
- Superficies M, O, D, V, L, I
- Catálogo: caries, restauración, endodoncia, implante, sellante, corona, prótesis, ausente

## Inventario multi-ubicación
- Ubicaciones: Almacén, Sillón, Consultorio, Profesional
- Stock por ítem × ubicación + total global
- Transferencias; auto-deduct (RF-14) según sillón de la cita

## Módulos clínicos añadidos
- **Adendas SOEP** (`POST /clinical-notes/:id/addenda`): única forma de corregir una nota bloqueada; firmada con SHA-256 e inmutable.
- **Recetas** (`/prescriptions`): numeración `RX-AAAA-000001`, firma electrónica, cruce con alergias (409 si hay conflicto, salvo justificación), advertencia AINEs en anticoagulados, anulación (nunca borrado), vista imprimible.
- **Signos vitales** (`/vital-signs`): PA, FC, FR, T°, SpO₂, glucemia, peso/talla/IMC con alertas automáticas (p. ej. PA ≥ 180/110 = posponer procedimiento electivo).
- **Archivos del paciente** (`/files`): radiografías, fotos y PDFs en S3/MinIO, validación por *magic bytes*, SHA-256, cifrado SSE y descarga por URL firmada auditada.

## Facturación electrónica (SRI) y pagos en línea
- `FISCAL_PROVIDER=sri`: XML 1.1.0, clave de acceso, firma XAdES-BES, recepción/autorización y RIDE → `docs/FACTURACION_ELECTRONICA.md`
- Pasarela Payphone / Stripe (o simulada en desarrollo) con enlace por WhatsApp → `docs/PAGOS_EN_LINEA.md`

## PWA
Instalable en tablets, laptops y escritorio (botón *Instalar app*), con aviso de nueva versión y página sin conexión.
Los datos clínicos (`/api`) nunca se guardan en el dispositivo → `docs/PWA.md`

## Producción, rendimiento y CI
- `docker-compose.prod.yml`: 2 réplicas de API y web, nginx TLS 1.3, backups cifrados → `docs/PRODUCTION.md`
- Métricas Prometheus `/api/metrics` y resumen de SLO `/api/metrics/slo`
- Pruebas de carga k6 para RNF-01/02/03 → `loadtest/README.md`
- GitHub Actions: pruebas + cobertura, npm audit, Semgrep (SAST), OWASP ZAP (DAST)

## Redis
Rate limiting de login/MFA/OTP, revocación de tokens, lock del cron de recordatorios,
deduplicación de recordatorios 48 h/24 h y caché de catálogos (sillones, procedimientos).
Sin `REDIS_URL` cae a memoria (solo desarrollo). `GET /api/health` indica cuál se usa.

## Inmutabilidad (RN-01 / RNF-06)
Triggers de PostgreSQL impiden borrar o reescribir: `audit_logs`, notas SOEP bloqueadas,
adendas, recetas (solo anular), signos vitales, archivos y citas atendidas.

## Documentación
- `backend/AUTH.md` – JWT + MFA
- `docs/SECURITY_CHECKLIST.md`
- `docs/UAT_ACCEPTANCE.md`
- `docs/PRODUCTION.md`
- `CAMBIOS_RF03_INVENTARIO.md`
- `VERIFICACION_REQUERIMIENTOS.md` – estado de cada requisito del SRS
