'use client';

import { useEffect, useState, use } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import type { Patient, Appointment } from '@/types';
import { STATUS_LABELS, STATUS_COLORS } from '@/types';
import { cn } from '@/lib/utils';
import { AlertTriangle, ArrowLeft, Calendar, FileText, Smile, Pill, HeartPulse } from 'lucide-react';
import { PatientFiles } from '@/components/patients/PatientFiles';

export default function PatientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [patient, setPatient] = useState<Patient | null>(null);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [notes, setNotes] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'info' | 'history' | 'appointments' | 'notes' | 'files'>('info');

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [p, appts, n] = await Promise.all([
          api('/patients/' + id),
          api('/appointments?patientId=' + id).catch(() => []),
          api('/clinical-notes/patient/' + id).catch(() => []),
        ]);
        setPatient(p);
        setAppointments(Array.isArray(appts) ? appts : []);
        setNotes(Array.isArray(n) ? n : []);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  if (loading) {
    return <div className="text-ink-400 py-12 text-center">Cargando ficha…</div>;
  }
  if (error || !patient) {
    return (
      <div className="space-y-4">
        <Link href="/patients" className="text-clinical-600 text-sm hover:underline">← Volver</Link>
        <div className="rounded-lg bg-red-50 text-red-700 px-4 py-3">{error || 'Paciente no encontrado'}</div>
      </div>
    );
  }

  const age = patient.birthDate
    ? Math.floor((Date.now() - new Date(patient.birthDate).getTime()) / (365.25 * 86400000))
    : null;

  const mh = patient.medicalHistory;

  return (
    <div className="space-y-6 max-w-4xl">
      <Link href="/patients" className="inline-flex items-center gap-1 text-sm text-clinical-600 hover:underline">
        <ArrowLeft className="h-4 w-4" /> Pacientes
      </Link>

      {/* Header with critical alert */}
      <div className="card overflow-hidden">
        {mh?.hasCriticalAlert && (
          <div className="bg-red-600 text-white px-5 py-3 flex items-center gap-2 text-sm font-medium">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            ALERTA MÉDICA: {mh.criticalAlertReason || mh.allergies || 'Condición crítica registrada'}
          </div>
        )}
        <div className="p-5 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="page-title">
              {patient.firstName} {patient.lastName}
            </h1>
            <p className="page-subtitle">
              {patient.documentType} {patient.documentNumber}
              {age !== null && <> · {age} años</>}
              {patient.gender && <> · {patient.gender}</>}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href={'/odontogram?patientId=' + patient.id}
              className="inline-flex items-center gap-1.5 rounded-lg border border-ink-300 px-3 py-2 text-sm hover:bg-ink-50"
            >
              <Smile className="h-4 w-4" /> Odontograma
            </Link>
            <Link
              href={'/vital-signs?patientId=' + patient.id}
              className="btn-secondary px-3 py-2"
            >
              <HeartPulse className="h-4 w-4" /> Signos vitales
            </Link>
            <Link
              href={'/prescriptions?patientId=' + patient.id}
              className="btn-secondary px-3 py-2"
            >
              <Pill className="h-4 w-4" /> Receta
            </Link>
            <Link
              href={'/appointments'}
              className="inline-flex items-center gap-1.5 rounded-lg border border-ink-300 px-3 py-2 text-sm hover:bg-ink-50"
            >
              <Calendar className="h-4 w-4" /> Agenda
            </Link>
            <Link
              href={'/billing?patientId=' + patient.id}
              className="btn-primary"
            >
              Facturar
            </Link>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto border-b border-ink-200">
        {([
          ['info', 'Datos'],
          ['history', 'Anamnesis'],
          ['appointments', 'Citas'],
          ['notes', 'Notas SOEP'],
          ['files', 'Archivos'],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={cn(
              'px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition',
              tab === key
                ? 'border-clinical-600 text-clinical-700'
                : 'border-transparent text-ink-500 hover:text-ink-700',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'info' && (
        <div className="grid gap-4 sm:grid-cols-2 rounded-xl border border-ink-200 bg-white p-5 shadow-sm">
          <Field label="Teléfono" value={patient.phone} />
          <Field label="Email" value={patient.email} />
          <Field label="Dirección" value={patient.address} />
          <Field label="Ciudad" value={patient.city} />
          <Field label="Contacto emergencia" value={patient.emergencyContact} />
          <Field label="Tel. emergencia" value={patient.emergencyPhone} />
          {patient.isMinor && (
            <>
              <Field label="Tutor legal" value={patient.tutorName} />
              <Field label="Doc. tutor" value={patient.tutorDocument} />
            </>
          )}
          <Field label="Seguro / convenio" value={patient.insuranceName} />
          <Field label="Nº seguro" value={patient.insuranceNumber} />
          <div className="sm:col-span-2">
            <Field label="Notas" value={patient.notes} />
          </div>
          <div className="sm:col-span-2 text-xs text-ink-400 font-mono">ID: {patient.id}</div>
        </div>
      )}

      {tab === 'history' && (
        <div className="rounded-xl border border-ink-200 bg-white p-5 shadow-sm space-y-3">
          {!mh ? (
            <p className="text-ink-400">Sin anamnesis registrada</p>
          ) : (
            <>
              <Field label="Enfermedades sistémicas" value={mh.systemicDiseases} />
              <Field label="Alergias" value={mh.allergies} />
              <Field label="Antecedentes quirúrgicos" value={mh.surgicalHistory} />
              <Field label="Coagulopatías" value={mh.coagulopathies} />
              <Field label="Medicamentos" value={mh.medications} />
              <Field label="Notas clínicas" value={mh.notes} />
            </>
          )}
        </div>
      )}

      {tab === 'appointments' && (
        <div className="card overflow-hidden">
          {appointments.length === 0 ? (
            <p className="p-6 text-ink-400 text-center">Sin citas registradas</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-ink-50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-ink-600">Fecha</th>
                  <th className="text-left px-4 py-3 font-medium text-ink-600">Doctor</th>
                  <th className="text-left px-4 py-3 font-medium text-ink-600">Sillón</th>
                  <th className="text-left px-4 py-3 font-medium text-ink-600">Estado</th>
                </tr>
              </thead>
              <tbody>
                {appointments.map((a) => (
                  <tr key={a.id} className="border-b border-ink-100">
                    <td className="px-4 py-3">
                      {new Date(a.startAt).toLocaleString('es', {
                        dateStyle: 'short',
                        timeStyle: 'short',
                      })}
                    </td>
                    <td className="px-4 py-3">{a.doctor?.firstName} {a.doctor?.lastName}</td>
                    <td className="px-4 py-3">{a.chair?.name || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', STATUS_COLORS[a.status])}>
                        {STATUS_LABELS[a.status]}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'files' && <PatientFiles patientId={patient.id} />}

      {tab === 'notes' && (
        <div className="space-y-3">
          {notes.length === 0 ? (
            <p className="text-ink-400 text-center py-8">Sin notas clínicas</p>
          ) : (
            notes.map((n) => (
              <div key={n.id} className="rounded-xl border border-ink-200 bg-white p-4 shadow-sm">
                <div className="flex justify-between text-xs text-ink-500 mb-2">
                  <span>
                    {n.author?.firstName} {n.author?.lastName}
                  </span>
                  <span>
                    {new Date(n.createdAt).toLocaleString('es')}
                    {n.isLocked && ' · 🔒 Firmada'}
                  </span>
                </div>
                {n.subjective && <p className="text-sm"><strong>S:</strong> {n.subjective}</p>}
                {n.objective && <p className="text-sm"><strong>O:</strong> {n.objective}</p>}
                {n.evaluation && <p className="text-sm"><strong>E:</strong> {n.evaluation}</p>}
                {n.plan && <p className="text-sm"><strong>P:</strong> {n.plan}</p>}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <div className="text-xs font-medium text-ink-500">{label}</div>
      <div className="text-sm text-ink-900 mt-0.5">{value || '—'}</div>
    </div>
  );
}
