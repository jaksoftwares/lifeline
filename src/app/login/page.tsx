import type { Metadata } from 'next';
import Link from 'next/link';
import { Logo } from '@/components/logo';
import { Card } from '@/components/ui';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Sign in' };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <Link href="/" className="mb-8">
        <Logo />
      </Link>
      <Card className="w-full max-w-sm p-6 sm:p-8">
        <h1 className="text-xl font-bold">Sign in</h1>
        <p className="mb-6 mt-1 text-sm text-slate-600">
          Hospitals, ambulance providers and drivers.
        </p>
        <LoginForm next={next} />
      </Card>
      <p className="mt-6 text-sm text-slate-600">
        New to Afyaline?{' '}
        <Link href="/register" className="font-semibold text-brand-700 hover:underline">
          Register your organization
        </Link>
      </p>
    </main>
  );
}
