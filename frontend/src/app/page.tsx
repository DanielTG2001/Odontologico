'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth-store';

export default function Home() {
  const router = useRouter();
  const { token, hydrate } = useAuthStore();

  useEffect(() => {
    hydrate();
    const t = localStorage.getItem('token');
    router.replace(t ? '/dashboard' : '/login');
  }, [hydrate, router]);

  return (
    <div className="flex h-screen items-center justify-center">
      <div className="text-clinical-600 text-lg font-medium">Cargando SIGO-Dental…</div>
    </div>
  );
}
