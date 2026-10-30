'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Activity, AlertTriangle, HeartPulse, Thermometer, Wind, Droplets } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { PatientPicker } from '@/components/patients/PatientPicker';

type Form = Record<'systolic' | 'diastolic' | 'heartRate' | 'respiratoryRate' | 'temperature' | 'oxygenSaturation' | 'glucose' | 'weightKg' | 'heightCm' | 'notes', string>;
const EMPTY: Form = { systolic: '', diastolic: '', heartRate: '', respiratoryRate: '', temperature: '', oxygenSaturation: '', glucose: '', weightKg: '', heightCm: '', notes: '' };

const FIELDS: { key: keyof Form; label: string; unit: string; step?: string; placeholder: string }[] = [
  { key: 'heartRate', label: 'Frecuencia cardíaca', unit: 'lpm', placeholder: '72' },
  { key: 'respiratoryRate', label: 'Frecuencia respiratoria', unit: 'rpm', placeholder: '16' },
  { key: 'temperature', label: 'Temperatura', unit: '°C', step: '0.1', placeholder: '36.5' },
  { key: 'oxygenSaturation', label: 'SpO₂', unit: '%', placeholder: '98' },
  { key: 'glucose', label: 'Glucemia capilar', unit: 'mg/dL', placeholder: 'opcional' },
  { key: 'weightKg', label: 'Peso', unit: 'kg', step: '0.1', placeholder: 'opcional' },
  { key: 'heightCm', label: 'Talla', unit: 'cm', step: '0.1', placeholder: 'opcional' },
];

interface Alert { level: 'critical' | 'warning'; message: string }

