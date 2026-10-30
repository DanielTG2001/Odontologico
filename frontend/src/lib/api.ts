const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

export class ApiError extends Error {
  constructor(message: string, public status: number, public body: any) {
    super(message);
  }
}

function clearSession() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  localStorage.removeItem('lastActivity');
}

export async function api<T = any>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  const isForm = typeof FormData !== 'undefined' && options.body instanceof FormData;

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      ...(isForm ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  const body = await res.json().catch(() => ({ message: res.statusText }));

  if (typeof window !== 'undefined' && token && !path.startsWith('/auth/')) {
    // Token vencido / revocado → volver al login
    if (res.status === 401) {
      clearSession();
      window.location.href = '/login?reason=expired';
    }
    // MFA obligatoria y aún no configurada (RNF-05)
    if (res.status === 403 && body?.code === 'MFA_SETUP_REQUIRED') {
      clearSession();
      window.location.href = '/login?reason=mfa';
    }
  }

  if (!res.ok) {
    const msg = Array.isArray(body?.message) ? body.message.join('. ') : body?.message;
    throw new ApiError(msg || `Error ${res.status}`, res.status, body);
  }

  return body as T;
}

/** Descarga autenticada (RIDE, XML…) y la abre en una pestaña o como archivo. */
export async function openAuthed(path: string, opts: { download?: string } = {}) {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  // Abrimos la pestaña antes del await para que el navegador no la bloquee como popup
  const win = !opts.download ? window.open('', '_blank') : null;
  const res = await fetch(`${API_URL}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) {
    win?.close();
    const body = await res.json().catch(() => ({}));
    throw new ApiError(body?.message || `Error ${res.status}`, res.status, body);
  }
  const url = URL.createObjectURL(await res.blob());
  if (opts.download) {
    const a = document.createElement('a');
    a.href = url;
    a.download = opts.download;
    a.click();
  } else if (win) {
    win.location.href = url;
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
