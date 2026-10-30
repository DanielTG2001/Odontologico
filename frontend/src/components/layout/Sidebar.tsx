'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { LogOut, X } from 'lucide-react';
import { useAuthStore } from '@/lib/auth-store';
import { cn } from '@/lib/utils';
import { navForRole, ROLE_LABELS } from './nav';
import { LogoMark } from './Logo';
import { InstallButton } from '@/components/pwa/InstallButton';

export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuthStore();
  const groups = navForRole(user?.role);
  const initials = user ? `${user.firstName?.[0] ?? ''}${user.lastName?.[0] ?? ''}`.toUpperCase() : '';

  return (
    <>
      {/* Fondo para el cajón en tablet/móvil */}
      <div
        onClick={onClose}
        className={cn(
          'fixed inset-0 z-30 bg-ink-950/40 backdrop-blur-[2px] transition-opacity lg:hidden',
          open ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
      />
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex w-[var(--sidebar-width)] flex-col bg-clinical-950 text-white transition-transform duration-300 lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -left-24 -top-24 h-64 w-64 rounded-full bg-clinical-500/20 blur-3xl" />
          <div className="absolute -bottom-32 -right-20 h-72 w-72 rounded-full bg-clinical-700/30 blur-3xl" />
        </div>

        <div className="relative flex h-[68px] items-center justify-between px-5">
          <Link href="/dashboard" className="flex items-center gap-3" onClick={onClose}>
            <LogoMark />
            <div className="leading-tight">
              <div className="font-display text-[19px] font-semibold">SIGO‑Dental</div>
              <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-clinical-300/80">
                Expediente clínico
              </div>
            </div>
          </Link>
          <button onClick={onClose} className="rounded-md p-1.5 text-clinical-200 hover:bg-white/10 lg:hidden" aria-label="Cerrar menú">
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="relative flex-1 space-y-6 overflow-y-auto px-3 py-4">
          {groups.map((g) => (
            <div key={g.title}>
              <div className="mb-1.5 px-3 text-[10.5px] font-semibold uppercase tracking-[0.16em] text-clinical-300/60">
                {g.title}
              </div>
              <div className="space-y-0.5">
                {g.items.map((item) => {
                  const active = pathname === item.href || pathname.startsWith(item.href + '/');
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={onClose}
                      className={cn(
                        'group relative flex items-center gap-3 rounded-lg px-3 py-2 text-[13.5px] font-medium transition',
                        active
                          ? 'bg-white/[0.09] text-white'
                          : 'text-clinical-100/75 hover:bg-white/[0.05] hover:text-white',
                      )}
                    >
                      {active && <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r bg-clinical-300" />}
                      <Icon className={cn('h-[18px] w-[18px] shrink-0', active ? 'text-clinical-300' : 'opacity-70 group-hover:opacity-100')} />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="relative border-t border-white/10 p-3">
          {user && (
            <div className="mb-2 flex items-center gap-3 rounded-lg px-2 py-2">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-clinical-500/25 text-sm font-semibold text-clinical-100 ring-1 ring-clinical-300/30">
                {initials}
              </div>
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold">{user.firstName} {user.lastName}</div>
                <div className="truncate text-xs text-clinical-300/80">{ROLE_LABELS[user.role] ?? user.role}</div>
              </div>
            </div>
          )}
          <InstallButton className="mb-1 text-clinical-100/70 hover:bg-white/[0.06] hover:text-white" />
          <button
            onClick={() => { logout(); router.push('/login'); }}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-clinical-100/70 hover:bg-white/[0.06] hover:text-white"
          >
            <LogOut className="h-4 w-4" /> Cerrar sesión
          </button>
        </div>
      </aside>
    </>
  );
}
