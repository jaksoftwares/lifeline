'use client';

import { CAPABILITY_LABELS } from '@lifeline/domain';
import { type TransferSummary } from '@lifeline/schemas';
import { Alert, Card, cn, EmptyState, Loading, StatusChip } from '@lifeline/ui';
import { ArrowRight, Ambulance } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { PageHeader } from '@/components/app-shell';
import { UrgencyChip } from '@/components/referral-chips';
import { TransferStatusChip } from '@/components/transport-chips';
import { formatAgo } from '@/lib/format';
import { useTransfers } from '@/lib/queries';
import { useSession } from '@/lib/session';

type Box = 'facility' | 'provider' | 'network';

const BOX_LABELS: Record<Box, string> = {
  facility: 'My facility',
  provider: 'Dispatch',
  network: 'Whole network',
};

export default function TransfersPage() {
  const { network, user, scopeFor } = useSession();
  const mine = user.memberships.filter((m) => m.network.id === network.id);
  const boxes: Box[] = [
    ...(mine.some((m) => m.institution?.type === 'FACILITY') ? (['facility'] as const) : []),
    ...(mine.some((m) => m.institution?.type === 'AMBULANCE_PROVIDER')
      ? (['provider'] as const)
      : []),
    ...(scopeFor('transfers:monitor') === 'ALL' ? (['network'] as const) : []),
  ];
  const [box, setBox] = useState<Box>(boxes[0] ?? 'network');
  const [open, setOpen] = useState(true);
  const transfers = useTransfers(network.id, box, open);

  return (
    <>
      <PageHeader
        title="Transfers"
        description={
          box === 'provider'
            ? 'Transfers offered to your ambulances, and the trips you’ve confirmed.'
            : 'Patients moving between facilities, and the ambulances taking them.'
        }
      />

      <div className="mb-4 flex flex-wrap items-end justify-between gap-3 border-b border-border">
        <div role="tablist" aria-label="Transfer lists" className="flex gap-1">
          {boxes.map((b) => (
            <button
              key={b}
              role="tab"
              aria-selected={box === b}
              onClick={() => setBox(b)}
              className={cn(
                '-mb-px border-b-2 px-4 py-2 text-sm font-medium',
                box === b
                  ? 'border-teal-deep text-navy'
                  : 'border-transparent text-slate hover:text-ink',
              )}
            >
              {BOX_LABELS[b]}
            </button>
          ))}
        </div>
        <label className="mb-2 flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            className="size-4 accent-teal-deep"
            checked={open}
            onChange={(e) => setOpen(e.target.checked)}
          />
          Open transfers only
        </label>
      </div>

      {transfers.isPending && <Loading label="Loading transfers…" />}
      {transfers.isError && (
        <Alert tone="critical" title="We couldn’t load transfers">
          {transfers.error.message}
        </Alert>
      )}
      {transfers.data?.length === 0 && (
        <Card>
          <EmptyState
            icon={Ambulance}
            title={open ? 'No transfers need attention.' : 'No transfers yet.'}
          />
        </Card>
      )}
      {transfers.data && transfers.data.length > 0 && (
        <ul className="space-y-2">
          {transfers.data.map((t) => (
            <TransferRow key={t.id} transfer={t} />
          ))}
        </ul>
      )}
    </>
  );
}

function TransferRow({ transfer: t }: { transfer: TransferSummary }) {
  const current = t.current;
  return (
    <li>
      <Link
        href={`/transfers/${t.id}`}
        className="block rounded-md border border-border bg-surface p-4 hover:border-teal-deep"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <p className="font-medium text-ink">
              {t.patient?.displayName ?? 'Patient details shared after you confirm'}
              <span className="tabular ml-2 text-sm font-normal text-slate">
                {t.referral.reference}
              </span>
            </p>
            <p className="flex flex-wrap items-center gap-1.5 text-sm text-slate">
              {t.pickup.name} <ArrowRight aria-hidden className="size-3.5" /> {t.destination.name}
            </p>
            <p className="text-sm text-slate">
              {CAPABILITY_LABELS[t.requiredCapability]}
              {current &&
                ` · ${[current.providerName, current.vehicleRegistration].filter(Boolean).join(' · ')}`}
            </p>
            {t.attention && <p className="text-sm font-medium text-ink">{t.attention}</p>}
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <div className="flex flex-wrap justify-end gap-1.5">
              <UrgencyChip urgency={t.referral.urgency} />
              <TransferStatusChip status={t.status} />
            </div>
            {t.nextAction && <StatusChip tone="info">{t.nextAction}</StatusChip>}
            <span className="text-xs text-slate">Updated {formatAgo(t.updatedAt)}</span>
          </div>
        </div>
      </Link>
    </li>
  );
}
