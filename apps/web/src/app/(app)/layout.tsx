'use client';

import { Alert, Button, Loading } from '@lifeline/ui';
import { type ReactNode } from 'react';
import { AppShell } from '@/components/app-shell';
import { SessionProvider, useMe } from '@/lib/session';

export default function SignedInLayout({ children }: { children: ReactNode }) {
  const me = useMe();

  if (me.isPending) return <Loading label="Loading your workspace…" className="min-h-dvh" />;
  if (me.isError) {
    return (
      <main className="mx-auto max-w-md px-4 py-16">
        <Alert tone="critical" title="We couldn’t load your account">
          Try again, or contact your administrator if the issue continues.
        </Alert>
        <Button variant="secondary" className="mt-4" onClick={() => void me.refetch()}>
          Try again
        </Button>
      </main>
    );
  }
  if (me.data.memberships.length === 0) {
    return (
      <main className="mx-auto max-w-md px-4 py-16">
        <Alert tone="warning" title="You don’t have a role yet">
          Ask your facility or network administrator to give you access.
        </Alert>
      </main>
    );
  }

  return (
    <SessionProvider user={me.data}>
      <AppShell>{children}</AppShell>
    </SessionProvider>
  );
}
