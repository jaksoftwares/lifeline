import type { Metadata } from 'next';
import Link from 'next/link';
import { ActionForm } from '@/components/form';
import { Logo } from '@/components/logo';
import { Card, Field, Input } from '@/components/ui';
import { requestPasswordReset } from './actions';

export const metadata: Metadata = { title: 'Reset password' };

export default function ForgotPasswordPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <Link href="/" className="mb-8">
        <Logo />
      </Link>
      <Card className="w-full max-w-sm p-6 sm:p-8">
        <h1 className="text-xl font-bold">Reset your password</h1>
        <p className="mb-6 mt-1 text-sm text-slate-600">
          Enter your email and we will send you a link to choose a new password.
        </p>
        <ActionForm
          action={requestPasswordReset}
          submit="Send reset link"
          pendingLabel="Sending…"
          fullWidth
        >
          <Field label="Email">
            <Input
              name="email"
              type="email"
              autoComplete="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              autoFocus
            />
          </Field>
        </ActionForm>
      </Card>
      <p className="mt-6 text-sm text-slate-600">
        Remembered it?{' '}
        <Link href="/login" className="font-semibold text-brand-700 hover:underline">
          Sign in
        </Link>
      </p>
    </main>
  );
}
