'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Lock, Mail, ShieldCheck, CalendarCheck2, Smile, Receipt, KeyRound, Clock, Smartphone, Copy } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';
import { LogoMark } from '@/components/layout/Logo';

const FEATURES = [
  { icon: Smile, title: 'Odontograma FDI / Universal', text: 'Permanente y temporal, por superficie.' },
  { icon: CalendarCheck2, title: 'Agenda multi‑sillón', text: 'Sin choques de horario y con recordatorios.' },
  { icon: Receipt, title: 'Facturación y caja ciega', text: 'Pagos mixtos y cuadre diario.' },
  { icon: ShieldCheck, title: 'Datos de salud protegidos', text: 'MFA, roles y auditoría con IP.' },
];

function LoginInner() {
  const router = useRouter();
  const params = useSearchParams();
  const reason = params.get('reason');
  const setAuth = useAuthStore((s) => s.setAuth);
  // Credenciales de demostración solo en desarrollo (nunca en producción)
  const isDev = process.env.NODE_ENV !== 'production';
  const [email, setEmail] = useState(isDev ? 'admin@sigo.dental' : '');
  const [password, setPassword] = useState(isDev ? 'Admin123!' : '');
  const [mfaCode, setMfaCode] = useState('');
  const [requiresMfa, setRequiresMfa] = useState(false);
  // Enrolamiento MFA obligatorio (RNF-05)
  const [setupToken, setSetupToken] = useState<string | null>(null);
  const [qr, setQr] = useState<{ qrCode: string; secret: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await api('/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          email,
          password,
          ...(requiresMfa && mfaCode ? { mfaCode } : {}),
        }),
      });

      if (data.requiresMfaSetup && data.setupToken) {
        setSetupToken(data.setupToken);
        const setup = await api('/auth/mfa/setup', {
          method: 'POST',
          headers: { Authorization: `Bearer ${data.setupToken}` },
        });
        setQr({ qrCode: setup.qrCode, secret: setup.secret });
        setMfaCode('');
        setLoading(false);
        return;
      }

      if (data.requiresMfa) {
        setRequiresMfa(true);
        setLoading(false);
        return;
      }

      setAuth(data.user, data.accessToken);
      router.push('/dashboard');
    } catch (err: any) {
      setError(err.message || 'Error al iniciar sesión');
    } finally {
      setLoading(false);
    }
  }

  async function handleEnable(e: React.FormEvent) {
    e.preventDefault();
    if (!setupToken) return;
    setError('');
    setLoading(true);
    try {
      const data = await api('/auth/mfa/enable', {
        method: 'POST',
        headers: { Authorization: `Bearer ${setupToken}` },
        body: JSON.stringify({ code: mfaCode }),
      });
      setAuth(data.user, data.accessToken);
      router.push('/dashboard');
    } catch (err: any) {
      setError(err.message || 'Código inválido');
    } finally {
      setLoading(false);
    }
  }

  const enrolling = !!(setupToken && qr);

  return (
    <div className="flex min-h-screen bg-white">
      {/* Panel de marca */}
      <div className="relative hidden w-[46%] overflow-hidden bg-clinical-950 text-white lg:flex lg:flex-col lg:justify-between lg:p-12 xl:p-16">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -left-40 -top-40 h-[480px] w-[480px] rounded-full bg-clinical-500/25 blur-3xl" />
          <div className="absolute -bottom-48 right-[-120px] h-[520px] w-[520px] rounded-full bg-clinical-700/40 blur-3xl" />
          <svg className="absolute inset-0 h-full w-full opacity-[0.06]" aria-hidden="true">
            <defs>
              <pattern id="grid" width="32" height="32" patternUnits="userSpaceOnUse">
                <path d="M32 0H0V32" fill="none" stroke="white" strokeWidth="1" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid)" />
          </svg>
        </div>

        <div className="relative flex items-center gap-3">
          <LogoMark className="h-11 w-11" />
          <div>
            <div className="font-display text-2xl font-semibold">SIGO‑Dental</div>
            <div className="text-xs font-medium uppercase tracking-[0.18em] text-clinical-300/80">Gestión odontológica</div>
          </div>
        </div>

        <div className="relative max-w-md">
          <h1 className="font-display text-[42px] font-medium leading-[1.08]">
            El expediente clínico de tu consultorio, <span className="text-clinical-300">en un solo lugar.</span>
          </h1>
          <div className="mt-10 grid gap-5">
            {FEATURES.map(({ icon: Icon, title, text }) => (
              <div key={title} className="flex gap-4">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/[0.07] ring-1 ring-white/10">
                  <Icon className="h-5 w-5 text-clinical-300" />
                </div>
                <div>
                  <div className="text-[15px] font-semibold">{title}</div>
                  <div className="text-sm text-clinical-100/70">{text}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="relative text-xs text-clinical-300/60">v1.0 · Uso exclusivo del personal autorizado</p>
      </div>

      {/* Formulario */}
      <div className="flex flex-1 items-center justify-center bg-[#f5f7f6] p-6 sm:p-10">
        <div className="w-full max-w-[420px]">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <LogoMark className="h-10 w-10" />
            <div className="font-display text-2xl font-semibold text-ink-900">SIGO‑Dental</div>
          </div>

          <div className="card p-7 shadow-lift sm:p-8">
            <h2 className="text-2xl font-bold text-ink-900">
              {enrolling ? 'Activa la verificación en dos pasos' : requiresMfa ? 'Verificación en dos pasos' : 'Iniciar sesión'}
            </h2>
            <p className="mt-1 text-sm text-ink-500">
              {enrolling
                ? 'Es obligatoria para acceder a expedientes clínicos e información financiera.'
                : requiresMfa
                  ? 'Ingresa el código de 6 dígitos de tu app autenticadora.'
                  : 'Acceso para personal clínico y administrativo.'}
            </p>

            {reason === 'idle' && (
              <div className="mt-5 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
                <Clock className="mt-0.5 h-4 w-4 shrink-0" /> Tu sesión se cerró por 15 minutos de inactividad.
              </div>
            )}
            {reason === 'expired' && (
              <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
                Tu sesión expiró. Vuelve a ingresar.
              </div>
            )}
            {reason === 'mfa' && !enrolling && (
              <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
                Tu rol requiere MFA. Inicia sesión para configurarla.
              </div>
            )}
            {error && <div className="alert-error mt-5">{error}</div>}

            {enrolling ? (
              <form onSubmit={handleEnable} className="mt-6 space-y-5">
                <ol className="space-y-4 text-sm text-ink-700">
                  <li className="flex gap-3">
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-clinical-100 text-xs font-bold text-clinical-800">1</span>
                    <span className="flex items-center gap-1.5"><Smartphone className="h-4 w-4 text-ink-400" /> Abre Google Authenticator, Microsoft Authenticator o Authy.</span>
                  </li>
                  <li className="flex gap-3">
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-clinical-100 text-xs font-bold text-clinical-800">2</span>
                    <div className="flex-1">
                      Escanea este código:
                      <div className="mt-2 flex justify-center rounded-xl border border-ink-100 bg-white p-3">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={qr!.qrCode} alt="Código QR de MFA" className="h-44 w-44" />
                      </div>
                      <button
                        type="button"
                        onClick={() => { navigator.clipboard?.writeText(qr!.secret); setCopied(true); }}
                        className="mt-2 inline-flex items-center gap-1 font-mono text-[11px] text-ink-500 hover:text-ink-800"
                        title="Copiar clave para ingresarla manualmente"
                      >
                        <Copy className="h-3 w-3" /> {copied ? 'Clave copiada' : qr!.secret.replace(/(.{4})/g, '$1 ').trim()}
                      </button>
                    </div>
                  </li>
                  <li className="flex gap-3">
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-clinical-100 text-xs font-bold text-clinical-800">3</span>
                    <span>Escribe el código de 6 dígitos que muestra la app.</span>
                  </li>
                </ol>
                <input
                  type="text"
                  inputMode="numeric"
                  autoFocus
                  maxLength={6}
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ''))}
                  className="input py-3 text-center font-mono text-2xl tracking-[0.5em]"
                  placeholder="••••••"
                  required
                />
                <button type="submit" disabled={loading || mfaCode.length !== 6} className="btn-primary w-full py-3">
                  {loading ? 'Verificando…' : 'Activar MFA y entrar'}
                </button>
                <button
                  type="button"
                  onClick={() => { setSetupToken(null); setQr(null); setMfaCode(''); }}
                  className="w-full text-center text-sm text-ink-500 hover:text-ink-800"
                >
                  ← Volver
                </button>
              </form>
            ) : (
            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              {!requiresMfa && (
                <>
                  <div>
                    <label className="label">Correo electrónico</label>
                    <div className="relative">
                      <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="input pl-10"
                        autoComplete="username"
                        required
                      />
                    </div>
                  </div>
                  <div>
                    <label className="label">Contraseña</label>
                    <div className="relative">
                      <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
                      <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="input pl-10"
                        autoComplete="current-password"
                        required
                      />
                    </div>
                  </div>
                </>
              )}

              {requiresMfa && (
                <div>
                  <label className="label flex items-center gap-1.5">
                    <KeyRound className="h-3.5 w-3.5" /> Código MFA
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    autoFocus
                    maxLength={6}
                    value={mfaCode}
                    onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ''))}
                    className="input py-3 text-center font-mono text-2xl tracking-[0.5em]"
                    placeholder="••••••"
                    required
                  />
                </div>
              )}

              <button type="submit" disabled={loading} className="btn-primary w-full py-3">
                {loading ? 'Ingresando…' : requiresMfa ? 'Verificar y entrar' : 'Entrar'}
              </button>

              {requiresMfa && (
                <button
                  type="button"
                  onClick={() => { setRequiresMfa(false); setMfaCode(''); }}
                  className="w-full text-center text-sm text-ink-500 hover:text-ink-800"
                >
                  ← Usar otra cuenta
                </button>
              )}
            </form>
            )}
          </div>

          <p className="mt-6 flex items-center justify-center gap-1.5 text-xs text-ink-400">
            <ShieldCheck className="h-3.5 w-3.5" /> Conexión cifrada · cada acceso queda auditado
          </p>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginInner />
    </Suspense>
  );
}
