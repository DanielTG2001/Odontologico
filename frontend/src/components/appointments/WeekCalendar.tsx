'use client';

import type { Appointment, AppointmentStatus } from '@/types';
import { STATUS_COLORS, STATUS_LABELS } from '@/types';
import { cn } from '@/lib/utils';
import { localISO } from '@/lib/dates';

interface Props {
  days: string[]; // 7 fechas YYYY-MM-DD (locales)
  appointments: Appointment[];
  onSelect?: (a: Appointment) => void;
  onDayClick?: (day: string) => void;
}

export function WeekCalendar({ days, appointments, onSelect, onDayClick }: Props) {
  const today = localISO(new Date());
  const byDay: Record<string, Appointment[]> = {};
  for (const d of days) byDay[d] = [];
  for (const a of appointments) {
    const k = localISO(new Date(a.startAt));
    (byDay[k] ||= []).push(a);
  }

  return (
    <div className="card overflow-x-auto">
      <div className="grid min-w-[860px] grid-cols-7 divide-x divide-ink-100">
        {days.map((d) => {
          const date = new Date(d + 'T12:00:00');
          const isToday = d === today;
          const list = (byDay[d] || []).sort((a, b) => a.startAt.localeCompare(b.startAt));
          return (
            <div key={d} className="flex min-h-[420px] flex-col">
              <button
                type="button"
                onClick={() => onDayClick?.(d)}
                className={cn('border-b border-ink-100 px-3 py-2.5 text-left hover:bg-ink-50', isToday && 'bg-clinical-50')}
              >
                <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">
                  {date.toLocaleDateString('es-EC', { weekday: 'short' })}
                </div>
                <div className="flex items-baseline gap-2">
                  <span className={cn('text-xl font-bold', isToday ? 'text-clinical-700' : 'text-ink-800')}>
                    {date.getDate()}
                  </span>
                  {list.length > 0 && <span className="text-xs text-ink-400">{list.length} cita{list.length > 1 ? 's' : ''}</span>}
                </div>
              </button>
              <div className="flex-1 space-y-1.5 p-2">
                {list.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => onSelect?.(a)}
                    className={cn(
                      'block w-full rounded-lg border border-black/5 px-2 py-1.5 text-left text-[11.5px] leading-tight transition hover:brightness-95',
                      STATUS_COLORS[a.status as AppointmentStatus],
                    )}
                  >
                    <div className="font-mono text-[10.5px] opacity-75">
                      {new Date(a.startAt).toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' })} · {a.chair?.name}
                    </div>
                    <div className="truncate font-semibold">
                      {a.patient?.medicalHistory?.hasCriticalAlert && <span className="mr-1 text-red-600">●</span>}
                      {a.patient?.firstName} {a.patient?.lastName}
                    </div>
                    <div className="truncate opacity-75">
                      Dr/a. {a.doctor?.lastName} · {STATUS_LABELS[a.status as AppointmentStatus]}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
