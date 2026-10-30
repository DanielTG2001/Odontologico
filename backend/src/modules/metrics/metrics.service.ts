import { Injectable } from '@nestjs/common';
import { monitorEventLoopDelay } from 'perf_hooks';

/** Límites del histograma en segundos (incluye 1,5 s = objetivo RNF-01) */
export const BUCKETS = [0.05, 0.1, 0.25, 0.5, 1, 1.5, 2.5, 5, 10];
export const SLO_SECONDS = 1.5;

interface Series {
  method: string;
  route: string;
  counts: number[]; // por bucket (no acumulado) + overflow
  sum: number;
  total: number;
  errors: number; // 5xx
}

/**
 * Métricas en formato Prometheus sin dependencias (RNF-01/02/03):
 * latencia por ruta, errores 5xx, peticiones en curso (concurrencia), memoria y event loop.
 */
@Injectable()
export class MetricsService {
  private series = new Map<string, Series>();
  private statusCounts = new Map<string, number>();
  inFlight = 0;
  maxInFlight = 0;
  readonly startedAt = Date.now();
  private loop = monitorEventLoopDelay({ resolution: 20 });

  constructor() {
    this.loop.enable();
  }

  begin() {
    this.inFlight++;
    if (this.inFlight > this.maxInFlight) this.maxInFlight = this.inFlight;
  }

  end(method: string, route: string, status: number, seconds: number) {
    this.inFlight = Math.max(0, this.inFlight - 1);
    const key = `${method} ${route}`;
    let s = this.series.get(key);
    if (!s) {
      s = { method, route, counts: new Array(BUCKETS.length + 1).fill(0), sum: 0, total: 0, errors: 0 };
      this.series.set(key, s);
    }
    const idx = BUCKETS.findIndex((b) => seconds <= b);
    s.counts[idx === -1 ? BUCKETS.length : idx]++;
    s.sum += seconds;
    s.total++;
    if (status >= 500) s.errors++;
    const sk = `${method}|${route}|${status}`;
    this.statusCounts.set(sk, (this.statusCounts.get(sk) || 0) + 1);
  }

  /** Percentil aproximado (límite superior del bucket) */
  static percentile(counts: number[], total: number, p: number): number {
    if (!total) return 0;
    const target = Math.ceil(total * p);
    let acc = 0;
    for (let i = 0; i < counts.length; i++) {
      acc += counts[i];
      if (acc >= target) return i < BUCKETS.length ? BUCKETS[i] : Infinity;
    }
    return Infinity;
  }

  /** Resumen de cumplimiento para administración */
  slo() {
    const routes = [...this.series.values()]
      .map((s) => {
        const sloIdx = BUCKETS.indexOf(SLO_SECONDS);
        const withinSlo = s.counts.slice(0, sloIdx + 1).reduce((a, b) => a + b, 0);
        return {
          route: `${s.method} ${s.route}`,
          requests: s.total,
          avgMs: Math.round((s.sum / s.total) * 1000),
          p95Seconds: MetricsService.percentile(s.counts, s.total, 0.95),
          withinSloPct: Math.round((withinSlo / s.total) * 1000) / 10,
          errorRatePct: Math.round((s.errors / s.total) * 1000) / 10,
        };
      })
      .sort((a, b) => b.requests - a.requests);
    const total = routes.reduce((a, r) => a + r.requests, 0);
    const errors = [...this.series.values()].reduce((a, s) => a + s.errors, 0);
    return {
      sloSeconds: SLO_SECONDS,
      uptimeSeconds: Math.round((Date.now() - this.startedAt) / 1000),
      requests: total,
      errorRatePct: total ? Math.round((errors / total) * 10000) / 100 : 0,
      inFlight: this.inFlight,
      maxConcurrentRequests: this.maxInFlight,
      eventLoopP99Ms: Math.round(this.loop.percentile(99) / 1e6),
      routes,
    };
  }

  /** Exposición en texto Prometheus */
  render(): string {
    const esc = (v: string) => v.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const out: string[] = [];
    out.push('# HELP http_request_duration_seconds Latencia de las peticiones HTTP');
    out.push('# TYPE http_request_duration_seconds histogram');
    for (const s of this.series.values()) {
      const l = `method="${esc(s.method)}",route="${esc(s.route)}"`;
      let acc = 0;
      BUCKETS.forEach((b, i) => {
        acc += s.counts[i];
        out.push(`http_request_duration_seconds_bucket{${l},le="${b}"} ${acc}`);
      });
      out.push(`http_request_duration_seconds_bucket{${l},le="+Inf"} ${s.total}`);
      out.push(`http_request_duration_seconds_sum{${l}} ${s.sum.toFixed(6)}`);
      out.push(`http_request_duration_seconds_count{${l}} ${s.total}`);
    }
    out.push('# HELP http_requests_total Peticiones por código de estado');
    out.push('# TYPE http_requests_total counter');
    for (const [k, v] of this.statusCounts) {
      const [method, route, status] = k.split('|');
      out.push(`http_requests_total{method="${esc(method)}",route="${esc(route)}",status="${status}"} ${v}`);
    }
    const mem = process.memoryUsage();
    out.push('# TYPE http_requests_in_flight gauge', `http_requests_in_flight ${this.inFlight}`);
    out.push('# TYPE http_requests_in_flight_max gauge', `http_requests_in_flight_max ${this.maxInFlight}`);
    out.push('# TYPE process_resident_memory_bytes gauge', `process_resident_memory_bytes ${mem.rss}`);
    out.push('# TYPE nodejs_heap_used_bytes gauge', `nodejs_heap_used_bytes ${mem.heapUsed}`);
    out.push('# TYPE nodejs_eventloop_lag_p99_seconds gauge', `nodejs_eventloop_lag_p99_seconds ${(this.loop.percentile(99) / 1e9).toFixed(6)}`);
    out.push('# TYPE process_uptime_seconds gauge', `process_uptime_seconds ${Math.round(process.uptime())}`);
    return out.join('\n') + '\n';
  }
}
