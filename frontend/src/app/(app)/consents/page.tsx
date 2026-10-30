'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { FileSignature, Send, Check } from 'lucide-react';
import { PatientPicker } from '@/components/patients/PatientPicker';

const TEMPLATES: Record<string, { name: string; content: string }> = {
  extraccion: {
    name: 'Extracción dental',
    content:
      'Yo, el/la paciente (o tutor), declaro haber sido informado/a sobre el procedimiento de EXTRACCIÓN DENTAL, sus riesgos (sangrado, infección, lesión nerviosa, alveolitis), alternativas y cuidados posteriores. Autorizo la realización del procedimiento por el profesional tratante.',
  },
  endodoncia: {
    name: 'Endodoncia',
    content:
      'Declaro haber recibido información sobre el tratamiento de CONDUCTOS (ENDODONCIA), incluyendo posibilidad de retratamiento, fractura de limas, dolor postoperatorio y pronóstico. Acepto el plan propuesto.',
  },
  implante: {
    name: 'Implante dental',
    content:
      'He sido informado/a sobre la colocación de IMPLANTE DENTAL, riesgos quirúrgicos, tiempo de osteointegración, necesidad de rehabilitación protésica y cuidados. Autorizo el procedimiento.',
  },
  general: {
    name: 'Consentimiento general',
    content:
      'Autorizo la atención odontológica, el registro en expediente clínico digital, el uso de radiografías cuando estén indicadas y el tratamiento acordado con el profesional, habiendo comprendido riesgos y beneficios.',
  },
};

interface Consent {
  id: string;
  procedureName: string;
  content: string;
  status: string;
  signedAt?: string;
  signedByName?: string;
  createdAt: string;
  patient?: { firstName: string; lastName: string };
}

