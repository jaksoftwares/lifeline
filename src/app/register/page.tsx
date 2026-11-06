import type { Metadata } from 'next';
import Link from 'next/link';
import { Logo } from '@/components/logo';
import { Card } from '@/components/ui';
import { RegisterForm } from './register-form';

export const metadata: Metadata = { title: 'Register' };

export default function RegisterPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <Link href="/" className="mb-8 inline-block">
        <Logo />
      </Link>
      <Card className="p-6 sm:p-8">
        <h1 className="text-xl font-bold">Register your organization</h1>
        <p className="mb-6 mt-1 text-sm text-slate-600">Takes two minutes.</p>
        <RegisterForm />
      </Card>
      <p className="mt-6 text-center text-sm text-slate-600">
        Already registered?{' '}
        <Link href="/login" className="font-semibold text-brand-700 hover:underline">
          Sign in
        </Link>
      </p>
    </main>
  );
}
