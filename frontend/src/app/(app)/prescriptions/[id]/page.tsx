'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Printer } from 'lucide-react';
import { api } from '@/lib/api';
import { LogoMark } from '@/components/layout/Logo';

export default function PrescriptionPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [rx, setRx] = useState<any>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/prescriptions/' + id).then(setRx).catch((e) => setError(e.message));
  }, [id]);

  if (error) return <div className="alert-error">{error}</div>;
  if (!rx) return <div className="py-12 text-center text-ink-400">Cargando receta…</div>;

  const p = rx.patient;
  const age = p?.birthDate ? Math.floor((Date.now() - new Date(p.birthDate).getTime()) / (365.25 * 86400000)) : null;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center justify-between print:hidden">
        <Link href={`/prescriptions?patientId=${rx.patientId}`} className="inline-flex items-center gap-1 text-sm text-clinical-700"><ArrowLeft className="h-4 w-4" /> Recetas</Link>
        <button onClick={() => window.print()} className="btn-primary"><Printer className="h-4 w-4" /> Imprimir</button>
      </div>

      <article className="card relative overflow-hidden p-8 print:border-0 print:shadow-none">
        {rx.status === 'ANNULLED' && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <span className="-rotate-12 rounded-xl border-4 border-red-500 px-6 py-2 text-5xl font-black uppercase tracking-widest text-red-500/60">Anulada</span>
          </div>
        )}
        <header className="flex items-start justify-between border-b border-ink-200 pb-5">
          <div className="flex items-center gap-3">
            <LogoMark className="h-10 w-10" />
            <div>
              <div className="font-display text-xl font-semibold">Receta odontológica</div>
              <div className="text-xs text-ink-500">Dr/a. {rx.doctor?.firstName} {rx.doctor?.lastName} · {rx.doctor?.email}</div>
            </div>
          </div>
          <div className="text-right text-xs">
            <div className="font-mono text-sm font-semibold">{rx.number}</div>
            <div className="text-ink-500">{new Date(rx.signedAt).toLocaleString('es-EC')}</div>
          </div>
        </header>

        <section className="grid grid-cols-2 gap-4 border-b border-ink-100 py-4 text-sm sm:grid-cols-4">
          <div className="col-span-2"><div className="text-xs text-ink-400">Paciente</div><div className="font-semibold">{p?.firstName} {p?.lastName}</div></div>
          <div><div className="text-xs text-ink-400">Documento</div><div>{p?.documentType} {p?.documentNumber}</div></div>
          <div><div className="text-xs text-ink-400">Edad</div><div>{age !== null ? `${age} años` : '—'}</div></div>
          {p?.medicalHistory?.allergies && (
            <div className="col-span-full"><div className="text-xs text-ink-400">Alergias</div><div className="font-medium text-red-700">{p.medicalHistory.allergies}</div></div>
          )}
          {rx.diagnosis && <div className="col-span-full"><div className="text-xs text-ink-400">Diagnóstico</div><div>{rx.diagnosis}</div></div>}
        </section>

        <section className="py-5">
          <div className="mb-3 font-display text-2xl italic text-clinical-700">Rp/</div>
          <ol className="space-y-4">
            {rx.items.map((it: any, i: number) => (
              <li key={it.id} className="text-sm">
                <div className="font-semibold">{i + 1}. {it.medication} {it.presentation && <span className="font-normal text-ink-600">— {it.presentation}</span>}</div>
                <div className="ml-4 text-ink-700">
                  {it.dose}, {it.frequency}, durante {it.duration} · Vía {it.route.toLowerCase()}
                  {it.quantity && <> · Cantidad: {it.quantity}</>}
                </div>
                {it.instructions && <div className="ml-4 text-xs italic text-ink-500">{it.instructions}</div>}
              </li>
            ))}
          </ol>
          {rx.indications && (
            <div className="mt-5 rounded-lg bg-ink-50 p-3 text-sm"><span className="font-semibold">Indicaciones:</span> {rx.indications}</div>
          )}
        </section>

        <footer className="mt-6 flex items-end justify-between border-t border-ink-200 pt-5 text-xs text-ink-500">
          <div className="max-w-[60%] break-all font-mono text-[10px]">Firma electrónica: {rx.signatureData.startsWith('sha256:') ? rx.signatureData : 'firma manuscrita digital'}</div>
          <div className="text-center">
            <div className="mb-1 w-48 border-b border-ink-400" />
            Dr/a. {rx.doctor?.firstName} {rx.doctor?.lastName}
          </div>
        </footer>
        {rx.status === 'ANNULLED' && <p className="mt-4 text-xs text-red-600">Anulada el {new Date(rx.annulledAt).toLocaleString('es-EC')}: {rx.annulReason}</p>}
      </article>
    </div>
  );
}
