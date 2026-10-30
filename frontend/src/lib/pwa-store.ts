'use client';

import { create } from 'zustand';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface PwaState {
  installEvent: BeforeInstallPromptEvent | null;
  installed: boolean;
  online: boolean;
  waitingWorker: ServiceWorker | null;
  setInstallEvent: (e: BeforeInstallPromptEvent | null) => void;
  setInstalled: (v: boolean) => void;
  setOnline: (v: boolean) => void;
  setWaitingWorker: (w: ServiceWorker | null) => void;
  install: () => Promise<boolean>;
  applyUpdate: () => void;
}

export const usePwa = create<PwaState>((set, get) => ({
  installEvent: null,
  installed: false,
  online: true,
  waitingWorker: null,
  setInstallEvent: (installEvent) => set({ installEvent }),
  setInstalled: (installed) => set({ installed }),
  setOnline: (online) => set({ online }),
  setWaitingWorker: (waitingWorker) => set({ waitingWorker }),
  install: async () => {
    const e = get().installEvent;
    if (!e) return false;
    await e.prompt();
    const { outcome } = await e.userChoice;
    set({ installEvent: null });
    return outcome === 'accepted';
  },
  applyUpdate: () => get().waitingWorker?.postMessage('SKIP_WAITING'),
}));

export function isIos() {
  if (typeof navigator === 'undefined') return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export function isStandalone() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true;
}

/** Borra las páginas guardadas por el service worker (al cerrar sesión) */
export function clearPwaPageCache() {
  if (typeof navigator !== 'undefined' && navigator.serviceWorker?.controller) {
    navigator.serviceWorker.controller.postMessage('CLEAR_PAGES');
  }
}
