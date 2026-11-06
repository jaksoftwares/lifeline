import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Plus } from 'lucide-react';
import {
  TRANSFER_LIST_SELECT,
  TransferList,
  needsAction,
  type TransferListItem,
} from '@/components/transfer/transfer-list';
import { buttonClass, PageHeader } from '@/components/ui';
import { requireUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Transfers' };

export default async function TransfersPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { profile, organization: org } = await requireUser();
  if (profile.role === 'driver' && !profile.is_platform_admin) redirect('/trip');
  const supabase = await createClient();
  const base = () =>
    supabase
      .from('transfers')
      .select(TRANSFER_LIST_SELECT)
      .order('requested_at', { ascending: false })
      .limit(100);

  // Ambulance provider: trips requested from us. Platform admin: everything.
  if (!org || org.type === 'ambulance_provider') {
    const { data } = org ? await base().eq('provider_id', org.id) : await base();
    return (
      <>
        <PageHeader
          title={org ? 'Trips' : 'All transfers'}
          description={org ? 'Ambulance requests and trips for your fleet.' : undefined}
        />
        <TransferList
          transfers={(data as TransferListItem[]) ?? []}
          orgId={org?.id}
          empty={org ? 'No ambulance requests yet.' : 'No transfers yet.'}
        />
      </>
    );
  }

  // Hospital: outgoing and incoming.
  const [outgoing, incoming] = await Promise.all([
    base().eq('sending_hospital_id', org.id),
    base().eq('receiving_hospital_id', org.id),
  ]);
  const lists = {
    outgoing: (outgoing.data as TransferListItem[]) ?? [],
    incoming: (incoming.data as TransferListItem[]) ?? [],
  };
  const pending = {
    outgoing: lists.outgoing.filter((t) => needsAction(t, org.id)).length,
    incoming: lists.incoming.filter((t) => needsAction(t, org.id)).length,
  };
  const { tab: requested } = await searchParams;
  const tab =
    requested === 'incoming' || requested === 'outgoing'
      ? requested
      : pending.incoming
        ? 'incoming'
        : 'outgoing';

  return (
    <>
      <PageHeader
        title="Transfers"
        actions={
          <Link href="/transfers/new" className={buttonClass('primary')}>
            <Plus className="h-4 w-4" /> New transfer
          </Link>
        }
      />
      <div className="mb-4 flex gap-1 rounded-lg bg-slate-200/60 p-1 text-sm font-semibold sm:w-fit">
        {(['outgoing', 'incoming'] as const).map((t) => (
          <Link
            key={t}
            href={`/transfers?tab=${t}`}
            className={`flex flex-1 items-center justify-center gap-2 rounded-md px-4 py-2 capitalize ${
              tab === t ? 'bg-white shadow-sm' : 'text-slate-600 hover:text-ink'
            }`}
          >
            {t}
            {pending[t] > 0 && (
              <span className="rounded-full bg-amber-500 px-1.5 text-xs text-white">
                {pending[t]}
              </span>
            )}
          </Link>
        ))}
      </div>
      <TransferList
        transfers={lists[tab]}
        orgId={org.id}
        empty={
          tab === 'incoming'
            ? 'No patients have been referred to you yet.'
            : 'You have not sent any transfers yet.'
        }
      />
    </>
  );
}
