'use client';

import { useMemo } from 'react';
import type { Appointment, Chair, AppointmentStatus } from '@/types';
import { STATUS_COLORS, STATUS_LABELS } from '@/types';
import { cn } from '@/lib/utils';

const HOURS = Array.from({ length: 14 }, (_, i) => i + 7); // 07:00 – 20:00
const SLOT_H = 64; // px per hour

function parseHour(iso: string) {
  const d = new Date(iso);
  return d.getHours() + d.getMinutes() / 60;
}

interface Props {
  date: string; // YYYY-MM-DD
  chairs: Chair[];
  appointments: Appointment[];
  onSelect?: (appt: Appointment) => void;
  onSlotClick?: (chairId: string, hour: number) => void;
}

export function DayCalendar({ date, chairs, appointments, onSelect, onSlotClick }: Props) {
  const byChair = useMemo(() => {
    const map: Record<string, Appointment[]> = {};
    for (const c of chairs) map[c.id] = [];
    for (const a of appointments) {
      if (!map[a.chairId]) map[a.chairId] = [];
      map[a.chairId].push(a);
    }
    return map;
  }, [chairs, appointments]);

  const totalHeight = HOURS.length * SLOT_H;

  return (
    <div className="card overflow-x-auto">
      <div className="min-w-[720px]">
        {/* Header */}
        <div className="grid border-b border-ink-200" style={{ gridTemplateColumns: `64px repeat(${chairs.length}, 1fr)` }}>
          <div className="p-2 text-xs text-ink-400 font-medium">Hora</div>
          {chairs.map((c) => (
            <div key={c.id} className="p-2 text-center border-l border-ink-100">
              <div className="text-sm font-semibold text-ink-800">{c.name}</div>
              {c.location && <div className="text-[11px] text-ink-400">{c.location}</div>}
            </div>
          ))}
        </div>

        {/* Body */}
        <div className="grid relative" style={{ gridTemplateColumns: `64px repeat(${chairs.length}, 1fr)`, height: totalHeight }}>
          {/* Hour labels + lines */}
          <div className="relative">
            {HOURS.map((h, i) => (
              <div
                key={h}
                className="absolute left-0 right-0 border-t border-ink-100 text-[11px] text-ink-400 pl-2"
                style={{ top: i * SLOT_H }}
              >
                {String(h).padStart(2, '0')}:00
              </div>
            ))}
          </div>

          {chairs.map((chair) => (
            <div key={chair.id} className="relative border-l border-ink-100">
              {/* Grid lines + click zones */}
              {HOURS.map((h, i) => (
                <div
                  key={h}
                  className="absolute left-0 right-0 border-t border-ink-50 hover:bg-clinical-50/50 cursor-pointer transition"
                  style={{ top: i * SLOT_H, height: SLOT_H }}
                  onClick={() => onSlotClick?.(chair.id, h)}
                />
              ))}

              {/* Appointments */}
              {(byChair[chair.id] || []).map((appt) => {
                const start = parseHour(appt.startAt);
                const end = parseHour(appt.endAt);
                const top = (start - HOURS[0]) * SLOT_H;
                const height = Math.max((end - start) * SLOT_H - 4, 28);
                if (start < HOURS[0] || start > HOURS[HOURS.length - 1] + 1) return null;

                return (
                  <button
                    key={appt.id}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelect?.(appt);
                    }}
                    className={cn(
                      'absolute left-1 right-1 rounded-md px-1.5 py-1 text-left text-[11px] leading-tight shadow-sm border border-black/5 overflow-hidden hover:brightness-95 transition z-10',
                      STATUS_COLORS[appt.status as AppointmentStatus] || 'bg-ink-100',
                    )}
                    style={{ top: top + 2, height }}
                    title={`${appt.patient?.firstName} ${appt.patient?.lastName}`}
                  >
                    <div className="font-semibold truncate">
                      {appt.patient?.firstName} {appt.patient?.lastName}
                    </div>
                    <div className="opacity-80 truncate">
                      {new Date(appt.startAt).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}
                      {' – '}
                      {STATUS_LABELS[appt.status as AppointmentStatus]}
                    </div>
                    {appt.patient?.medicalHistory?.hasCriticalAlert && (
                      <span className="inline-block mt-0.5 rounded bg-red-500 text-white px-1 text-[9px] font-bold">
                        ALERTA
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
