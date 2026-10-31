import { type FieldError } from './types';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly fieldErrors: Record<string, string> = {},
  ) {
    super(message);
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'DELETE' | 'PATCH';
  body?: unknown;
  query?: Record<string, string | number | undefined>;
  /** Sign-in calls must not trigger a token refresh on 401. */
  skipRefresh?: boolean;
}

let refreshInFlight: Promise<boolean> | null = null;

/** Concurrent 401s share one refresh request. */
function refreshSession(): Promise<boolean> {
  refreshInFlight ??= fetch('/api/auth/refresh', { method: 'POST' })
    .then((res) => res.ok)
    .catch(() => false)
    .finally(() => {
      refreshInFlight = null;
    });
  return refreshInFlight;
}

function signInAgain(): void {
  const next = window.location.pathname + window.location.search;
  window.location.assign(`/login?next=${encodeURIComponent(next)}&expired=1`);
}

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  const url = `/api${path}${params.size ? `?${params}` : ''}`;
  const send = () =>
    fetch(url, {
      method: options.method ?? 'GET',
      headers: options.body === undefined ? undefined : { 'content-type': 'application/json' },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });

  let res: Response;
  try {
    res = await send();
  } catch {
    throw new ApiError(0, 'Connection lost. Check your network and try again.');
  }

  if (res.status === 401 && !options.skipRefresh) {
    if (await refreshSession()) {
      res = await send();
    } else {
      signInAgain();
      throw new ApiError(401, 'Your session has ended. Sign in again.');
    }
  }

  if (!res.ok) throw await toApiError(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

async function toApiError(res: Response): Promise<ApiError> {
  const body = (await res.json().catch(() => null)) as {
    message?: unknown;
    errors?: FieldError[];
  } | null;
  const fieldErrors = Object.fromEntries((body?.errors ?? []).map((e) => [e.path, e.message]));
  const message =
    typeof body?.message === 'string'
      ? body.message
      : res.status >= 500
        ? 'Something went wrong on our side. Try again, or contact your administrator if it continues.'
        : 'The request could not be completed.';
  return new ApiError(res.status, message, fieldErrors);
}
