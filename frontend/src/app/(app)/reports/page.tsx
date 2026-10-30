'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { BarChart3 } from 'lucide-react';

function Bar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-ink-600">
        <span className="truncate max-w-[70%]">{label}</span>
        <span className="font-medium">{value}</span>
      </div>
      <div className="h-2 rounded-full bg-ink-100 overflow-hidden">
        <div className={'h-full rounded-full ' + color} style={{ width: pct + '%' }} />
      </div>
    </div>
  );
}

export default function ReportsPage() {
  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [dash, setDash] = useState<any>(null);
  const [byDoctor, setByDoctor] = useState<Record<string, any>>({});
  const [topProc, setTopProc] = useState<any[]>([]);
  const [inv, setInv] = useState<any>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const q = '?from=' + from + '&to=' + to;
      const [d, docs, top, inventory] = await Promise.all([
        api('/reports/dashboard' + q),
        api('/reports/appointments-by-doctor' + q),
        api('/reports/top-procedures' + q),
        api('/reports/inventory').catch(() => null),
      ]);
      setDash(d);
      setByDoctor(docs || {});
      setTopProc(Array.isArray(top) ? top : []);
      setInv(inventory);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const doctorEntries = Object.entries(byDoctor);
  const maxDoctor = Math.max(1, ...doctorEntries.map(([, v]) => v.total || 0));
  const maxProc = Math.max(1, ...topProc.map((p) => p.count || 0));

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <BarChart3 className="h-7 w-7 text-clinical-600" /> Reportes
        </h1>
        <p className="page-subtitle">KPIs del período · citas · procedimientos · inventario</p>
      </div>

      <div className="flex flex-wrap gap-2 items-end">
        <div>
          <label className="block text-xs text-ink-500 mb-1">Desde</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-lg border px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-ink-500 mb-1">Hasta</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-lg border px-3 py-2 text-sm" />
        </div>
        <button type="button" onClick={load} disabled={loading} className="btn-primary">
          {loading ? 'Cargando…' : 'Actualizar'}
        </button>
      </div>

      {error && <div className="alert-error">{error}</div>}

      {dash && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: 'Citas', value: dash.appointments?.total },
            { label: 'Atendidas', value: dash.appointments?.attended },
            { label: '% Asistencia', value: (dash.appointments?.attendanceRate ?? 0) + '%' },
            { label: 'Ingresos', value: Number(dash.revenue?.total || 0).toFixed(0) },
          ].map((c) => (
            <div key={c.label} className="rounded-xl border bg-white p-4 shadow-sm">
              <div className="text-xs text-ink-500">{c.label}</div>
              <div className="text-2xl font-semibold mt-1">{c.value ?? '—'}</div>
            </div>
          ))}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card p-5 space-y-3">
          <h2 className="font-semibold text-sm">Citas por doctor</h2>
          {doctorEntries.length === 0 && <p className="text-xs text-ink-400">Sin datos</p>}
          {doctorEntries.map(([name, data]) => (
            <Bar key={name} label={name} value={data.total || 0} max={maxDoctor} color="bg-clinical-500" />
          ))}
        </div>
        <div className="card p-5 space-y-3">
          <h2 className="font-semibold text-sm">Top procedimientos</h2>
          {topProc.length === 0 && <p className="text-xs text-ink-400">Sin datos</p>}
          {topProc.map((p) => (
            <Bar key={p.code || p.name} label={p.name} value={p.count} max={maxProc} color="bg-violet-500" />
          ))}
        </div>
      </div>

      {dash?.revenue?.byPaymentMethod && (
        <div className="rounded-xl border bg-white p-5 shadow-sm">
          <h2 className="font-semibold text-sm mb-3">Cobros por método de pago</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm">
            {Object.entries(dash.revenue.byPaymentMethod).map(([k, v]) => (
              <div key={k} className="rounded-lg bg-ink-50 px-3 py-2">
                <div className="text-xs text-ink-500">{k}</div>
                <div className="font-medium">{Number(v as number).toFixed(2)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {inv && (
        <div className="rounded-xl border bg-white p-5 shadow-sm text-sm">
          <h2 className="font-semibold mb-2">Inventario</h2>
          <p>Ítems activos: {inv.totalItems} · Bajo mínimo: {inv.lowStockCount} · Valor est.: {Number(inv.estimatedValue || 0).toFixed(2)}</p>
        </div>
      )}
    </div>
  );
}
