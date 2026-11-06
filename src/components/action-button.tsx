'use client';

import { useState, useTransition, type ReactNode } from 'react';
import type { FormState } from '@/lib/actions';
import { Alert, Button } from './ui';

/** A full-size button that runs a server action (optionally after confirming) and shows the result. */
export function ActionButton({
  action,
  children,
  confirm,
  variant = 'primary',
  className,
}: {
  action: () => Promise<FormState>;
  children: ReactNode;
  confirm?: string;
  variant?: 'primary' | 'secondary' | 'danger';
  className?: string;
}) {
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<FormState>({});

  return (
    <div className="space-y-2">
      {state.error && <Alert>{state.error}</Alert>}
      <Button
        variant={variant}
        disabled={pending}
        className={className ?? 'w-full sm:w-auto'}
        onClick={() => {
          if (confirm && !window.confirm(confirm)) return;
          startTransition(async () => setState(await action()));
        }}
      >
        {pending ? 'Working…' : children}
      </Button>
    </div>
  );
}
