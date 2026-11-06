'use client';

import Link from 'next/link';
import { ActionForm } from '@/components/form';
import { PasswordInput } from '@/components/password-input';
import { Field, Input } from '@/components/ui';
import { login } from './actions';

export function LoginForm({ next }: { next?: string }) {
  return (
    <ActionForm action={login} submit="Sign in" pendingLabel="Signing in…" fullWidth>
      <input type="hidden" name="next" value={next ?? ''} />
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
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <label htmlFor="password" className="text-sm font-medium text-slate-700">
            Password
          </label>
          <Link
            href="/forgot-password"
            className="text-sm font-semibold text-brand-700 hover:underline"
          >
            Forgot password?
          </Link>
        </div>
        <PasswordInput id="password" name="password" autoComplete="current-password" />
      </div>
    </ActionForm>
  );
}
