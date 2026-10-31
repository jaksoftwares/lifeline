'use client';

import { Alert, Loading } from '@lifeline/ui';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { PageHeader } from '@/components/app-shell';
import { UrgencyChip } from '@/components/referral-chips';
import { TransferPanel } from '@/components/transfer/transfer-panel';
import { useTransfer } from '@/lib/queries';

export default function TransferPage() {
  const { id } = useParams<{ id: string }>();
  const transfer = useTransfer(id);

  if (transfer.isPending) return <Loading label="Loading transfer…" />;
  if (transfer.isError) {
    return (
      <Alert tone="critical" title="We couldn’t load this transfer">
        {transfer.error.message}
      </Alert>
    );
  }
  const t = transfer.data;

  return (
    <>
      <Link
        href="/transfers"
        className="mb-3 inline-flex items-center gap-1 text-sm text-teal-deep hover:underline"
      >
        <ArrowLeft aria-hidden className="size-4" /> Transfers
      </Link>
      <PageHeader
        title={t.patient?.displayName ?? `Transfer ${t.referral.reference}`}
        description={`${t.referral.reference} · ${t.pickup.name} to ${t.destination.name}`}
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <UrgencyChip urgency={t.referral.urgency} />
            {t.viewer.canViewReferral && (
              <Link
                href={`/referrals/${t.referral.id}`}
                className="text-sm text-teal-deep hover:underline"
              >
                Open the referral
              </Link>
            )}
          </div>
        }
      />
      <div className="max-w-3xl">
        <TransferPanel transferId={t.id} />
      </div>
    </>
  );
}
