'use client';

import { startTransition, useActionState, useEffect, useRef, type ReactNode } from 'react';
import type { FormState } from '@/lib/actions';
import { Alert, Button } from './ui';

/**
 * Points the user at the field an error is about: marks it invalid, scrolls to it and focuses it.
 * Hidden inputs (e.g. the map location) scroll their surrounding block into view instead.
 */
export function useFieldError(form: React.RefObject<HTMLFormElement | null>, state: FormState) {
  useEffect(() => {
    const root = form.current;
    if (!root) return;
    root
      .querySelectorAll('[aria-invalid="true"]')
      .forEach((el) => el.removeAttribute('aria-invalid'));
    if (!state.field) return;
    const el = root.querySelector<HTMLElement>(`[name="${CSS.escape(state.field)}"]`);
    if (!el) return;
    el.setAttribute('aria-invalid', 'true');
    if (el instanceof HTMLInputElement && el.type === 'hidden') {
      el.parentElement?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.focus({ preventScroll: true });
    }
    const clear = () => el.removeAttribute('aria-invalid');
    el.addEventListener('input', clear, { once: true });
    return () => el.removeEventListener('input', clear);
  }, [form, state]);
}

/**
 * A form wired to a server action, showing its error/success message and a pending button.
 * Fields keep their values when there is an error (React would otherwise clear them).
 */
export function ActionForm({
  action,
  submit,
  pendingLabel = 'Saving…',
  children,
  className = 'space-y-4',
  resetOnSuccess = false,
  variant = 'primary',
  fullWidth = false,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  submit: string;
  pendingLabel?: string;
  children: ReactNode;
  className?: string;
  /** Clear the fields after success (for "add" forms). */
  resetOnSuccess?: boolean;
  variant?: 'primary' | 'secondary' | 'danger';
  /** Full-width submit button on every screen size (e.g. sign-in). */
  fullWidth?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const ref = useRef<HTMLFormElement>(null);
  useFieldError(ref, state);

  useEffect(() => {
    if (resetOnSuccess && state.success) ref.current?.reset();
  }, [state, resetOnSuccess]);

  return (
    <form
      ref={ref}
      className={className}
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        startTransition(() => formAction(data));
      }}
    >
      {state.error && <Alert>{state.error}</Alert>}
      {state.success && <Alert tone="green">{state.success}</Alert>}
      {children}
      <Button
        type="submit"
        variant={variant}
        disabled={pending}
        className={fullWidth ? 'w-full' : 'w-full sm:w-auto'}
      >
        {pending ? pendingLabel : submit}
      </Button>
    </form>
  );
}
