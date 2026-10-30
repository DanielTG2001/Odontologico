'use client';

import { create } from 'zustand';
import type { User } from '@/types';
import { clearPwaPageCache } from './pwa-store';

interface AuthState {
  user: User | null;
  token: string | null;
  setAuth: (user: User, token: string) => void;
  logout: () => void;
  hydrate: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: null,
  setAuth: (user, token) => {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
    localStorage.setItem('lastActivity', String(Date.now()));
    set({ user, token });
  },
  logout: () => {
    // Revoca el token en el servidor (Redis); no bloquea la salida si falla
    const t = localStorage.getItem('token');
    if (t) {
      fetch((process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api') + '/auth/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${t}` },
        keepalive: true,
      }).catch(() => undefined);
    }
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('lastActivity');
    clearPwaPageCache();
    set({ user: null, token: null });
  },
  hydrate: () => {
    const token = localStorage.getItem('token');
    const userStr = localStorage.getItem('user');
    if (token && userStr) {
      try {
        set({ token, user: JSON.parse(userStr) });
      } catch {
        localStorage.clear();
      }
    }
  },
}));
