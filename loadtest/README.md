# Pruebas de rendimiento (RNF-01 / RNF-02 / RNF-03)

Requiere [k6](https://k6.io). Ejecutar contra **staging** (nunca contra producción en horario clínico).

| Script | Requisito | Qué verifica |
|--------|-----------|--------------|
| `smoke.js` | — | 10 usuarios, 1 min. Para CI después de cada despliegue |
| `rnf-load.js` | RNF-01, RNF-03 | 150 usuarios concurrentes 10 min. p95 del expediente + odontograma < 1,5 s, errores < 0,1 % |
| `availability.js` | RNF-02 | Chequeo sintético cada minuto (BD, Redis, S3) |

## Ejecución en staging (un comando)

```bash
# 1. Una sola vez: secreto MFA y datos de prueba en la BD de staging
export LOADTEST_MFA_SECRET=$(node loadtest/totp.js --new)
export LOADTEST_PASSWORD='una-clave-larga-de-prueba'
cd backend && npx tsx prisma/seed-loadtest.ts && cd ..     # 200 pacientes con odontograma, notas y citas

# 2. Verificación rápida (5 min) y luego la corrida completa (13 min)
BASE_URL=https://staging.tu-clinica.ec/api PROFILE=short ./loadtest/run-staging.sh
BASE_URL=https://staging.tu-clinica.ec/api ./loadtest/run-staging.sh
```

El script inicia sesión con MFA (TOTP), toma los pacientes de carga, ejecuta k6 (local o en Docker) y deja en
`loadtest/resultados/<fecha>/`:

- `summary.json` y `k6.log` – salida cruda de k6
- `slo.json` – métricas del servidor (si se pasa `ADMIN_TOKEN`)
- **`REPORTE.md` – evidencia para el ingeniero** (CUMPLE / NO CUMPLE por umbral)

**¿No tienes staging?** Levanta uno en tu PC con el despliegue de producción:

```bash
DOMAIN=localhost ./deploy/certs-selfsigned.sh
cp deploy/.env.prod.example .env.prod      # DOMAIN=localhost, TLS_CERT_DIR=./deploy/certs, MFA_ENFORCE=true
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
BASE_URL=https://localhost/api ./loadtest/run-staging.sh
```
(Los resultados en una PC no equivalen al servidor real, pero sirven para detectar cuellos de botella.)

Ejecución manual:

```bash
TOKEN=$(BASE_URL=https://staging/api EMAIL=carga@sigo.dental PASSWORD=*** MFA=$(node totp.js $LOADTEST_MFA_SECRET) ./get-token.sh)
k6 run -e BASE_URL=https://staging/api -e TOKEN=$TOKEN -e PATIENT_IDS=ckx1,ckx2,ckx3 rnf-load.js
```

Durante la prueba, `GET /api/metrics/slo` (Admin TI) muestra por ruta el p95, el % de peticiones
dentro de 1,5 s, la tasa de errores y la concurrencia máxima alcanzada en cada réplica.

**Importante:** nginx limita `/api` a 30 req/s por IP pública. Ejecuta k6 desde la red interna
de staging (10.x / 172.16.x / 192.168.x, que están exentas) o 150 usuarios desde una sola IP serán rechazados con 503.

**Evidencia para el acta de aceptación:** guardar la salida de k6 (`k6 run --summary-export=resultado.json`)
y el JSON de `/api/metrics/slo`.
