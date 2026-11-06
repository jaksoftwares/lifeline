import Link from 'next/link';
import { Logo } from '@/components/logo';
import { buttonClass } from '@/components/ui';

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <Logo />
      <h1 className="mt-8 text-2xl font-bold">Page not found</h1>
      <p className="mt-2 max-w-sm text-slate-600">
        This page does not exist, or you do not have access to it.
      </p>
      <Link href="/dashboard" className={buttonClass('primary', 'mt-6')}>
        Go to your dashboard
      </Link>
    </main>
  );
}
