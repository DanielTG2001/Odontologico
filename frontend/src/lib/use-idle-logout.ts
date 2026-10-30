'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * RNF-05: cierre automático de sesión tras N minutos de inactividad
 * (15 min por defecto en estaciones clínicas). Avisa 60 s antes.
 */
export function useIdleLogout(onTimeout: () => void, minutes = Number(process.env.NEXT_PUBLIC_IDLE_MINUTES || 15)) {
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const lastActivity = useRef(Date.now());
  const cb = useRef(onTimeout);
  cb.current = onTimeout;

  useEffect(() => {
    const limit = minutes * 60 * 1000;
    const warnAt = Math.max(limit - 60_000, 0);
    try {
      const stored = Number(localStorage.getItem('lastActivity'));
      if (stored && Date.now() - stored > limit) {
        cb.current();
        return;
      }
    } catch {}

    const bump = () => {
      lastActivity.current = Date.now();
      try { localStorage.setItem('lastActivity', String(lastActivity.current)); } catch {}
      setSecondsLeft(null);
    };
    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'wheel'];
    events.forEach((e) => window.addEventListener(e, bump, { passive: true }));
    bump();

    const timer = window.setInterval(() => {
      // Sincroniza entre pestañas
      let last = lastActivity.current;
      try { last = Math.max(last, Number(localStorage.getItem('lastActivity')) || 0); } catch {}
      const idle = Date.now() - last;
      if (idle >= limit) {
        window.clearInterval(timer);
        cb.current();
      } else if (idle >= warnAt) {
        setSecondsLeft(Math.ceil((limit - idle) / 1000));
      } else {
        setSecondsLeft(null);
      }
    }, 1000);

    return () => {
      events.forEach((e) => window.removeEventListener(e, bump));
      window.clearInterval(timer);
    };
  }, [minutes]);

  return secondsLeft;
}
