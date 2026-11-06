'use client';

import { useTransition, useState } from 'react';
import type { FormState } from '@/lib/actions';

/** A small inline button that asks for confirmation, runs a server action and shows any error. */
export function ConfirmAction({
  action,
  label,
  confirm,
}: {
  action: () => Promise<FormState>;
  label: string;
  confirm: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState('');

  return (
    <span className="inline-flex flex-col items-end">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (!window.confirm(confirm)) return;
          startTransition(async () => setError((await action()).error ?? ''));
        }}
        className="text-sm font-medium text-red-600 hover:underline disabled:opacity-50"
      >
        {pending ? '…' : label}
      </button>
      {error && <span className="mt-1 text-xs text-red-600">{error}</span>}
    </span>
  );
}
