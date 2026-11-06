import { AppShell } from '@/components/app-shell';
import { LiveUpdates } from '@/components/live-updates';
import { requireUser } from '@/lib/auth';
import { navFor } from '@/lib/navigation';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <AppShell
      nav={navFor(user)}
      userName={user.profile.full_name}
      orgName={user.organization?.name ?? 'Afyaline platform'}
    >
      <LiveUpdates
        orgId={user.organization?.id ?? null}
        userId={user.profile.id}
        isDriver={user.profile.role === 'driver'}
      />
      {children}
    </AppShell>
  );
}
