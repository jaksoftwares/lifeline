import { type CookieOptions, type Response } from 'express';

export const ACCESS_COOKIE = 'll_at';
export const REFRESH_COOKIE = 'll_rt';
/** Not a credential: lets the web app's middleware tell signed-in browsers from signed-out ones. */
export const SESSION_HINT_COOKIE = 'll_session';

export const ACCESS_TTL_SECONDS = 15 * 60;
const REFRESH_PATH = '/api/auth';

export interface IssuedTokens {
  accessToken: string;
  /** Absent when an access token was reissued without rotating the refresh token. */
  refreshToken?: string;
  sessionExpiresAt: Date;
}

export function setAuthCookies(res: Response, tokens: IssuedTokens, secure: boolean): void {
  const base: CookieOptions = { httpOnly: true, secure, sameSite: 'lax', path: '/' };
  res.cookie(ACCESS_COOKIE, tokens.accessToken, { ...base, maxAge: ACCESS_TTL_SECONDS * 1000 });
  if (tokens.refreshToken) {
    res.cookie(REFRESH_COOKIE, tokens.refreshToken, {
      ...base,
      sameSite: 'strict',
      path: REFRESH_PATH,
      expires: tokens.sessionExpiresAt,
    });
  }
  res.cookie(SESSION_HINT_COOKIE, '1', {
    ...base,
    httpOnly: false,
    expires: tokens.sessionExpiresAt,
  });
}

export function clearAuthCookies(res: Response, secure: boolean): void {
  res.clearCookie(ACCESS_COOKIE, { path: '/', secure, sameSite: 'lax', httpOnly: true });
  res.clearCookie(REFRESH_COOKIE, {
    path: REFRESH_PATH,
    secure,
    sameSite: 'strict',
    httpOnly: true,
  });
  res.clearCookie(SESSION_HINT_COOKIE, { path: '/', secure, sameSite: 'lax' });
}
