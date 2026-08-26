const API_BASE = '/api';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(
  path: string,
  options: RequestInit & { token?: string } = {},
): Promise<T> {
  const { token, headers, ...rest } = options;
  const res = await fetch(`${API_BASE}${path}`, {
    ...rest,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new ApiError(res.status, body.error ?? `Request failed (${res.status})`);
  }

  return res.json() as Promise<T>;
}

export function login(email: string, password: string) {
  return request<{ token: string; email: string }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export function fetchCloudState(token: string) {
  return request<{ data: unknown; updatedAt: string | null }>('/state', { token });
}

export function saveCloudState(token: string, data: unknown, opts?: { keepalive?: boolean }) {
  return request<{ ok: true }>('/state', {
    method: 'PUT',
    token,
    body: JSON.stringify({ data }),
    keepalive: opts?.keepalive,
  });
}
