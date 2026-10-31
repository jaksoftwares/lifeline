import { type NextRequest, NextResponse } from 'next/server';

/**
 * Sends signed-out browsers to the sign-in page. This is a convenience only: the API authorises
 * every request, so a forged hint cookie gains nothing.
 */
export function middleware(request: NextRequest) {
  if (request.cookies.has('ll_session')) return NextResponse.next();
  const url = request.nextUrl.clone();
  const next = request.nextUrl.pathname + request.nextUrl.search;
  url.pathname = '/login';
  url.search = next === '/' ? '' : `?next=${encodeURIComponent(next)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/((?!login|api|_next|icon.svg|manifest.webmanifest|favicon.ico).*)'],
};
