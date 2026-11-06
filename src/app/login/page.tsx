import type { Metadata } from 'next';
import Link from 'next/link';
import { Logo } from '@/components/logo';
import { Alert, Card } from '@/components/ui';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Sign in' };

const NOTICES: Record<string, { tone: 'red' | 'green'; text: string }> = {
  'link-invalid': {
    tone: 'red',
    text: 'That reset link is invalid or has expired. Request a new one below.',
  },
  'no-profile': {
    tone: 'red',
    text: 'Your account is not linked to a hospital or ambulance provider. Ask your administrator to add you.',
  },
  'signed-out': { tone: 'green', text: 'You have been signed out.' },
  registered: { tone: 'green', text: 'Your organization is registered. Sign in to continue.' },
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; notice?: string }>;
}) {
  const { next, notice } = await searchParams;
  const message = notice ? NOTICES[notice] : undefined;

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
        {message && (
          <div className="mb-4">
            <Alert tone={message.tone}>{message.text}</Alert>
          </div>
        )}
        {next && !message && (
          <p className="mb-4 rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-600">
            Sign in to continue.
          </p>
        )}
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
