import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/** The "Sign out" button. */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL('/login?notice=signed-out', request.url), { status: 303 });
}

/**
 * Reached from requireUser when a signed-in account has no profile (not linked to any
 * organization). Sign it out and explain why, instead of bouncing silently.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  await supabase.auth.signOut();
  const notice = data?.claims ? '?notice=no-profile' : '';
  return NextResponse.redirect(new URL(`/login${notice}`, request.url), { status: 303 });
}
