'use client';

import { AlertTriangle } from 'lucide-react';
import { Button, Card } from '@/components/ui';

export default function AppError({ reset }: { error: Error; reset: () => void }) {
  return (
    <Card className="mx-auto mt-10 max-w-md p-8 text-center">
      <AlertTriangle className="mx-auto h-10 w-10 text-amber-500" />
      <h1 className="mt-4 text-lg font-bold">Something went wrong</h1>
      <p className="mt-2 text-sm text-slate-600">
        Check your connection and try again. If a patient transfer is urgent, call the other party
        directly while this is resolved.
      </p>
      <Button className="mt-6" onClick={reset}>
        Try again
      </Button>
    </Card>
  );
}
