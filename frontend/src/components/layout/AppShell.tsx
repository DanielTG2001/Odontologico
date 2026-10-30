'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Menu, Clock } from 'lucide-react';
import { useAuthStore } from '@/lib/auth-store';
import { useIdleLogout } from '@/lib/use-idle-logout';
import { Sidebar } from './Sidebar';
import { findNavItem } from './nav';
import { PwaBanners } from '@/components/pwa/PwaBanners';

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { token, hydrate, logout } = useAuthStore();
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    hydrate();
    if (!localStorage.getItem('token')) {
      router.replace('/login');
    } else {
      setReady(true);
    }
  }, [hydrate, router]);

  const secondsLeft = useIdleLogout(() => {
    logout();
    router.replace('/login?reason=idle');
  });

  if (!ready && !token) return null;

  const current = findNavItem(pathname);
  const today = new Date().toLocaleDateString('es-EC', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <div className="min-h-screen">
      <Sidebar open={open} onClose={() => setOpen(false)} />
      <div className="lg:pl-[var(--sidebar-width)]">
        <header
          data-topbar
          className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-ink-100 bg-white/80 px-4 backdrop-blur-md sm:px-6 lg:px-8"
        >
          <button
            onClick={() => setOpen(true)}
            className="-ml-1 rounded-lg p-2 text-ink-600 hover:bg-ink-50 lg:hidden"
            aria-label="Abrir menú"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex min-w-0 items-center gap-2 text-sm">
            <span className="hidden text-ink-400 sm:inline">SIGO‑Dental</span>
            <span className="hidden text-ink-300 sm:inline">/</span>
            <span className="truncate font-semibold text-ink-800">{current?.label ?? 'Inicio'}</span>
          </div>
          <div className="ml-auto hidden items-center gap-2 text-xs font-medium capitalize text-ink-500 md:flex">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            {today}
          </div>
        </header>

        <PwaBanners />

        {secondsLeft !== null && (
          <div className="sticky top-14 z-20 flex items-center justify-center gap-2 bg-amber-50 px-4 py-2 text-sm text-amber-900 shadow-sm">
            <Clock className="h-4 w-4" />
            Por inactividad, la sesión se cerrará en <b>{secondsLeft}s</b>. Mueve el ratón o toca la pantalla para continuar.
          </div>
        )}

        <main className="mx-auto w-full max-w-[1400px] animate-fade-up p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
