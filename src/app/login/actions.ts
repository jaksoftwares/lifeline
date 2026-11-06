'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { ActionError, parseForm, run, type FormState } from '@/lib/actions';
import { authErrorMessage, normalizeEmail } from '@/lib/auth-errors';
import { createClient } from '@/lib/supabase/server';

const schema = z.object({
  email: z
    .string()
    .transform(normalizeEmail)
    .pipe(z.email({ error: 'Enter a valid email address' })),
  password: z.string().min(1, 'Enter your password'),
  next: z.string().optional(),
});

export async function login(_: FormState, formData: FormData): Promise<FormState> {
  return run(async () => {
    const input = parseForm(schema, formData);
    const supabase = await createClient();

    const { data, error } = await supabase.auth.signInWithPassword({
      email: input.email,
      password: input.password,
    });
    if (error) {
      throw new ActionError(
        authErrorMessage(error),
        error.code === 'invalid_credentials' ? 'password' : undefined,
      );
    }

    // Every account belongs to an organization through its profile. Without one, the app
    // cannot work, so explain it rather than bouncing the person back to this page.
    const { data: profile } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', data.user.id)
      .maybeSingle();
    if (!profile) {
      await supabase.auth.signOut();
      throw new ActionError(
        'This account is not linked to a hospital or ambulance provider. Register your organization, or ask your administrator to add you.',
      );
    }

    // Only follow internal paths after sign-in.
    const next = input.next;
    redirect(next && next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard');
  });
}
