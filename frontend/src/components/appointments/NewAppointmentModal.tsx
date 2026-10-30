'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { Chair, Patient } from '@/types';

interface Doctor {
  id: string;
  firstName: string;
  lastName: string;
  role: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  defaultDate: string;
  defaultChairId?: string;
  defaultHour?: number;
}

export function NewAppointmentModal({
  open,
  onClose,
  onCreated,
  defaultDate,
  defaultChairId,
  defaultHour,
}: Props) {
  const [chairs, setChairs] = useState<Chair[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [patientSearch, setPatientSearch] = useState('');
  const [patients, setPatients] = useState<Patient[]>([]);
  const [patientId, setPatientId] = useState('');
  const [doctorId, setDoctorId] = useState('');
  const [chairId, setChairId] = useState(defaultChairId || '');
  const [date, setDate] = useState(defaultDate);
  const [startTime, setStartTime] = useState(
    defaultHour !== undefined ? String(defaultHour).padStart(2, '0') + ':00' : '09:00',
  );
  const [duration, setDuration] = useState(30);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDate(defaultDate);
    setChairId(defaultChairId || '');
    if (defaultHour !== undefined) {
      setStartTime(String(defaultHour).padStart(2, '0') + ':00');
    }
    setError('');
    Promise.all([
      api('/chairs').catch(() => []),
      api('/auth/users?role=ODONTOLOGO').catch(() => []),
      api('/auth/users?role=ESPECIALISTA').catch(() => []),
    ]).then(([ch, od, esp]) => {
      setChairs(Array.isArray(ch) ? ch : []);
      const docs = [
        ...(Array.isArray(od) ? od : []),
        ...(Array.isArray(esp) ? esp : []),
      ];
      // unique by id
      const map = new Map(docs.map((d: Doctor) => [d.id, d]));
      setDoctors([...map.values()]);
    });
  }, [open, defaultDate, defaultChairId, defaultHour]);

  async function searchPatients() {
    if (!patientSearch.trim()) return;
    try {
      const data = await api('/patients?search=' + encodeURIComponent(patientSearch.trim()));
      setPatients(data.data || data || []);
    } catch {
      setPatients([]);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!patientId || !doctorId || !chairId) {
      setError('Paciente, doctor y sillón son obligatorios');
      return;
    }
    setLoading(true);
    try {
      const [hh, mm] = startTime.split(':').map(Number);
      const start = new Date(date + 'T12:00:00');
      start.setHours(hh, mm, 0, 0);
      const end = new Date(start.getTime() + duration * 60 * 1000);

      await api('/appointments', {
        method: 'POST',
        body: JSON.stringify({
          patientId,
          doctorId,
          chairId,
          startAt: start.toISOString(),
          endAt: end.toISOString(),
          reason: reason || undefined,
        }),
      });
      onCreated();
      onClose();
    } catch (err: any) {
      setError(err.message || 'No se pudo crear la cita (¿sillón ocupado?)');
    } finally {
      setLoading(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-xl bg-white shadow-xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-ink-100 px-5 py-4">
          <h2 className="text-lg font-semibold text-ink-900">Nueva cita</h2>
          <button type="button" onClick={onClose} className="text-ink-400 hover:text-ink-600 text-xl leading-none">×</button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 px-3 py-2 text-sm">{error}</div>}

          <div>
            <label className="label">Paciente</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={patientSearch}
                onChange={(e) => setPatientSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), searchPatients())}
                placeholder="Buscar nombre o documento"
                className="flex-1 rounded-lg border border-ink-300 px-3 py-2 text-sm"
              />
              <button type="button" onClick={searchPatients} className="btn-secondary">
                Buscar
              </button>
            </div>
            <select
              value={patientId}
              onChange={(e) => setPatientId(e.target.value)}
              className="mt-2 w-full rounded-lg border border-ink-300 px-3 py-2 text-sm"
              required
            >
              <option value="">Seleccionar paciente…</option>
              {patients.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.lastName}, {p.firstName} — {p.documentNumber}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="label">Doctor</label>
            <select
              value={doctorId}
              onChange={(e) => setDoctorId(e.target.value)}
              className="input"
              required
            >
              <option value="">Seleccionar odontólogo…</option>
              {doctors.map((d) => (
                <option key={d.id} value={d.id}>
                  Dr/a. {d.firstName} {d.lastName} ({d.role})
                </option>
              ))}
            </select>
            {doctors.length === 0 && (
              <p className="mt-1 text-xs text-amber-600">No hay usuarios con rol ODONTOLOGO/ESPECIALISTA. Regístralos en Auth.</p>
            )}
          </div>

          <div>
            <label className="label">Sillón</label>
            <select value={chairId} onChange={(e) => setChairId(e.target.value)} className="input" required>
              <option value="">Seleccionar…</option>
              {chairs.map((c) => (
                <option key={c.id} value={c.id}>{c.name} {c.location ? `(${c.location})` : ''}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="label">Fecha</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input" required />
            </div>
            <div>
              <label className="label">Hora</label>
              <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="input" required />
            </div>
            <div>
              <label className="label">Min</label>
              <select value={duration} onChange={(e) => setDuration(Number(e.target.value))} className="input">
                {[15, 30, 45, 60, 90, 120].map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="label">Motivo</label>
            <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} className="input" placeholder="Consulta, limpieza…" />
          </div>

          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onClose} className="flex-1 rounded-lg border border-ink-300 py-2.5 text-sm font-medium hover:bg-ink-50">Cancelar</button>
            <button type="submit" disabled={loading} className="flex-1 rounded-lg bg-clinical-600 hover:bg-clinical-700 text-white py-2.5 text-sm font-medium disabled:opacity-50">
              {loading ? 'Guardando…' : 'Agendar cita'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
