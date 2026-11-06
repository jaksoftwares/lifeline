'use client';

import { formatAge, SEX_LABELS } from '@lifeline/domain';
import { type ReferralSummary } from '@lifeline/schemas';
import { Alert, Card, cn, EmptyState, Loading, StatusChip } from '@lifeline/ui';
import { ArrowRight, Inbox, Plus } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { PageHeader } from '@/components/app-shell';
import { ReferralStatusChip, RequestStatusChip, UrgencyChip } from '@/components/referral-chips';
import { formatAgo } from '@/lib/format';
import { useReferrals } from '@/lib/queries';
import { useSession } from '@/lib/session';

type Box = 'outgoing' | 'incoming' | 'network';

const BOX_LABELS: Record<Box, string> = {
  outgoing: 'Sent by my facility',
  incoming: 'Received',
  network: 'Whole network',
};

export default function ReferralsPage() {
  const { network, user, can, scopeFor } = useSession();
  const facilityRoles = user.memberships.filter(
    (m) => m.network.id === network.id && m.institution?.type === 'FACILITY',
  );
  const viewScope = scopeFor('referral:view');
  const boxes: Box[] = [
    ...(facilityRoles.length > 0 ? (['outgoing', 'incoming'] as const) : []),
    ...(viewScope === 'ALL' ? (['network'] as const) : []),
  ];
  // People who mostly receive (decision-makers) start on the incoming box.
  const startsIncoming = can('referral:respond') && !can('referral:create');
  const [box, setBox] = useState<Box>(
    boxes.includes('incoming') && startsIncoming ? 'incoming' : (boxes[0] ?? 'network'),
  );
  const [open, setOpen] = useState(true);
  const referrals = useReferrals(network.id, box, open);

  return (
    <>
      <PageHeader
        title="Referrals"
        description="Referrals sent by or to your facility."
        actions={
          can('referral:create') && (
            <Link
              href="/referrals/new"
              className="inline-flex h-10 items-center gap-2 rounded-sm bg-teal-deep px-4 text-sm font-medium text-white hover:bg-navy"
            >
              <Plus aria-hidden className="size-4" /> New referral
            </Link>
          )
        }
      />

      <div className="mb-4 flex flex-wrap items-end justify-between gap-3 border-b border-border">
        <div role="tablist" aria-label="Referral lists" className="flex gap-1">
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
          Open referrals only
        </label>
      </div>

      {referrals.isPending && <Loading label="Loading referrals…" />}
      {referrals.isError && (
        <Alert tone="critical" title="We couldn’t load referrals">
          {referrals.error.message}
        </Alert>
      )}
      {referrals.data?.length === 0 && (
        <Card>
          <EmptyState
            icon={Inbox}
            title={open ? 'No referrals need attention.' : 'No referrals yet.'}
          />
        </Card>
      )}
      {referrals.data && referrals.data.length > 0 && (
        <ul className="space-y-3">
          {referrals.data.map((r) => (
            <ReferralRow key={r.id} referral={r} showFrom={box !== 'outgoing'} />
          ))}
        </ul>
      )}
    </>
  );
}

function ReferralRow({ referral: r, showFrom }: { referral: ReferralSummary; showFrom: boolean }) {
  return (
    <li>
      <Link
        href={`/referrals/${r.id}`}
        className={cn(
          'block rounded-md border bg-surface px-5 py-4 hover:border-teal-deep focus-visible:outline-2',
          r.nextAction
            ? 'border-teal-deep/60 shadow-[inset_3px_0_0_var(--color-teal-deep)]'
            : 'border-border',
        )}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-navy">{r.patient.displayName}</span>
              <span className="text-sm text-slate">
                {SEX_LABELS[r.patient.sex]} · {formatAge(r.patient.ageYears)}
              </span>
            </p>
            <p className="tabular mt-0.5 text-xs text-slate">
              {r.reference}
              {showFrom && ` · from ${r.referringInstitution.name}`} · updated{' '}
              {formatAgo(r.updatedAt)}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <UrgencyChip urgency={r.urgency} />
            <ReferralStatusChip status={r.status} />
          </div>
        </div>
        {(r.requests.length > 0 || r.nextAction) && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <ul className="flex flex-wrap gap-x-4 gap-y-1.5">
              {r.requests.map((q) => (
                <li key={q.id} className="flex items-center gap-1.5 text-sm text-ink">
                  {q.institution.name}
                  <RequestStatusChip status={q.status} />
                </li>
              ))}
            </ul>
            {r.nextAction && (
              <StatusChip tone="info" className="font-semibold">
                {r.nextAction} <ArrowRight aria-hidden className="size-3.5" />
              </StatusChip>
            )}
          </div>
        )}
      </Link>
    </li>
  );
}
