'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

interface Doctor {
  id: string;
  firstName: string;
  lastName: string;
}

export default function SettlementsPage() {
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [doctorId, setDoctorId] = useState('');
  const [periodFrom, setPeriodFrom] = useState('');
  const [periodTo, setPeriodTo] = useState('');
  const [settlements, setSettlements] = useState<any[]>([]);
  const [current, setCurrent] = useState<any>(null);
  const [ruleType, setRuleType] = useState('PERCENTAGE');
  const [ruleValue, setRuleValue] = useState(40);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    Promise.all([
      api('/auth/users?role=ODONTOLOGO').catch(() => []),
      api('/auth/users?role=ESPECIALISTA').catch(() => []),
    ]).then(([a, b]) => {
      const map = new Map([...a, ...b].map((d: Doctor) => [d.id, d]));
      setDoctors([...map.values()]);
    });
  }, []);

  async function loadSettlements() {
    if (!doctorId) return;
    try {
      const data = await api('/settlements/doctor/' + doctorId);
      setSettlements(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function saveRule(e: React.FormEvent) {
    e.preventDefault();
    if (!doctorId) return;
    setBusy(true);
    setError('');
    try {
      await api('/settlements/rules', {
        method: 'POST',
        body: JSON.stringify({ doctorId, type: ruleType, value: ruleValue }),
      });
      setMessage('Regla de comisión guardada');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function generate(e: React.FormEvent) {
    e.preventDefault();
    if (!doctorId || !periodFrom || !periodTo) {
      setError('Doctor y período requeridos');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const s = await api('/settlements', {
        method: 'POST',
        body: JSON.stringify({ doctorId, periodFrom, periodTo }),
      });
      setCurrent(s);
      setMessage('Liquidación generada');
      loadSettlements();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function approve(id: string) {
    await api('/settlements/' + id + '/approve', { method: 'PATCH' });
    setMessage('Aprobada');
    loadSettlements();
  }

  async function markPaid(id: string) {
    await api('/settlements/' + id + '/paid', { method: 'PATCH' });
    setMessage('Marcada como pagada');
    loadSettlements();
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="page-title">Liquidación de honorarios</h1>
        <p className="page-subtitle">Comisiones por % / fijo / % neto (RF-13)</p>
      </div>

      {error && <div className="alert-error">{error}</div>}
      {message && <div className="alert-success">{message}</div>}

      <div>
        <label className="label">Doctor</label>
        <select value={doctorId} onChange={(e) => { setDoctorId(e.target.value); setCurrent(null); }} className="w-full max-w-md rounded-lg border px-3 py-2 text-sm">
          <option value="">Seleccionar…</option>
          {doctors.map((d) => (
            <option key={d.id} value={d.id}>Dr/a. {d.firstName} {d.lastName}</option>
          ))}
        </select>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <form onSubmit={saveRule} className="card p-4 space-y-3">
          <h2 className="font-semibold text-sm">Regla de comisión</h2>
          <select value={ruleType} onChange={(e) => setRuleType(e.target.value)} className="input">
            <option value="PERCENTAGE">% del honorario</option>
            <option value="FIXED">Monto fijo</option>
            <option value="PERCENTAGE_AFTER_COST">% después de costos</option>
          </select>
          <input type="number" min={0} step="0.01" value={ruleValue} onChange={(e) => setRuleValue(Number(e.target.value))} className="input" />
          <button type="submit" disabled={busy || !doctorId} className="w-full rounded-lg bg-clinical-600 text-white py-2 text-sm disabled:opacity-50">Guardar regla</button>
        </form>

        <form onSubmit={generate} className="card p-4 space-y-3">
          <h2 className="font-semibold text-sm">Generar liquidación</h2>
          <input type="date" value={periodFrom} onChange={(e) => setPeriodFrom(e.target.value)} className="input" required />
          <input type="date" value={periodTo} onChange={(e) => setPeriodTo(e.target.value)} className="input" required />
          <button type="submit" disabled={busy || !doctorId} className="w-full rounded-lg border border-clinical-600 text-clinical-700 py-2 text-sm font-medium disabled:opacity-50">Calcular período</button>
        </form>
      </div>

      {current && (
        <div className="rounded-xl border border-clinical-200 bg-clinical-50 p-5 space-y-2">
          <h2 className="font-semibold">Liquidación generada</h2>
          <p className="text-sm">Honorarios: <strong>{Number(current.totalFees).toFixed(2)}</strong></p>
          <p className="text-sm">Comisión: <strong>{Number(current.totalCommission).toFixed(2)}</strong></p>
          <p className="text-sm">Estado: {current.status}</p>
          <p className="text-xs text-ink-500">{current.items?.length || 0} ítems de procedimientos</p>
        </div>
      )}

      <div>
        <button type="button" onClick={loadSettlements} disabled={!doctorId} className="text-sm text-clinical-600 hover:underline mb-2">
          Ver liquidaciones del doctor
        </button>
        <div className="space-y-2">
          {settlements.map((s) => (
            <div key={s.id} className="rounded-lg border bg-white p-3 text-sm flex flex-wrap justify-between gap-2">
              <div>
                {String(s.periodFrom).slice(0, 10)} → {String(s.periodTo).slice(0, 10)}
                {' · '}Comisión {Number(s.totalCommission).toFixed(2)}
                {' · '}<span className="font-medium">{s.status}</span>
              </div>
              <div className="flex gap-2">
                {s.status === 'DRAFT' && (
                  <button type="button" onClick={() => approve(s.id)} className="text-xs rounded border px-2 py-1 hover:bg-ink-50">Aprobar</button>
                )}
                {s.status === 'APPROVED' && (
                  <button type="button" onClick={() => markPaid(s.id)} className="text-xs rounded bg-emerald-600 text-white px-2 py-1">Marcar pagada</button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
