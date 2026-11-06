'use client';

import Link from 'next/link';
import { Logo } from '@/components/logo';
import { Button, buttonClass } from '@/components/ui';

/** Error screen for public pages (sign-in, registration, password reset). */
export default function RootError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <Logo />
      <h1 className="mt-8 text-2xl font-bold">Something went wrong</h1>
      <p className="mt-2 max-w-sm text-slate-600">Check your internet connection and try again.</p>
      <div className="mt-6 flex gap-3">
        <Button onClick={reset}>Try again</Button>
        <Link href="/" className={buttonClass('secondary')}>
          Home
        </Link>
      </div>
    </main>
  );
}
