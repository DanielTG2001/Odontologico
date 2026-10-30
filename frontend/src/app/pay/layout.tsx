import { LogoMark } from '@/components/layout/Logo';

/** Páginas públicas para el paciente (sin sesión del personal) */
export default function PayLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center bg-[#f5f7f6] px-4 py-10">
      <div className="mb-8 flex items-center gap-2.5">
        <LogoMark className="h-9 w-9" />
        <span className="font-display text-xl font-semibold text-ink-900">SIGO‑Dental</span>
      </div>
      <div className="w-full max-w-md">{children}</div>
      <p className="mt-8 text-center text-xs text-ink-400">Pago procesado por la pasarela de forma segura. La clínica no almacena los datos de tu tarjeta.</p>
    </div>
  );
}
