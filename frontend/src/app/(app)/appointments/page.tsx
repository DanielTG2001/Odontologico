'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import type { Appointment, AppointmentStatus, Chair } from '@/types';
import { STATUS_LABELS, STATUS_COLORS } from '@/types';
import { DayCalendar } from '@/components/appointments/DayCalendar';
import { WeekCalendar } from '@/components/appointments/WeekCalendar';
import { NewAppointmentModal } from '@/components/appointments/NewAppointmentModal';
import { cn } from '@/lib/utils';
import { addDays, dayRange, localISO, weekDays } from '@/lib/dates';
import { AlertTriangle, ChevronLeft, ChevronRight, Plus, RefreshCw, X, Package } from 'lucide-react';

type View = 'day' | 'week';
interface Doctor { id: string; firstName: string; lastName: string }

export default function AppointmentsPage() {
  const [date, setDate] = useState(() => localISO());
  const [view, setView] = useState<View>('day');
  const [chairs, setChairs] = useState<Chair[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [chairFilter, setChairFilter] = useState('');
  const [doctorFilter, setDoctorFilter] = useState('');
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [selected, setSelected] = useState<Appointment | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [slotChair, setSlotChair] = useState<string | undefined>();
  const [slotHour, setSlotHour] = useState<number | undefined>();

  const days = useMemo(() => weekDays(date), [date]);

  useEffect(() => {
    Promise.all([
      api('/chairs').catch(() => []),
      api('/auth/users?role=ODONTOLOGO').catch(() => []),
      api('/auth/users?role=ESPECIALISTA').catch(() => []),
    ]).then(([c, o, e]) => {
      setChairs(Array.isArray(c) ? c : []);
      setDoctors([...(Array.isArray(o) ? o : []), ...(Array.isArray(e) ? e : [])]);
    });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { from } = dayRange(view === 'day' ? date : days[0]);
      const { to } = dayRange(view === 'day' ? date : days[6]);
      const qs = new URLSearchParams({ from, to });
      if (chairFilter) qs.set('chairId', chairFilter);
      if (doctorFilter) qs.set('doctorId', doctorFilter);
      const data = await api('/appointments?' + qs.toString());
      setAppointments(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setError(err.message || 'Error al cargar agenda');
    } finally {
      setLoading(false);
    }
  }, [date, view, days, chairFilter, doctorFilter]);

  useEffect(() => { load(); }, [load]);

  function openNew(chairId?: string, hour?: number) {
    setSlotChair(chairId);
    setSlotHour(hour);
    setModalOpen(true);
  }

  async function changeStatus(status: AppointmentStatus) {
    if (!selected) return;
    try {
      const updated = await api('/appointments/' + selected.id + '/status', {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      setSelected({ ...selected, ...updated });
      const ded = updated?.inventoryDeduction?.deductions;
      if (Array.isArray(ded) && ded.length) {
        const ok = ded.filter((d: any) => d.ok).length;
        setNotice(`Insumos descontados automáticamente: ${ok}/${ded.length} (RF‑14)`);
      }
      load();
    } catch (err: any) {
      setError(err.message);
    }
  }

  const step = view === 'day' ? 1 : 7;
  const visibleChairs = chairFilter ? chairs.filter((c) => c.id === chairFilter) : chairs;

  const title =
    view === 'day'
      ? new Date(date + 'T12:00:00').toLocaleDateString('es-EC', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
      : `${new Date(days[0] + 'T12:00:00').toLocaleDateString('es-EC', { day: 'numeric', month: 'short' })} – ${new Date(days[6] + 'T12:00:00').toLocaleDateString('es-EC', { day: 'numeric', month: 'short', year: 'numeric' })}`;

  const counts = appointments.reduce<Record<string, number>>((acc, a) => {
    acc[a.status] = (acc[a.status] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="page-title">Agenda</h1>
          <p className="page-subtitle capitalize">{title}</p>
        </div>
        <button type="button" onClick={() => openNew()} className="btn-primary">
          <Plus className="h-4 w-4" /> Nueva cita
        </button>
      </div>

      <div className="card flex flex-wrap items-center gap-2 p-2.5">
        <div className="flex rounded-lg bg-ink-100 p-0.5">
          {(['day', 'week'] as View[]).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={cn('rounded-md px-3.5 py-1.5 text-sm font-semibold', view === v ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500 hover:text-ink-800')}
            >
              {v === 'day' ? 'Día' : 'Semana'}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => setDate((d) => addDays(d, -step))} className="btn-secondary px-2.5" aria-label="Anterior">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => setDate(localISO())} className="btn-secondary px-3">Hoy</button>
          <button type="button" onClick={() => setDate((d) => addDays(d, step))} className="btn-secondary px-2.5" aria-label="Siguiente">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} className="rounded-lg border px-3 py-2 text-sm" />
        <div className="mx-1 hidden h-6 w-px bg-ink-200 md:block" />
        <select value={chairFilter} onChange={(e) => setChairFilter(e.target.value)} className="rounded-lg border px-3 py-2 text-sm">
          <option value="">Todos los sillones</option>
          {chairs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={doctorFilter} onChange={(e) => setDoctorFilter(e.target.value)} className="rounded-lg border px-3 py-2 text-sm">
          <option value="">Todos los profesionales</option>
          {doctors.map((d) => <option key={d.id} value={d.id}>Dr/a. {d.firstName} {d.lastName}</option>)}
        </select>
        <button type="button" onClick={load} className="btn-secondary ml-auto px-2.5" title="Actualizar">
          <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
        </button>
      </div>

      {appointments.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(STATUS_LABELS) as AppointmentStatus[]).filter((s) => counts[s]).map((s) => (
            <span key={s} className={cn('chip', STATUS_COLORS[s])}>{STATUS_LABELS[s]} · {counts[s]}</span>
          ))}
        </div>
      )}

      {error && <div className="alert-error">{error}</div>}
      {notice && (
        <div className="alert-success flex items-center gap-2">
          <Package className="h-4 w-4" /> {notice}
          <button onClick={() => setNotice('')} className="ml-auto opacity-60 hover:opacity-100"><X className="h-4 w-4" /></button>
        </div>
      )}

      {view === 'week' ? (
        <WeekCalendar
          days={days}
          appointments={appointments}
          onSelect={setSelected}
          onDayClick={(d) => { setDate(d); setView('day'); }}
        />
      ) : visibleChairs.length === 0 && !loading ? (
        <div className="card border-dashed p-12 text-center text-ink-400">
          No hay sillones configurados. Créalos desde la API (POST /api/chairs) o el seed.
        </div>
      ) : (
        <>
          <p className="text-xs text-ink-400">Toca un hueco vacío del calendario para agendar en ese sillón y hora.</p>
          <DayCalendar
            date={date}
            chairs={visibleChairs}
            appointments={appointments}
            onSelect={setSelected}
            onSlotClick={(chairId, hour) => openNew(chairId, hour)}
          />
        </>
      )}

      <NewAppointmentModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={load}
        defaultDate={date}
        defaultChairId={slotChair}
        defaultHour={slotHour}
      />

      {selected && (
        <div className="fixed inset-0 z-50 flex justify-end bg-ink-950/30 backdrop-blur-[2px]" onClick={() => setSelected(null)}>
          <div className="h-full w-full max-w-md animate-fade-up overflow-y-auto bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            {selected.patient?.medicalHistory?.hasCriticalAlert && (
              <div className="flex items-center gap-2 bg-red-600 px-6 py-3 text-sm font-semibold text-white">
                <AlertTriangle className="h-5 w-5" />
                {selected.patient.medicalHistory.criticalAlertReason || 'Alerta médica'}
              </div>
            )}
            <div className="space-y-6 p-6">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wider text-ink-400">Cita</div>
                  <h2 className="mt-0.5 text-xl font-bold text-ink-900">
                    {selected.patient?.firstName} {selected.patient?.lastName}
                  </h2>
                </div>
                <button type="button" onClick={() => setSelected(null)} className="rounded-lg p-1.5 text-ink-400 hover:bg-ink-50 hover:text-ink-700">
                  <X className="h-5 w-5" />
                </button>
              </div>

              <dl className="grid grid-cols-2 gap-x-4 gap-y-4 text-sm">
                <div>
                  <dt className="text-xs text-ink-400">Horario</dt>
                  <dd className="font-mono font-medium">
                    {new Date(selected.startAt).toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' })} – {new Date(selected.endAt).toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' })}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-ink-400">Estado</dt>
                  <dd><span className={cn('chip', STATUS_COLORS[selected.status])}>{STATUS_LABELS[selected.status]}</span></dd>
                </div>
                <div>
                  <dt className="text-xs text-ink-400">Profesional</dt>
                  <dd className="font-medium">Dr/a. {selected.doctor?.firstName} {selected.doctor?.lastName}</dd>
                </div>
                <div>
                  <dt className="text-xs text-ink-400">Sillón</dt>
                  <dd className="font-medium">{selected.chair?.name}</dd>
                </div>
                {selected.reason && (
                  <div className="col-span-2">
                    <dt className="text-xs text-ink-400">Motivo</dt>
                    <dd>{selected.reason}</dd>
                  </div>
                )}
              </dl>

              <div>
                <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-400">Cambiar estado</div>
                <div className="grid grid-cols-2 gap-1.5">
                  {(Object.keys(STATUS_LABELS) as AppointmentStatus[]).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => changeStatus(s)}
                      className={cn(
                        'rounded-lg border px-3 py-2 text-left text-sm font-medium',
                        selected.status === s ? 'border-clinical-500 bg-clinical-50 text-clinical-800 ring-2 ring-clinical-500/15' : 'border-ink-100 hover:bg-ink-50',
                      )}
                    >
                      {STATUS_LABELS[s]}
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-xs text-ink-400">Al marcar “Atendido” se descuentan los insumos de la receta de cada procedimiento.</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
