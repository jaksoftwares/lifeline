import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/** Opens a password-reset link: signs the person in with the one-time token, then asks for a new password. */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token');
  const to = (path: string) => NextResponse.redirect(new URL(path, request.url));
  if (!token) return to('/login?notice=link-invalid');

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ type: 'recovery', token_hash: token });
  if (error) return to('/login?notice=link-invalid');
  return to('/reset-password');
}
