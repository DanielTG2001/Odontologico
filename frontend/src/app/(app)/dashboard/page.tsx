'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuthStore } from '@/lib/auth-store';
import { api } from '@/lib/api';
import { dayRange, localISO } from '@/lib/dates';
import type { Appointment, AppointmentStatus } from '@/types';
import { STATUS_COLORS, STATUS_LABELS } from '@/types';
import { cn } from '@/lib/utils';
import {
  Calendar, Users, Receipt, AlertTriangle, ArrowRight, UserPlus, Smile, Clock, PackageX,
} from 'lucide-react';

interface Kpi { label: string; value: string; hint?: string; icon: any; tone: string }

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
}

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const [appts, setAppts] = useState<Appointment[] | null>(null);
  const [summary, setSummary] = useState<any>(null);
  const [lowStock, setLowStock] = useState<any[] | null>(null);

  useEffect(() => {
    const today = localISO();
    const { from, to } = dayRange(today);
    api('/appointments?from=' + encodeURIComponent(from) + '&to=' + encodeURIComponent(to))
      .then((d) => setAppts(Array.isArray(d) ? d : []))
      .catch(() => setAppts(null));
    api(`/reports/dashboard?from=${today}&to=${today}`).then(setSummary).catch(() => setSummary(null));
    api('/reports/inventory')
      .then((d) => setLowStock(Array.isArray(d?.lowStockItems) ? d.lowStockItems : null))
      .catch(() => setLowStock(null));
  }, []);

  const alerts = appts?.filter((a) => a.patient?.medicalHistory?.hasCriticalAlert) ?? [];
  const pending = appts?.filter((a) => !['ATENDIDO', 'CANCELADO', 'NO_ASISTIO'].includes(a.status)) ?? [];
  const now = Date.now();
  const next = pending.filter((a) => new Date(a.endAt).getTime() > now).slice(0, 6);

  const money = (n: number) => '$' + n.toLocaleString('es-EC', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const kpis: Kpi[] = [
    {
      label: 'Citas de hoy',
      value: appts ? String(appts.length) : '—',
      hint: appts ? `${pending.length} por atender` : 'Sin acceso a agenda',
      icon: Calendar,
      tone: 'bg-clinical-50 text-clinical-700',
    },
    {
      label: 'Alertas clínicas hoy',
      value: appts ? String(alerts.length) : '—',
      hint: 'Pacientes con condición crítica',
      icon: AlertTriangle,
      tone: alerts.length ? 'bg-red-50 text-red-600' : 'bg-ink-50 text-ink-500',
    },
    {
      label: 'Cobrado hoy',
      value: summary ? money(Object.values(summary.revenue?.byPaymentMethod || {}).reduce((s: number, v: any) => s + Number(v), 0)) : '—',
      hint: summary ? `${summary.revenue?.invoicesCount ?? 0} facturas` : 'Solo administración / contabilidad',
      icon: Receipt,
      tone: 'bg-violet-50 text-violet-700',
    },
    {
      label: 'Pacientes nuevos hoy',
      value: summary ? String(summary.newPatients ?? 0) : '—',
      hint: summary ? `Asistencia ${summary.appointments?.attendanceRate ?? 0}%` : '',
      icon: Users,
      tone: 'bg-amber-50 text-amber-700',
    },
  ];

  return (
    <div className="space-y-7">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-clinical-700">{greeting()}</p>
          <h1 className="font-display text-[34px] font-medium leading-tight text-ink-900">
            {user ? `${user.firstName}, ` : ''}así va la clínica hoy
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/patients/new" className="btn-secondary"><UserPlus className="h-4 w-4" /> Nuevo paciente</Link>
          <Link href="/appointments" className="btn-primary"><Calendar className="h-4 w-4" /> Abrir agenda</Link>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((k) => {
          const Icon = k.icon;
          return (
            <div key={k.label} className="card p-5">
              <div className="flex items-start justify-between">
                <span className="text-[13px] font-medium text-ink-500">{k.label}</span>
                <span className={cn('rounded-lg p-2', k.tone)}><Icon className="h-[18px] w-[18px]" /></span>
              </div>
              <div className="mt-2 text-[32px] font-bold leading-none tracking-tight text-ink-900">{k.value}</div>
              {k.hint && <div className="mt-2 text-xs text-ink-400">{k.hint}</div>}
            </div>
          );
        })}
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="card lg:col-span-2">
          <div className="flex items-center justify-between border-b border-ink-100 px-5 py-4">
            <div>
              <h2 className="font-semibold text-ink-900">Próximas citas</h2>
              <p className="text-xs text-ink-400">Hoy, en orden de llegada</p>
            </div>
            <Link href="/appointments" className="inline-flex items-center gap-1 text-sm font-medium text-clinical-700 hover:text-clinical-800">
              Ver agenda <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          {appts === null ? (
            <div className="px-5 py-10 text-center text-sm text-ink-400">Tu rol no tiene acceso a la agenda.</div>
          ) : next.length === 0 ? (
            <div className="px-5 py-12 text-center">
              <Clock className="mx-auto h-8 w-8 text-ink-200" />
              <p className="mt-2 text-sm text-ink-400">No quedan citas pendientes para hoy.</p>
            </div>
          ) : (
            <ul className="divide-y divide-ink-100">
              {next.map((a) => (
                <li key={a.id} className="flex items-center gap-4 px-5 py-3.5">
                  <div className="w-14 shrink-0 font-mono text-sm font-medium text-ink-700">
                    {new Date(a.startAt).toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                  <div className="min-w-0 flex-1">
                    <Link href={'/patients/' + a.patientId} className="flex items-center gap-2 truncate font-semibold text-ink-900 hover:text-clinical-700">
                      {a.patient?.firstName} {a.patient?.lastName}
                      {a.patient?.medicalHistory?.hasCriticalAlert && (
                        <span className="chip bg-red-100 text-red-700"><AlertTriangle className="h-3 w-3" /> Alerta</span>
                      )}
                    </Link>
                    <div className="truncate text-xs text-ink-400">
                      {a.chair?.name} · Dr/a. {a.doctor?.lastName}{a.reason ? ` · ${a.reason}` : ''}
                    </div>
                  </div>
                  <span className={cn('chip shrink-0', STATUS_COLORS[a.status as AppointmentStatus])}>
                    {STATUS_LABELS[a.status as AppointmentStatus]}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="space-y-5">
          <div className="card p-5">
            <h2 className="flex items-center gap-2 font-semibold text-ink-900">
              <AlertTriangle className="h-4 w-4 text-red-500" /> Alertas médicas del día
            </h2>
            {alerts.length === 0 ? (
              <p className="mt-3 text-sm text-ink-400">Ningún paciente de hoy tiene alertas críticas.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {alerts.map((a) => (
                  <li key={a.id} className="rounded-lg border border-red-100 bg-red-50/60 px-3 py-2">
                    <div className="text-sm font-semibold text-red-900">{a.patient?.firstName} {a.patient?.lastName}</div>
                    <div className="text-xs text-red-700">{a.patient?.medicalHistory?.criticalAlertReason || 'Condición crítica registrada'}</div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {lowStock && lowStock.length > 0 && (
            <div className="card p-5">
              <h2 className="flex items-center gap-2 font-semibold text-ink-900">
                <PackageX className="h-4 w-4 text-amber-600" /> Insumos bajo mínimo
              </h2>
              <ul className="mt-3 space-y-1.5 text-sm">
                {lowStock.slice(0, 5).map((i: any) => (
                  <li key={i.id || i.sku} className="flex justify-between">
                    <span className="truncate text-ink-700">{i.name}</span>
                    <span className="font-mono text-amber-700">{i.stockCurrent ?? i.quantity}/{i.stockMin}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="card p-5">
            <h2 className="font-semibold text-ink-900">Accesos rápidos</h2>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {[
                { href: '/patients', label: 'Buscar paciente', icon: Users },
                { href: '/odontogram', label: 'Odontograma', icon: Smile },
                { href: '/billing', label: 'Facturar', icon: Receipt },
                { href: '/cash-closing', label: 'Cierre de caja', icon: Clock },
              ].map(({ href, label, icon: Icon }) => (
                <Link key={href} href={href} className="flex items-center gap-2 rounded-lg border border-ink-100 px-3 py-2.5 text-sm font-medium text-ink-700 hover:border-clinical-200 hover:bg-clinical-50/50">
                  <Icon className="h-4 w-4 text-clinical-600" /> {label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
