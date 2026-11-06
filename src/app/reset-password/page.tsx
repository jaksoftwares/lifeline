import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { ActionForm } from '@/components/form';
import { Logo } from '@/components/logo';
import { PasswordInput } from '@/components/password-input';
import { Card, Field } from '@/components/ui';
import { createClient } from '@/lib/supabase/server';
import { updatePassword } from './actions';

export const metadata: Metadata = { title: 'Choose a new password' };

export default async function ResetPasswordPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect('/login?notice=link-invalid');

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <div className="mb-8">
        <Logo />
      </div>
      <Card className="w-full max-w-sm p-6 sm:p-8">
        <h1 className="text-xl font-bold">Choose a new password</h1>
        <p className="mb-6 mt-1 text-sm text-slate-600">
          For {String(data.claims.email ?? 'your account')}
        </p>
        <ActionForm action={updatePassword} submit="Save password" pendingLabel="Saving…" fullWidth>
          <Field label="New password" hint="At least 8 characters">
            <PasswordInput name="password" autoComplete="new-password" autoFocus />
          </Field>
          <Field label="Type it again">
            <PasswordInput name="confirm" autoComplete="new-password" />
          </Field>
        </ActionForm>
      </Card>
    </main>
  );
}
