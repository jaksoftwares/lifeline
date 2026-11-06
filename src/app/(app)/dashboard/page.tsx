import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { BarChart3, Plus } from 'lucide-react';
import { StatTile } from '@/components/charts';
import {
  TRANSFER_LIST_SELECT,
  TransferList,
  needsAction,
  type TransferListItem,
} from '@/components/transfer/transfer-list';
import { buttonClass, PageHeader } from '@/components/ui';
import { requireUser } from '@/lib/auth';
import { ACTIVE_STATUSES } from '@/lib/constants';
import { money } from '@/lib/format';
import { formatMinutes } from '@/lib/metrics';
import { homeFor } from '@/lib/navigation';
import { loadStats, summarize } from '@/lib/stats';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Dashboard' };

export default async function DashboardPage() {
  const user = await requireUser();
  if (homeFor(user) !== '/dashboard') redirect(homeFor(user));
  const org = user.organization;
  const supabase = await createClient();

  // Everything still in progress that this organization is part of (RLS limits the rest).
  let activeQuery = supabase
    .from('transfers')
    .select(TRANSFER_LIST_SELECT)
    .in('status', ACTIVE_STATUSES)
    .order('requested_at', { ascending: false })
    .limit(100);
  if (org?.type === 'hospital') {
    activeQuery = activeQuery.or(
      `sending_hospital_id.eq.${org.id},receiving_hospital_id.eq.${org.id}`,
    );
  } else if (org) {
    activeQuery = activeQuery.eq('provider_id', org.id);
  }

  const [{ data: activeRows }, stats, { data: fleet }, { count: hospitals }] = await Promise.all([
    activeQuery,
    loadStats(user, 30),
    supabase.from('ambulances').select('status, provider_id'),
    supabase
      .from('organizations')
      .select('id', { count: 'exact', head: true })
      .eq('type', 'hospital'),
  ]);
  const active = (activeRows as TransferListItem[]) ?? [];
  const todo = active.filter((t) => needsAction(t, org?.id));
  const rest = active.filter((t) => !needsAction(t, org?.id));
  const s = summarize(stats);

  const ambulances = (fleet ?? []).filter((a) => !org || a.provider_id === org.id);
  const available = ambulances.filter((a) => a.status === 'available').length;
  const firstName = user.profile.full_name.split(' ').find((w) => !w.endsWith('.')) ?? '';

  return (
    <>
      <PageHeader
        title={org ? `Welcome, ${firstName}` : 'Network overview'}
        description={org?.name ?? 'Every hospital and ambulance provider on Afyaline'}
        actions={
          <>
            <Link href="/reports" className={buttonClass('secondary')}>
              <BarChart3 className="h-4 w-4" /> Reports
            </Link>
            {org?.type === 'hospital' && (
              <Link href="/transfers/new" className={buttonClass('primary')}>
                <Plus className="h-4 w-4" /> New transfer
              </Link>
            )}
          </>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {org?.type === 'hospital' && (
          <>
            <StatTile label="Needs your action" value={todo.length} />
            <StatTile label="In progress" value={active.length} />
            <StatTile
              label="Completed, last 30 days"
              value={s.completed}
              sub={`${s.outgoing} sent · ${s.incoming} received`}
            />
            <StatTile label="Median request to handover" value={formatMinutes(s.median.total)} />
          </>
        )}
        {org?.type === 'ambulance_provider' && (
          <>
            <StatTile label="Requests waiting" value={todo.length} />
            <StatTile
              label="Ambulances available"
              value={`${available} of ${ambulances.length}`}
              sub={`${ambulances.filter((a) => a.status === 'on_trip').length} on trips`}
            />
            <StatTile
              label="Trips completed, last 30 days"
              value={s.completed}
              sub={`${s.km.toLocaleString()} km`}
            />
            <StatTile
              label="Trip costs, last 30 days"
              value={money(s.cost.total)}
              sub={`${money(s.cost.perTransfer)} per trip`}
            />
          </>
        )}
        {!org && (
          <>
            <StatTile
              label="Transfers completed, last 30 days"
              value={s.completed}
              sub={`Median ${formatMinutes(s.median.total)} from request to handover`}
              hero
            />
            <StatTile
              label="In progress now"
              value={active.length}
              sub={`${s.acceptanceRate ?? '—'}% of requests accepted`}
            />
            <StatTile label="Hospitals" value={hospitals ?? 0} />
            <StatTile label="Ambulances available" value={`${available} of ${ambulances.length}`} />
          </>
        )}
      </div>

      {org && todo.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-lg font-semibold">Needs your action</h2>
          <TransferList
            transfers={todo}
            orgId={org.id}
            empty="Nothing needs your action right now."
          />
        </section>
      )}
      <section className="mt-8">
        <h2 className="mb-3 text-lg font-semibold">In progress</h2>
        <TransferList
          transfers={org ? rest : active}
          orgId={org?.id}
          empty="No transfers in progress."
        />
      </section>
    </>
  );
}