export default function ConsentsPage() {
  const [patientId, setPatientId] = useState('');
  const [list, setList] = useState<Consent[]>([]);
  const [templateKey, setTemplateKey] = useState('general');
  const [procedureName, setProcedureName] = useState(TEMPLATES.general.name);
  const [content, setContent] = useState(TEMPLATES.general.content);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  // Sign panel
  const [signId, setSignId] = useState<string | null>(null);
  const [signedByName, setSignedByName] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [debugOtp, setDebugOtp] = useState('');

  function applyTemplate(key: string) {
    setTemplateKey(key);
    setProcedureName(TEMPLATES[key].name);
    setContent(TEMPLATES[key].content);
  }

  async function load() {
    if (!patientId.trim()) return;
    setError('');
    try {
      const data = await api('/consents/patient/' + patientId.trim());
      setList(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function createConsent(e: React.FormEvent) {
    e.preventDefault();
    if (!patientId.trim()) {
      setError('ID de paciente requerido');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api('/consents', {
        method: 'POST',
        body: JSON.stringify({
          patientId: patientId.trim(),
          procedureName,
          templateKey,
          content,
        }),
      });
      setMessage('Consentimiento creado (pendiente de firma)');
      load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function sendOtp(id: string) {
    setBusy(true);
    setError('');
    try {
      const res = await api('/consents/' + id + '/send-otp', { method: 'POST' });
      setMessage(res.message || 'OTP enviado');
      if (res.debugOtp) setDebugOtp(res.debugOtp);
      setSignId(id);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function signConsent() {
    if (!signId || !signedByName.trim()) {
      setError('Nombre de quien firma es obligatorio');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api('/consents/' + signId + '/sign', {
        method: 'POST',
        body: JSON.stringify({
          signedByName: signedByName.trim(),
          otpCode: otpCode || undefined,
          // En producción aquí iría signatureData base64 de la tablet
          signatureData: otpCode ? undefined : 'ui-ack-' + Date.now(),
        }),
      });
      setMessage('Consentimiento firmado');
      setSignId(null);
      setOtpCode('');
      setSignedByName('');
      setDebugOtp('');
      load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="page-title">Consentimientos informados</h1>
        <p className="page-subtitle">Generación, OTP y firma digital (RF-06)</p>
      </div>

      <div className="flex flex-wrap gap-2 items-end">
        <div className="flex-1 min-w-[200px]">
          <label className="label">Paciente</label>
          <PatientPicker value={patientId} onChange={setPatientId} />
        </div>
        <button type="button" onClick={load} className="btn-secondary">
          Ver existentes
        </button>
      </div>

      {error && <div className="alert-error">{error}</div>}
      {message && <div className="alert-success">{message}</div>}

      <form onSubmit={createConsent} className="card p-5 space-y-4">
        <h2 className="font-semibold flex items-center gap-2">
          <FileSignature className="h-5 w-5 text-clinical-600" /> Nuevo consentimiento
        </h2>
        <div>
          <label className="label">Plantilla</label>
          <div className="flex flex-wrap gap-2">
            {Object.entries(TEMPLATES).map(([key, t]) => (
              <button
                key={key}
                type="button"
                onClick={() => applyTemplate(key)}
                className={cn(
                  'rounded-lg px-3 py-1.5 text-xs font-medium border',
                  templateKey === key ? 'border-clinical-600 bg-clinical-50 text-clinical-800' : 'border-ink-200',
                )}
              >
                {t.name}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="label">Procedimiento</label>
          <input
            value={procedureName}
            onChange={(e) => setProcedureName(e.target.value)}
            className="input"
            required
          />
        </div>
        <div>
          <label className="label">Texto legal</label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={5}
            className="input"
            required
          />
        </div>
        <button
          type="submit"
          disabled={busy}
          className="btn-primary px-5"
        >
          Crear consentimiento
        </button>
      </form>

      <div className="space-y-3">
        <h2 className="font-semibold text-ink-900">Consentimientos del paciente</h2>
        {list.length === 0 && <p className="text-ink-400 text-sm">Ninguno cargado</p>}
        {list.map((c) => (
          <div key={c.id} className="rounded-xl border border-ink-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap justify-between gap-2 mb-2">
              <div>
                <div className="font-medium text-ink-900">{c.procedureName}</div>
                <div className="text-xs text-ink-500">{new Date(c.createdAt).toLocaleString('es')}</div>
              </div>
              <span
                className={cn(
                  'rounded-full px-2.5 py-0.5 text-xs font-medium h-fit',
                  c.status === 'SIGNED' && 'bg-emerald-100 text-emerald-800',
                  c.status === 'PENDING' && 'bg-amber-100 text-amber-800',
                  c.status === 'REVOKED' && 'bg-red-100 text-red-700',
                )}
              >
                {c.status}
              </span>
            </div>
            <p className="text-xs text-ink-600 line-clamp-2 mb-3">{c.content}</p>
            {c.status === 'SIGNED' && (
              <p className="text-xs text-emerald-700">
                Firmado por {c.signedByName} · {c.signedAt && new Date(c.signedAt).toLocaleString('es')}
              </p>
            )}
            {c.status === 'PENDING' && (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => sendOtp(c.id)}
                  className="inline-flex items-center gap-1 rounded-lg border border-ink-300 px-3 py-1.5 text-xs font-medium hover:bg-ink-50"
                >
                  <Send className="h-3 w-3" /> Enviar OTP
                </button>
                <button
                  type="button"
                  onClick={() => setSignId(c.id)}
                  className="btn-primary"
                >
                  <Check className="h-3 w-3" /> Firmar
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {signId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setSignId(null)}>
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl space-y-3" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-lg">Firmar consentimiento</h3>
            {debugOtp && (
              <p className="text-xs bg-amber-50 text-amber-800 rounded px-2 py-1">
                Dev OTP: <strong>{debugOtp}</strong>
              </p>
            )}
            <div>
              <label className="label">Nombre de quien firma *</label>
              <input
                value={signedByName}
                onChange={(e) => setSignedByName(e.target.value)}
                className="input"
                placeholder="Paciente o tutor"
              />
            </div>
            <div>
              <label className="label">Código OTP (si se envió)</label>
              <input
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value)}
                className="w-full rounded-lg border border-ink-300 px-3 py-2 text-sm tracking-widest"
                placeholder="6 dígitos"
                maxLength={6}
              />
            </div>
            <p className="text-xs text-ink-400">
              Sin OTP se registra acuse en UI (producción: firma en tablet / signatureData).
            </p>
            <div className="flex gap-2">
              <button type="button" onClick={() => setSignId(null)} className="flex-1 rounded-lg border py-2 text-sm">
                Cancelar
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={signConsent}
                className="flex-1 rounded-lg bg-clinical-600 text-white py-2 text-sm font-medium"
              >
                Confirmar firma
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
