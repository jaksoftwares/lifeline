'use server';

import { z } from 'zod';
import { parseForm, run, type FormState } from '@/lib/actions';
import { normalizeEmail } from '@/lib/auth-errors';
import { appUrl, sendEmails } from '@/lib/email';
import { createAdminClient } from '@/lib/supabase/server';

const schema = z.object({
  email: z
    .string()
    .transform(normalizeEmail)
    .pipe(z.email({ error: 'Enter a valid email address' })),
});

/**
 * Emails a one-time link to set a new password. The answer is the same whether or not the
 * account exists, so the form cannot be used to find out who is registered.
 */
export async function requestPasswordReset(_: FormState, formData: FormData): Promise<FormState> {
  return run(async () => {
    const { email } = parseForm(schema, formData);
    const { data, error } = await createAdminClient().auth.admin.generateLink({
      type: 'recovery',
      email,
    });
    if (!error && data.properties?.hashed_token) {
      await sendEmails([
        {
          to: email,
          subject: 'Reset your Afyaline password',
          heading: 'Reset your password',
          lines: [
            'Someone (hopefully you) asked to reset the password for this Afyaline account.',
            'The link works once and expires in one hour. If you did not ask, ignore this email.',
          ],
          action: {
            label: 'Choose a new password',
            href: `${appUrl()}/auth/reset?token=${encodeURIComponent(data.properties.hashed_token)}`,
          },
        },
      ]);
    }
    return 'If an account exists for this email, a reset link is on its way. Check your inbox and spam folder.';
  });
}
