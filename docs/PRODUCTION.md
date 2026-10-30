# Guía de salida a producción – SIGO-Dental

## Despliegue recomendado (RNF-02 / RNF-03)

```bash
cp deploy/.env.prod.example .env.prod      # completar secretos
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```

| Componente | Disponibilidad / rendimiento |
|------------|------------------------------|
| API × 2 réplicas | nginx reparte con `least_conn` y reintenta en la otra réplica si una falla (`proxy_next_upstream`) |
| Web × 2 réplicas | Next.js `standalone` |
| nginx | TLS 1.3, HTTP/2, gzip, rate limit en login y API, `/api/metrics` solo red interna |
| PostgreSQL | `max_connections=200`, log de consultas > 500 ms, volumen sobre disco cifrado |
| Redis | AOF, contraseña, `allkeys-lru` |
| Backups | `pg_dump` diario 02:00, cifrado AES-256, retención 14 días |
| Healthchecks | todos los servicios; `restart: unless-stopped` |

**Actualización sin caída:** `docker compose -f docker-compose.prod.yml up -d --no-deps --build api` reemplaza las
réplicas; nginx enruta a la que esté sana. Las migraciones corren antes en el servicio `migrate`.

**Pool de conexiones:** `DATABASE_URL=...&connection_limit=20&pool_timeout=10` → 2 réplicas × 20 = 40 conexiones.

**Monitoreo:** Prometheus lee `GET /api/metrics` (con `METRICS_TOKEN`); `GET /api/metrics/slo` (Admin TI) muestra p95,
% dentro de 1,5 s y errores por ruta. Alerta sugerida: `histogram_quantile(0.95, …) > 1.5` durante 5 min.
Monitoreo externo cada minuto con `loadtest/availability.js` (o Uptime Kuma) en horario 07:00–21:00.

**SLA 99,9 % (07:00–21:00):** ≈ 25 minutos de caída máxima al mes.


## Variables de entorno mínimas

```env
NODE_ENV=production
PORT=4000
DATABASE_URL=postgresql://user:pass@host:5432/sigo_dental?schema=public
REDIS_URL=redis://host:6379
JWT_SECRET=<mínimo 32 caracteres aleatorios>
JWT_EXPIRES_IN=8h
MFA_APP_NAME=SIGO-Dental
MFA_ENFORCE=true            # nunca false en producción
MFA_REQUIRED_ROLES=         # vacío = todos los roles
FRONTEND_URL=https://app.tudominio.com
CLINICAL_NOTE_LOCK_HOURS=24
S3_ENDPOINT=...
S3_ACCESS_KEY=...
S3_SECRET_KEY=...
S3_BUCKET=sigo-dental-prod
S3_REGION=us-east-1
S3_SSE=AES256               # cifrado en reposo (RNF-04)
S3_AUTO_CREATE_BUCKET=false
WHATSAPP_API_TOKEN=...
WHATSAPP_PHONE_NUMBER_ID=...
```

## Deploy

1. `npx prisma migrate deploy` (incluye los triggers de inmutabilidad RN-01 / RNF-06)
2. Build API: `npm run build`
3. Healthchecks:
   - Liveness: `GET /api/health/live`
   - Readiness: `GET /api/health/ready`
4. Reverse proxy con TLS 1.3
5. Backup diario de PostgreSQL y versionado/replicación del bucket S3
6. Bucket S3 privado (sin acceso público); el backend entrega URLs firmadas de 5 min
7. `GET /api/health` debe reportar `cache: "redis"` y `storage: "s3"` (no `memory`/`disabled`)

## Swagger
Documentación interactiva: `https://api.tudominio.com/api/docs`
