'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import { FDI_UPPER, FDI_LOWER } from '@/types';
import { PatientPicker } from '@/components/patients/PatientPicker';

const SITES = ['DB', 'B', 'MB', 'DL', 'L', 'ML'] as const;

export default function PeriodontogramPage() {
  const [patientId, setPatientId] = useState('');
  const [records, setRecords] = useState<any[]>([]);
  const [toothNumber, setToothNumber] = useState('11');
  const [depths, setDepths] = useState<Record<string, number>>({
    DB: 2, B: 2, MB: 2, DL: 2, L: 2, ML: 2,
  });
  const [margins, setMargins] = useState<Record<string, number>>({
    DB: 0, B: 0, MB: 0, DL: 0, L: 0, ML: 0,
  });
  const [mobility, setMobility] = useState(0);
  const [furcation, setFurcation] = useState(0);
  const [bleeding, setBleeding] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    if (!patientId.trim()) return;
    setError('');
    try {
      const data = await api('/periodontogram/patient/' + patientId.trim() + '/latest');
      setRecords(data.records || []);
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!patientId.trim()) {
      setError('ID de paciente requerido');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api('/periodontogram', {
        method: 'POST',
        body: JSON.stringify({
          patientId: patientId.trim(),
          toothNumber,
          probingDepths: depths,
          gingivalMargin: margins,
          mobility,
          furcation,
          bleedingOnProbing: bleeding,
        }),
      });
      setMessage('Registro guardado para diente ' + toothNumber);
      load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="page-title">Periodontograma</h1>
        <p className="page-subtitle">6 puntos de sondaje · margen gingival · NIC · movilidad · furca · sangrado (RF-04)</p>
      </div>

      <div className="flex flex-wrap gap-2 items-end">
        <div className="flex-1 min-w-[180px]">
          <label className="label">Paciente</label>
          <PatientPicker value={patientId} onChange={setPatientId} />
        </div>
        <button type="button" onClick={load} className="btn-primary">Cargar último examen</button>
      </div>

      {error && <div className="alert-error">{error}</div>}
      {message && <div className="alert-success">{message}</div>}

      <form onSubmit={save} className="card p-5 space-y-4">
        <div>
          <label className="label">Diente (FDI)</label>
          <select value={toothNumber} onChange={(e) => setToothNumber(e.target.value)} className="rounded-lg border border-ink-300 px-3 py-2 text-sm">
            {[...FDI_UPPER, ...FDI_LOWER].map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr>
                <th className="w-44 py-2 text-left">Sitio</th>
                {SITES.map((s) => <th key={s} className="py-2 text-center font-mono">{s}</th>)}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="py-1.5 pr-2 text-ink-600">Profundidad sondaje (PS, mm)</td>
                {SITES.map((s) => (
                  <td key={s} className="px-1 py-1.5">
                    <input type="number" min={0} max={15} value={depths[s]}
                      onChange={(e) => setDepths((d) => ({ ...d, [s]: Number(e.target.value) || 0 }))}
                      className={'w-full rounded-md border px-1 py-1.5 text-center font-mono text-sm ' + (depths[s] >= 4 ? 'text-red-600 font-semibold' : '')} />
                  </td>
                ))}
              </tr>
              <tr>
                <td className="py-1.5 pr-2 text-ink-600">Margen gingival (MG, mm)<div className="text-[11px] text-ink-400">negativo = recesión</div></td>
                {SITES.map((s) => (
                  <td key={s} className="px-1 py-1.5">
                    <input type="number" min={-15} max={15} value={margins[s]}
                      onChange={(e) => setMargins((d) => ({ ...d, [s]: Number(e.target.value) || 0 }))}
                      className="w-full rounded-md border px-1 py-1.5 text-center font-mono text-sm" />
                  </td>
                ))}
              </tr>
              <tr className="bg-clinical-50/60">
                <td className="py-2 pr-2 font-semibold text-clinical-800">NIC calculado (PS − MG)</td>
                {SITES.map((s) => (
                  <td key={s} className="py-2 text-center font-mono font-bold text-clinical-800">{depths[s] - margins[s]}</td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-xs text-ink-500 mb-1">Movilidad (0-3)</label>
            <input type="number" min={0} max={3} value={mobility} onChange={(e) => setMobility(Number(e.target.value))} className="input" />
          </div>
          <div>
            <label className="block text-xs text-ink-500 mb-1">Furca (0-3)</label>
            <input type="number" min={0} max={3} value={furcation} onChange={(e) => setFurcation(Number(e.target.value))} className="input" />
          </div>
          <label className="flex items-end gap-2 text-sm pb-2">
            <input type="checkbox" checked={bleeding} onChange={(e) => setBleeding(e.target.checked)} />
            Sangrado al sondaje
          </label>
        </div>
        <button type="submit" disabled={busy} className="btn-primary px-5">
          {busy ? 'Guardando…' : 'Guardar diente'}
        </button>
      </form>

      {records.length > 0 && (
        <div className="card overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-ink-50">
              <tr>
                <th className="px-3 py-2 text-left">Diente</th>
                {SITES.map((s) => (
                  <th key={s} className="px-2 py-2">{s}</th>
                ))}
                <th className="px-2 py-2">NIC máx</th>
                <th className="px-2 py-2">Mob</th>
                <th className="px-2 py-2">BOP</th>
              </tr>
            </thead>
            <tbody>
              {records.map((r) => (
                <tr key={r.id} className="border-t border-ink-100">
                  <td className="px-3 py-2 font-medium">{r.toothNumber}</td>
                  {SITES.map((s) => (
                    <td key={s} className="px-2 py-2 text-center">{r.probingDepths?.[s] ?? '—'}</td>
                  ))}
                  <td className="px-2 py-2 text-center font-mono">{r.clinicalAttachmentLevel ? Math.max(...Object.values(r.clinicalAttachmentLevel as Record<string, number>)) : '—'}</td>
                  <td className="px-2 py-2 text-center">{r.mobility ?? 0}</td>
                  <td className="px-2 py-2 text-center">{r.bleedingOnProbing ? 'Sí' : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
