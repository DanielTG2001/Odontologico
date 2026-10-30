'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { ArrowLeft } from 'lucide-react';

export default function NewPatientPage() {
  const router = useRouter();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({
    documentType: 'CI',
    documentNumber: '',
    firstName: '',
    lastName: '',
    birthDate: '',
    gender: '',
    email: '',
    phone: '',
    address: '',
    city: '',
    emergencyContact: '',
    emergencyPhone: '',
    isMinor: false,
    tutorName: '',
    tutorDocument: '',
    insuranceName: '',
    insuranceNumber: '',
    notes: '',
    // anamnesis
    systemicDiseases: '',
    allergies: '',
    surgicalHistory: '',
    coagulopathies: '',
    medications: '',
    hasCriticalAlert: false,
    criticalAlertReason: '',
  });

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const payload: any = {
        documentType: form.documentType,
        documentNumber: form.documentNumber,
        firstName: form.firstName,
        lastName: form.lastName,
        birthDate: form.birthDate,
        gender: form.gender || undefined,
        email: form.email || undefined,
        phone: form.phone || undefined,
        address: form.address || undefined,
        city: form.city || undefined,
        emergencyContact: form.emergencyContact || undefined,
        emergencyPhone: form.emergencyPhone || undefined,
        isMinor: form.isMinor,
        tutorName: form.isMinor ? form.tutorName : undefined,
        tutorDocument: form.isMinor ? form.tutorDocument : undefined,
        insuranceName: form.insuranceName || undefined,
        insuranceNumber: form.insuranceNumber || undefined,
        notes: form.notes || undefined,
        systemicDiseases: form.systemicDiseases.trim(),
        allergies: form.allergies.trim(),
        surgicalHistory: form.surgicalHistory.trim(),
        coagulopathies: form.coagulopathies.trim(),
        medications: form.medications.trim(),
        // Si no se marca, el backend detecta la alerta desde la anamnesis
        hasCriticalAlert: form.hasCriticalAlert || undefined,
        criticalAlertReason: form.hasCriticalAlert ? form.criticalAlertReason : undefined,
      };

      const patient = await api('/patients', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      router.push('/patients/' + patient.id);
    } catch (err: any) {
      setError(err.message || 'Error al registrar paciente');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-3xl space-y-6">
      <Link href="/patients" className="inline-flex items-center gap-1 text-sm text-clinical-600 hover:underline">
        <ArrowLeft className="h-4 w-4" /> Pacientes
      </Link>

      <div>
        <h1 className="page-title">Alta de paciente</h1>
        <p className="page-subtitle">Ficha única + anamnesis y alertas médicas</p>
      </div>

      {error && (
        <div className="alert-error">{error}</div>
      )}

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Identificación */}
        <section className="card p-5 space-y-4">
          <h2 className="font-semibold text-ink-900">Identificación</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label">Tipo documento *</label>
              <select
                value={form.documentType}
                onChange={(e) => set('documentType', e.target.value)}
                className="input"
              >
                <option value="CI">CI / Cédula</option>
                <option value="PASAPORTE">Pasaporte</option>
                <option value="OTRO">Otro</option>
              </select>
            </div>
            <div>
              <label className="label">Número *</label>
              <input
                required
                value={form.documentNumber}
                onChange={(e) => set('documentNumber', e.target.value)}
                className="input"
              />
            </div>
            <div>
              <label className="label">Nombres *</label>
              <input
                required
                value={form.firstName}
                onChange={(e) => set('firstName', e.target.value)}
                className="input"
              />
            </div>
            <div>
              <label className="label">Apellidos *</label>
              <input
                required
                value={form.lastName}
                onChange={(e) => set('lastName', e.target.value)}
                className="input"
              />
            </div>
            <div>
              <label className="label">Fecha de nacimiento *</label>
              <input
                type="date"
                required
                value={form.birthDate}
                onChange={(e) => set('birthDate', e.target.value)}
                className="input"
              />
            </div>
            <div>
              <label className="label">Género</label>
              <select
                value={form.gender}
                onChange={(e) => set('gender', e.target.value)}
                className="input"
              >
                <option value="">—</option>
                <option value="M">Masculino</option>
                <option value="F">Femenino</option>
                <option value="Otro">Otro</option>
              </select>
            </div>
          </div>
        </section>

        {/* Contacto */}
        <section className="card p-5 space-y-4">
          <h2 className="font-semibold text-ink-900">Contacto</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label">Teléfono</label>
              <input value={form.phone} onChange={(e) => set('phone', e.target.value)} className="input" />
            </div>
            <div>
              <label className="label">Email</label>
              <input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} className="input" />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Dirección</label>
              <input value={form.address} onChange={(e) => set('address', e.target.value)} className="input" />
            </div>
            <div>
              <label className="label">Ciudad</label>
              <input value={form.city} onChange={(e) => set('city', e.target.value)} className="input" />
            </div>
            <div>
              <label className="label">Contacto de emergencia</label>
              <input value={form.emergencyContact} onChange={(e) => set('emergencyContact', e.target.value)} className="input" />
            </div>
            <div>
              <label className="label">Tel. emergencia</label>
              <input value={form.emergencyPhone} onChange={(e) => set('emergencyPhone', e.target.value)} className="input" />
            </div>
          </div>
        </section>

        {/* Menor / seguro */}
        <section className="card p-5 space-y-4">
          <h2 className="font-semibold text-ink-900">Tutor y seguro</h2>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.isMinor}
              onChange={(e) => set('isMinor', e.target.checked)}
              className="rounded border-ink-300"
            />
            Es menor de edad
          </label>
          {form.isMinor && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label">Nombre del tutor *</label>
                <input
                  required={form.isMinor}
                  value={form.tutorName}
                  onChange={(e) => set('tutorName', e.target.value)}
                  className="input"
                />
              </div>
              <div>
                <label className="label">Documento tutor</label>
                <input value={form.tutorDocument} onChange={(e) => set('tutorDocument', e.target.value)} className="input" />
              </div>
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label">Seguro / convenio</label>
              <input value={form.insuranceName} onChange={(e) => set('insuranceName', e.target.value)} className="input" />
            </div>
            <div>
              <label className="label">Nº de afiliación</label>
              <input value={form.insuranceNumber} onChange={(e) => set('insuranceNumber', e.target.value)} className="input" />
            </div>
          </div>
        </section>

        {/* Anamnesis */}
        <section className="card p-5 space-y-4">
          <div>
            <h2 className="font-semibold text-ink-900">Anamnesis y alertas</h2>
            <p className="mt-0.5 text-xs text-ink-500">Obligatoria (RF-02). Si no aplica escribe “Ninguna” o “Niega”. Las alergias a penicilina, AINEs, látex o anestésicos y los anticoagulantes activan la alerta automáticamente.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="label">Enfermedades sistémicas <span className="text-red-500">*</span></label>
              <textarea value={form.systemicDiseases} onChange={(e) => set('systemicDiseases', e.target.value)} rows={2} className="input" placeholder="ej. Hipertensión, diabetes tipo 2 · o “Ninguna”" required />
            </div>
            <div>
              <label className="label">Alergias <span className="text-red-500">*</span></label>
              <input value={form.allergies} onChange={(e) => set('allergies', e.target.value)} className="input" placeholder="ej. penicilina · o “Niega”" required />
            </div>
            <div>
              <label className="label">Medicamentos actuales <span className="text-red-500">*</span></label>
              <input value={form.medications} onChange={(e) => set('medications', e.target.value)} className="input" placeholder="ej. losartán 50 mg · o “Ninguno”" required />
            </div>
            <div>
              <label className="label">Antecedentes quirúrgicos <span className="text-red-500">*</span></label>
              <input value={form.surgicalHistory} onChange={(e) => set('surgicalHistory', e.target.value)} className="input" placeholder="o “Ninguno”" required />
            </div>
            <div>
              <label className="label">Coagulopatías <span className="text-red-500">*</span></label>
              <input value={form.coagulopathies} onChange={(e) => set('coagulopathies', e.target.value)} className="input" placeholder="ej. hemofilia · o “No”" required />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm font-medium text-red-700">
            <input
              type="checkbox"
              checked={form.hasCriticalAlert}
              onChange={(e) => set('hasCriticalAlert', e.target.checked)}
              className="rounded border-red-300"
            />
            Activar alerta crítica (badge de alta visibilidad)
          </label>
          {form.hasCriticalAlert && (
            <input
              required
              value={form.criticalAlertReason}
              onChange={(e) => set('criticalAlertReason', e.target.value)}
              placeholder="Motivo de la alerta (ej. Alergia a penicilina, anticoagulado)"
              className="w-full rounded-lg border border-red-300 px-3 py-2 text-sm"
            />
          )}

          <div>
            <label className="label">Notas adicionales</label>
            <textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} rows={2} className="input" />
          </div>
        </section>

        <div className="flex gap-3">
          <Link href="/patients" className="rounded-lg border border-ink-300 px-5 py-2.5 text-sm font-medium hover:bg-ink-50">
            Cancelar
          </Link>
          <button
            type="submit"
            disabled={loading}
            className="btn-primary px-6"
          >
            {loading ? 'Guardando…' : 'Registrar paciente'}
          </button>
        </div>
      </form>
    </div>
  );
}
