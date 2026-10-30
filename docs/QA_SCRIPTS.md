# Scripts de calidad (Fase 4)

## Tests
```bash
cd backend
npx prisma generate      # las pruebas usan los enums generados por Prisma
npm test                 # 28 suites / 261 pruebas
npm run test:cov         # falla si la cobertura de los módulos críticos baja del 80 %
npm run test:cov:all     # informe de cobertura de todo src/ (sin umbral)
```
Objetivo SRS 8.2: ≥ 80 % en endpoints críticos. Los módulos incluidos en el umbral están
listados en `backend/jest.config.js` (`CRITICAL`). Las pruebas usan un Prisma simulado
(`src/test-utils/mocks.ts`) y el fallback en memoria de Redis, así que **no necesitan
base de datos, Redis ni S3**.

## Auditoría de dependencias
```bash
cd backend && npm audit --audit-level=high
cd frontend && npm audit --audit-level=high
```

## SAST (ejemplo Semgrep)
```bash
docker run --rm -v "$PWD:/src" semgrep/semgrep semgrep scan --config p/owasp-top-ten --config p/secrets backend/src frontend/src
```

## DAST (OWASP ZAP) contra staging
```bash
# Con API levantada en staging:
docker run -t ghcr.io/zaproxy/zaproxy:stable zap-baseline.py -t https://staging.tudominio.com   # la imagen owasp/zap2docker-stable está descontinuada
```

## Carga (k6)
Scripts listos en `loadtest/` (ver `loadtest/README.md`): `smoke.js`, `rnf-load.js` (RNF-01/03) y
`availability.js` (RNF-02).

### Ejemplo mínimo
```js
// load-test.js — 150 VUs
import http from 'k6/http';
import { sleep } from 'k6';
export const options = { vus: 150, duration: '2m' };
export default function () {
  http.get('https://api.tudominio.com/api/health');
  sleep(1);
}
```
```bash
k6 run load-test.js
```

## Cron de recordatorios
Activo por defecto cada hora (`RemindersCron`). Usa un lock en Redis (`cron:reminders`)
para que con varias réplicas solo una lo ejecute, y claves `reminder:48h:<id>` /
`reminder:24h:<id>` para no enviar el mismo recordatorio dos veces.
Desactivar: `DISABLE_REMINDER_CRON=true`
Tokens: `WHATSAPP_API_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`

## Timbrado fiscal
Endpoint: `POST /api/fiscal/invoices/:id/stamp`
`FISCAL_PROVIDER=mock` (simulado) o `FISCAL_PROVIDER=sri` (SRI Ecuador, real). Ver `docs/FACTURACION_ELECTRONICA.md`.
