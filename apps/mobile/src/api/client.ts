import { MOBILE_CLIENT_HEADER, type MobileTokens } from '@lifeline/schemas';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';

/** Set EXPO_PUBLIC_API_URL to point a build at another server; app.json holds the emulator default. */
export const API_URL =
  process.env.EXPO_PUBLIC_API_URL ??
  (Constants.expoConfig?.extra as { apiUrl?: string } | undefined)?.apiUrl ??
  'http://10.0.2.2:4000/api';

const ACCESS_KEY = 'lifeline.accessToken';
const REFRESH_KEY = 'lifeline.refreshToken';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly fieldErrors: Record<string, string> = {},
  ) {
    super(message);
  }
}

export const SESSION_ENDED = 'Your session has ended. Sign in again.';

let accessToken: string | null = null;
let refreshing: Promise<boolean> | null = null;

export async function saveTokens(tokens: MobileTokens): Promise<void> {
  accessToken = tokens.accessToken;
  await SecureStore.setItemAsync(ACCESS_KEY, tokens.accessToken);
  // A refresh that didn't rotate keeps the current refresh token.
  if (tokens.refreshToken) await SecureStore.setItemAsync(REFRESH_KEY, tokens.refreshToken);
}

export async function clearTokens(): Promise<void> {
  accessToken = null;
  await SecureStore.deleteItemAsync(ACCESS_KEY);
  await SecureStore.deleteItemAsync(REFRESH_KEY);
}

/** True when a session was saved on this phone; it may still have expired on the server. */
export async function hasSavedSession(): Promise<boolean> {
  accessToken ??= await SecureStore.getItemAsync(ACCESS_KEY);
  return (await SecureStore.getItemAsync(REFRESH_KEY)) !== null;
}

/** Exchanges the refresh token for new tokens. One refresh at a time, shared by concurrent calls. */
function refresh(): Promise<boolean> {
  refreshing ??= (async () => {
    const refreshToken = await SecureStore.getItemAsync(REFRESH_KEY);
    if (!refreshToken) return false;
    const res = await fetch(`${API_URL}/auth/mobile/refresh`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    if (res.status === 401) {
      await clearTokens();
      return false;
    }
    if (!res.ok) throw new ApiError('Couldn’t renew your session. Try again.', res.status);
    await saveTokens((await res.json()) as MobileTokens);
    return true;
  })().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

/**
 * Calls the API with the saved session. Network failures surface as the fetch error (the app treats
 * them as "offline"); server answers that aren't OK become ApiError with the server's message.
 */
export async function api<T>(
  path: string,
  options: { method?: string; body?: unknown; retried?: boolean } = {},
): Promise<T> {
  accessToken ??= await SecureStore.getItemAsync(ACCESS_KEY);
  const res = await fetch(`${API_URL}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      'content-type': 'application/json',
      [MOBILE_CLIENT_HEADER]: 'mobile',
      ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  if (res.status === 401 && !options.retried && !path.startsWith('/auth/')) {
    if (await refresh()) return api<T>(path, { ...options, retried: true });
    throw new ApiError(SESSION_ENDED, 401);
  }
  if (res.status === 204) return undefined as T;
  const body = (await res.json().catch(() => ({}))) as {
    message?: string | string[];
    errors?: { path: string; message: string }[];
  };
  if (!res.ok) {
    const message = Array.isArray(body.message) ? body.message.join(' ') : body.message;
    throw new ApiError(
      message ?? 'Something went wrong. Try again.',
      res.status,
      Object.fromEntries((body.errors ?? []).map((e) => [e.path, e.message])),
    );
  }
  return body as T;
}
