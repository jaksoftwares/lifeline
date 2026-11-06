import 'server-only';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { createClient } from './supabase/server';
import type { Organization, Profile } from './types';

export interface CurrentUser {
  profile: Profile;
  organization: Organization | null;
}

/** The signed-in user with their profile and organization, or null. Cached per request. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('*, organization:organizations(*)')
    .eq('id', userId)
    .maybeSingle();
  if (!profile) return null;

  const { organization, ...rest } = profile as Profile & { organization: Organization | null };
  return { profile: rest, organization };
});

/** Like getCurrentUser, but sends signed-out visitors to the login page. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect('/signout');
  return user;
}
