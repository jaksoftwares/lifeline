'use client';

import { startTransition, useActionState, useEffect, useRef, type ReactNode } from 'react';
import type { FormState } from '@/lib/actions';
import { Alert, Button } from './ui';

/**
 * A form wired to a server action, showing its error/success message and a pending button.
 * Fields keep their values when there is an error (React would otherwise clear them).
 */
export function ActionForm({
  action,
  submit,
  children,
  className = 'space-y-4',
  resetOnSuccess = false,
  variant = 'primary',
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  submit: string;
  children: ReactNode;
  className?: string;
  /** Clear the fields after success (for "add" forms). */
  resetOnSuccess?: boolean;
  variant?: 'primary' | 'secondary' | 'danger';
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (resetOnSuccess && state.success) ref.current?.reset();
  }, [state, resetOnSuccess]);

  return (
    <form
      ref={ref}
      className={className}
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        startTransition(() => formAction(data));
      }}
    >
      {state.error && <Alert>{state.error}</Alert>}
      {state.success && <Alert tone="green">{state.success}</Alert>}
      {children}
      <Button type="submit" variant={variant} disabled={pending} className="w-full sm:w-auto">
        {pending ? 'Saving…' : submit}
      </Button>
    </form>
  );
}
