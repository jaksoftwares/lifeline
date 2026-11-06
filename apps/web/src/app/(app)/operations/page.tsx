'use client';

import { FRESHNESS_LABELS } from '@lifeline/domain';
import { type TransferSummary } from '@lifeline/schemas';
import { Alert, Card, CardHeader, EmptyState, Loading } from '@lifeline/ui';
import { ArrowRight, Radar } from 'lucide-react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { PageHeader } from '@/components/app-shell';
import { UrgencyChip } from '@/components/referral-chips';
import { TransferStatusChip } from '@/components/transport-chips';
import { formatAgo, formatMinutes } from '@/lib/format';
import { useTransfers } from '@/lib/queries';
import { useSession } from '@/lib/session';

const TransferMap = dynamic(() => import('@/components/transfer-map'), {
  ssr: false,
  loading: () => <div className="h-[420px] animate-pulse rounded-b-md bg-surface-subtle" />,
});

/** Why a transfer needs someone to look at it now, or null. */
function concern(t: TransferSummary): string | null {
  if (t.status === 'INTERRUPTED') return 'Problem reported by the crew';
  if (t.tracking?.position && t.tracking.position.freshness !== 'LIVE')
    return FRESHNESS_LABELS[t.tracking.position.freshness];
  if (t.tracking && !t.tracking.position) return 'No position received yet';
  return t.attention;
}

export default function OperationsPage() {
  const { network } = useSession();
  const transfers = useTransfers(network.id, 'network', true);

  if (transfers.isPending) return <Loading label="Loading the network’s transfers…" />;
  if (transfers.isError)
    return (
      <Alert tone="critical" title="We couldn’t load transfers">
        {transfers.error.message}
      </Alert>
    );

  const all = transfers.data;
  const count = (pred: (t: TransferSummary) => boolean) => all.filter(pred).length;
  const tiles: [string, number][] = [
    ['Awaiting an ambulance', count((t) => t.status === 'AWAITING_TRANSPORT')],
    ['Ambulance assigned', count((t) => t.status === 'AMBULANCE_ASSIGNED')],
    ['On the way to pickup', count((t) => t.status === 'DISPATCHED' || t.status === 'AT_PICKUP')],
    [
      'Carrying the patient',
      count((t) => ['PATIENT_COLLECTED', 'IN_TRANSIT', 'INTERRUPTED'].includes(t.status)),
    ],
    ['Arrived, awaiting handover', count((t) => t.status === 'ARRIVED')],
  ];
  const attention = all
    .map((t) => ({ t, why: concern(t) }))
    .filter((x): x is { t: TransferSummary; why: string } => x.why !== null)
    .sort((a, b) => a.t.requestedAt.localeCompare(b.t.requestedAt));
  const moving = all.filter((t) => t.tracking?.position);

  return (
    <>
      <PageHeader
        title="Operations"
        description="Open network transfers and ambulance locations."
      />
      <div className="space-y-6">
        <ul className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {tiles.map(([label, n]) => (
            <li key={label} className="rounded-md border border-border bg-surface p-4">
              <p className="tabular font-display text-3xl font-bold text-navy">{n}</p>
              <p className="text-sm text-slate">{label}</p>
            </li>
          ))}
        </ul>

        <Card>
          <CardHeader title="Needs attention" description="Longest waiting first." />
          {attention.length === 0 ? (
            <p className="px-5 py-4 text-sm text-slate">Nothing needs attention right now.</p>
          ) : (
            <ul className="divide-y divide-border">
              {attention.map(({ t, why }) => (
                <TransferLine key={t.id} transfer={t} note={why} />
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Ambulances on transfers"
            description={`${moving.length} with a reported position.`}
          />
          <TransferMap
            height={420}
            ambulances={moving.map((t) => ({
              id: t.id,
              label: `${t.current?.vehicleRegistration ?? 'Ambulance'} · ${t.referral.reference}`,
              latitude: t.tracking!.position!.latitude,
              longitude: t.tracking!.position!.longitude,
              freshness: t.tracking!.position!.freshness,
              detail: `${t.pickup.name} to ${t.destination.name} · position ${formatAgo(t.tracking!.position!.recordedAt)}`,
              href: `/transfers/${t.id}`,
            }))}
          />
        </Card>

        <Card>
          <CardHeader title="All open transfers" />
          {all.length === 0 ? (
            <EmptyState icon={Radar} title="No open transfers." />
          ) : (
            <ul className="divide-y divide-border">
              {all.map((t) => (
                <TransferLine key={t.id} transfer={t} />
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}

function TransferLine({ transfer: t, note }: { transfer: TransferSummary; note?: string }) {
  const position = t.tracking?.position;
  const eta = t.tracking?.eta;
  return (
    <li>
      <Link
        href={`/transfers/${t.id}`}
        className="flex flex-wrap items-start justify-between gap-3 px-5 py-3 hover:bg-surface-subtle"
      >
        <div className="min-w-0 space-y-0.5">
          <p className="text-sm font-medium text-ink">
            {t.referral.reference}
            {t.patient && (
              <span className="ml-2 font-normal text-slate">{t.patient.displayName}</span>
            )}
          </p>
          <p className="flex flex-wrap items-center gap-1 text-sm text-slate">
            {t.pickup.name} <ArrowRight aria-hidden className="size-3.5" /> {t.destination.name}
            {t.current?.vehicleRegistration && ` · ${t.current.vehicleRegistration}`}
          </p>
          {note && <p className="text-sm font-medium text-ink">{note}</p>}
          {(position || eta) && (
            <p className="text-xs text-slate">
              {position && `Position ${formatAgo(position.recordedAt)}`}
              {eta &&
                ` · about ${formatMinutes(eta.minutes)} to ${eta.target === 'PICKUP' ? 'pickup' : 'destination'}`}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <UrgencyChip urgency={t.referral.urgency} />
          <TransferStatusChip status={t.status} />
        </div>
      </Link>
    </li>
  );
}