function AlertList({ alerts }: { alerts?: Alert[] | null }) {
  if (!alerts?.length) return <span className="chip bg-emerald-50 text-emerald-700">Normal</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {alerts.map((a, i) => (
        <span key={i} className={cn('chip', a.level === 'critical' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-800')}>
          {a.level === 'critical' && <AlertTriangle className="h-3 w-3" />} {a.message}
        </span>
      ))}
    </div>
  );
}

function VitalSignsInner() {
  const params = useSearchParams();
  const [patientId, setPatientId] = useState(params.get('patientId') || '');
  const [form, setForm] = useState<Form>(EMPTY);
  const [rows, setRows] = useState<any[]>([]);
  const [last, setLast] = useState<{ alerts: Alert[]; bmi: number | null } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!patientId) { setRows([]); return; }
    try {
      const data = await api('/vital-signs/patient/' + patientId);
      setRows(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setError(err.message);
    }
  }, [patientId]);

  useEffect(() => { load(); setLast(null); }, [load]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const body: Record<string, unknown> = { patientId };
      for (const [k, v] of Object.entries(form)) {
        if (v === '') continue;
        body[k] = k === 'notes' ? v : Number(v);
      }
      const res = await api('/vital-signs', { method: 'POST', body: JSON.stringify(body) });
      setLast({ alerts: res.alerts || [], bmi: res.bmi });
      setForm(EMPTY);
      load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const critical = last?.alerts.some((a) => a.level === 'critical');

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="page-title">Signos vitales</h1>
        <p className="page-subtitle">Registro previo a la atención con alertas automáticas. Los registros no se modifican ni se borran.</p>
      </div>

      <div className="max-w-xl">
        <label className="label">Paciente</label>
        <PatientPicker value={patientId} onChange={setPatientId} />
      </div>

      {error && <div className="alert-error">{error}</div>}

      {last && (
        <div className={cn('rounded-xl border p-4', critical ? 'border-red-200 bg-red-50' : last.alerts.length ? 'border-amber-200 bg-amber-50' : 'border-emerald-200 bg-emerald-50')}>
          <div className={cn('mb-2 flex items-center gap-2 font-semibold', critical ? 'text-red-800' : last.alerts.length ? 'text-amber-900' : 'text-emerald-800')}>
            {critical ? <AlertTriangle className="h-5 w-5" /> : <HeartPulse className="h-5 w-5" />}
            {critical ? 'Valores críticos: valorar antes de cualquier procedimiento' : last.alerts.length ? 'Registro guardado con advertencias' : 'Registro guardado: valores dentro de rango'}
          </div>
          <AlertList alerts={last.alerts} />
          {last.bmi && <div className="mt-2 text-sm text-ink-600">IMC: <b>{last.bmi}</b></div>}
        </div>
      )}

      {patientId && (
        <form onSubmit={submit} className="card space-y-5 p-5">
          <h2 className="flex items-center gap-2 font-semibold text-ink-900"><Activity className="h-4 w-4 text-clinical-600" /> Nueva toma</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="sm:col-span-2 lg:col-span-1">
              <label className="label">Presión arterial</label>
              <div className="flex items-center gap-1.5">
                <input type="number" inputMode="numeric" value={form.systolic} onChange={(e) => setForm({ ...form, systolic: e.target.value })} className="input text-center font-mono" placeholder="120" />
                <span className="text-ink-400">/</span>
                <input type="number" inputMode="numeric" value={form.diastolic} onChange={(e) => setForm({ ...form, diastolic: e.target.value })} className="input text-center font-mono" placeholder="80" />
                <span className="text-xs text-ink-400">mmHg</span>
              </div>
            </div>
            {FIELDS.map((f) => (
              <div key={f.key}>
                <label className="label">{f.label}</label>
                <div className="relative">
                  <input type="number" inputMode="decimal" step={f.step || '1'} value={form[f.key]} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} className="input pr-14 font-mono" placeholder={f.placeholder} />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-ink-400">{f.unit}</span>
                </div>
              </div>
            ))}
          </div>
          <div>
            <label className="label">Observaciones</label>
            <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="input" placeholder="Ej. paciente ansioso, toma en brazo izquierdo" />
          </div>
          <div className="flex justify-end">
            <button type="submit" disabled={busy} className="btn-primary">{busy ? 'Guardando…' : 'Registrar signos vitales'}</button>
          </div>
        </form>
      )}

      {rows.length > 0 && (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-ink-50">
              <tr>
                <th className="px-4 py-3 text-left">Fecha</th>
                <th className="px-3 py-3 text-center">PA</th>
                <th className="px-3 py-3 text-center"><HeartPulse className="inline h-3.5 w-3.5" /> FC</th>
                <th className="px-3 py-3 text-center"><Wind className="inline h-3.5 w-3.5" /> FR</th>
                <th className="px-3 py-3 text-center"><Thermometer className="inline h-3.5 w-3.5" /> T°</th>
                <th className="px-3 py-3 text-center"><Droplets className="inline h-3.5 w-3.5" /> SpO₂</th>
                <th className="px-3 py-3 text-center">Gluc.</th>
                <th className="px-3 py-3 text-center">IMC</th>
                <th className="px-4 py-3 text-left">Alertas</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-ink-100">
                  <td className="px-4 py-3">
                    <div>{new Date(r.recordedAt).toLocaleString('es-EC', { dateStyle: 'short', timeStyle: 'short' })}</div>
                    <div className="text-xs text-ink-400">{r.recordedBy?.firstName} {r.recordedBy?.lastName}</div>
                  </td>
                  <td className="px-3 py-3 text-center font-mono">{r.systolic ?? '—'}/{r.diastolic ?? '—'}</td>
                  <td className="px-3 py-3 text-center font-mono">{r.heartRate ?? '—'}</td>
                  <td className="px-3 py-3 text-center font-mono">{r.respiratoryRate ?? '—'}</td>
                  <td className="px-3 py-3 text-center font-mono">{r.temperature ?? '—'}</td>
                  <td className="px-3 py-3 text-center font-mono">{r.oxygenSaturation ?? '—'}</td>
                  <td className="px-3 py-3 text-center font-mono">{r.glucose ?? '—'}</td>
                  <td className="px-3 py-3 text-center font-mono">{r.bmi ?? '—'}</td>
                  <td className="px-4 py-3"><AlertList alerts={r.alerts} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function VitalSignsPage() {
  return (
    <Suspense>
      <VitalSignsInner />
    </Suspense>
  );
}
