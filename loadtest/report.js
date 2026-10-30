#!/usr/bin/env node
/**
 * Genera REPORTE.md (evidencia RNF-01/03) a partir del --summary-export de k6.
 * Uso: node report.js resultados/<fecha>/summary.json [slo.json]
 */
const fs = require('fs');
const path = require('path');

const [summaryPath, sloPath] = process.argv.slice(2);
if (!summaryPath) {
  console.error('Uso: node report.js summary.json [slo.json]');
  process.exit(1);
}
const s = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
const m = s.metrics || {};
const ms = (v) => (typeof v === 'number' ? `${v.toFixed(0)} ms` : '—');
const pct = (v) => (typeof v === 'number' ? `${(v * 100).toFixed(3)} %` : '—');
const val = (name, key) => m[name]?.[key] ?? m[name]?.values?.[key];

/** Evalúa el umbral con los valores medidos (no depende del formato booleano de cada versión de k6) */
function evaluate(data, rule) {
  const r = rule.match(/^\s*([a-z]+(?:\(\d+(?:\.\d+)?\))?)\s*(<=|<|>=|>|==)\s*([\d.]+)\s*$/i);
  if (!r) return null;
  const [, key, op, lim] = r;
  const v = data[key] ?? data.values?.[key] ?? (key === 'rate' ? data.value ?? data.values?.rate : undefined);
  if (typeof v !== 'number') return null;
  const n = Number(lim);
  return { '<': v < n, '<=': v <= n, '>': v > n, '>=': v >= n, '==': v === n }[op];
}

const rows = [];
let allOk = true;
for (const [metric, data] of Object.entries(m)) {
  for (const rule of Object.keys(data.thresholds || {})) {
    const ok = evaluate(data, rule);
    if (ok === false) allOk = false;
    rows.push(`| \`${metric}\` | \`${rule}\` | ${ok === null ? '⚠️ sin datos' : ok ? '✅ cumple' : '❌ NO cumple'} |`);
  }
}
if (!rows.length) allOk = false;

const out = [
  '# Evidencia de pruebas de carga – SIGO-Dental',
  '',
  `- Fecha: ${new Date().toISOString()}`,
  `- Resultado global: **${allOk ? 'CUMPLE' : 'NO CUMPLE'}** RNF-01 / RNF-03`,
  `- Usuarios virtuales máximos: **${val('vus_max', 'max') ?? val('vus_max', 'value') ?? '—'}**`,
  `- Peticiones totales: ${val('http_reqs', 'count') ?? '—'} (${(val('http_reqs', 'rate') ?? 0).toFixed?.(1) ?? '—'} req/s)`,
  `- Tasa de errores: ${pct(val('http_req_failed', 'rate') ?? val('http_req_failed', 'value'))}`,
  '',
  '| Métrica | p50 | p95 | p99 | máx |',
  '|---------|-----|-----|-----|-----|',
  ...['http_req_duration', 'http_req_duration{name:expediente}', 'http_req_duration{name:odontograma}', 'expediente_completo_ms']
    .filter((k) => m[k])
    .map((k) => `| \`${k}\` | ${ms(val(k, 'med'))} | ${ms(val(k, 'p(95)'))} | ${ms(val(k, 'p(99)'))} | ${ms(val(k, 'max'))} |`),
  '',
  '## Umbrales',
  '',
  '| Métrica | Umbral | Resultado |',
  '|---------|--------|-----------|',
  ...rows,
];

if (sloPath && fs.existsSync(sloPath)) {
  const slo = JSON.parse(fs.readFileSync(sloPath, 'utf8'));
  out.push('', '## Métricas del servidor (`/api/metrics/slo`)', '', `- Concurrencia máxima atendida: ${slo.maxConcurrentRequests}`, `- Errores: ${slo.errorRatePct} %`, `- Event loop p99: ${slo.eventLoopP99Ms} ms`, '', '| Ruta | Peticiones | p95 | Dentro de 1,5 s |', '|------|-----------|-----|-----------------|');
  for (const r of (slo.routes || []).slice(0, 15)) out.push(`| \`${r.route}\` | ${r.requests} | ${r.p95Seconds} s | ${r.withinSloPct} % |`);
}

const target = path.join(path.dirname(summaryPath), 'REPORTE.md');
fs.writeFileSync(target, out.join('\n') + '\n');
console.log(`Reporte: ${target} → ${allOk ? 'CUMPLE' : 'NO CUMPLE'}`);
process.exit(allOk ? 0 : 2);
