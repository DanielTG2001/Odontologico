/**
 * Prueba de carga RNF-01 / RNF-03 – SIGO-Dental
 *
 *   k6 run -e BASE_URL=https://staging.tu-clinica.ec/api -e TOKEN=<jwt> -e PATIENT_IDS=id1,id2,id3 loadtest/rnf-load.js
 *
 * TOKEN: token de un usuario de prueba (el login tiene rate limit por IP, por eso no se
 * hace login en cada usuario virtual). Obtenerlo con loadtest/get-token.sh.
 *
 * Criterios (fallan la prueba si no se cumplen):
 *  - RNF-01: expediente clínico + odontograma: p95 < 1500 ms
 *  - RNF-03: 150 usuarios concurrentes sin degradación (p95 global < 1500 ms, errores < 0,1 %)
 */
import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Trend } from 'k6/metrics';

const BASE = __ENV.BASE_URL || 'http://localhost:4000/api';
// Certificado autofirmado en staging local
const insecureSkipTLSVerify = __ENV.INSECURE === '1' || BASE.includes('localhost');
const TOKEN = __ENV.TOKEN;
const PATIENTS = (__ENV.PATIENT_IDS || '').split(',').filter(Boolean);
const headers = { Authorization: `Bearer ${TOKEN}`, 'Accept-Encoding': 'gzip' };

const expediente = new Trend('expediente_completo_ms', true);

export const options = {
  insecureSkipTLSVerify,
  scenarios: {
    // Rampa hasta 150 usuarios concurrentes y se mantiene 10 min
    clinica: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 150 },
        { duration: '10m', target: 150 },
        { duration: '1m', target: 0 },
      ],
      gracefulRampDown: '30s',
    },
  },
  thresholds: {
    'http_req_failed': ['rate<0.001'],
    'http_req_duration': ['p(95)<1500'],
    'http_req_duration{name:expediente}': ['p(95)<1500'],
    'http_req_duration{name:odontograma}': ['p(95)<1500'],
    'expediente_completo_ms': ['p(95)<1500'],
  },
};

export function setup() {
  if (!TOKEN) throw new Error('Defina -e TOKEN=<jwt>');
  if (!PATIENTS.length) throw new Error('Defina -e PATIENT_IDS=id1,id2');
}

export default function () {
  const pid = PATIENTS[Math.floor(Math.random() * PATIENTS.length)];
  const today = new Date().toISOString().slice(0, 10);

  group('recepcion', () => {
    const r = http.get(`${BASE}/appointments?from=${today}T05:00:00.000Z&to=${today}T23:59:59.000Z`, { headers, tags: { name: 'agenda' } });
    check(r, { 'agenda 200': (x) => x.status === 200 });
    http.get(`${BASE}/patients?search=a&limit=20`, { headers, tags: { name: 'busqueda' } });
  });

  group('expediente', () => {
    // El expediente se carga en paralelo como lo hace el frontend
    const t0 = Date.now();
    const res = http.batch([
      ['GET', `${BASE}/patients/${pid}`, null, { headers, tags: { name: 'expediente' } }],
      ['GET', `${BASE}/odontogram/patient/${pid}?notation=FDI`, null, { headers, tags: { name: 'odontograma' } }],
      ['GET', `${BASE}/clinical-notes/patient/${pid}`, null, { headers, tags: { name: 'notas' } }],
      ['GET', `${BASE}/appointments?patientId=${pid}`, null, { headers, tags: { name: 'citas_paciente' } }],
    ]);
    expediente.add(Date.now() - t0);
    check(res[0], { 'paciente 200': (x) => x.status === 200 });
    check(res[1], { 'odontograma 200': (x) => x.status === 200 });
  });

  sleep(1 + Math.random() * 2); // tiempo de lectura del usuario
}
