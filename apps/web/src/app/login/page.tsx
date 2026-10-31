import { type Metadata } from 'next';
import { Suspense } from 'react';
import { SignInFlow } from './sign-in-flow';

export const metadata: Metadata = { title: 'Sign in' };

export default function LoginPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-surface-subtle px-4 py-10">
      <Suspense>
        <SignInFlow />
      </Suspense>
    </main>
  );
}
