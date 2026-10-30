/** Smoke test rápido (1 min, 10 usuarios) para ejecutar en CI tras cada despliegue. */
import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE = __ENV.BASE_URL || 'http://localhost:4000/api';
export const options = { vus: 10, duration: '1m', thresholds: { http_req_failed: ['rate<0.01'], http_req_duration: ['p(95)<800'] } };

export default function () {
  const r = http.get(`${BASE}/health`);
  check(r, { 'health ok': (x) => x.status === 200 && x.json('checks.database') === 'up' });
  sleep(1);
}
