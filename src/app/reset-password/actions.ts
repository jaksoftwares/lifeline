'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { ActionError, parseForm, run, type FormState } from '@/lib/actions';
import { authErrorMessage } from '@/lib/auth-errors';
import { createClient } from '@/lib/supabase/server';

const schema = z
  .object({
    password: z.string().min(8, 'Use at least 8 characters'),
    confirm: z.string().min(1, 'Type the new password again'),
    from: z.string().optional(),
  })
  .refine((v) => v.password === v.confirm, {
    message: 'The two passwords do not match',
    path: ['confirm'],
  });

export async function updatePassword(_: FormState, formData: FormData): Promise<FormState> {
  return run(async () => {
    const { password, from } = parseForm(schema, formData);
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    if (!data.user) {
      throw new ActionError(
        'Your reset link has expired. Request a new one from the sign-in page.',
      );
    }
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw new ActionError(authErrorMessage(error), 'password');
    if (from === 'account') return 'Password changed.';
    redirect('/dashboard');
  });
}
