/**
 * RNF-02: monitoreo sintético de disponibilidad (07:00–21:00).
 * Ejecutar con un monitor externo (k6 cloud, cron, Uptime Kuma) cada minuto.
 * Uptime 99,9 % en 14 h/día ≈ máximo 25 min de caída al mes.
 */
import http from 'k6/http';
import { check } from 'k6';

const BASE = __ENV.BASE_URL || 'http://localhost:4000/api';
export const options = { vus: 1, iterations: 1, thresholds: { checks: ['rate==1'] } };

export default function () {
  const ready = http.get(`${BASE}/health/ready`, { timeout: '5s' });
  check(ready, { 'ready 200': (r) => r.status === 200 });
  const h = http.get(`${BASE}/health`, { timeout: '5s' });
  check(h, {
    'db up': (r) => r.json('checks.database') === 'up',
    'redis activo': (r) => r.json('checks.cache') === 'redis',
    's3 activo': (r) => r.json('checks.storage') === 's3',
  });
}
