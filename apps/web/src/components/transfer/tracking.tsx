'use client';

import {
  FRESHNESS_LABELS,
  isTracked,
  TRANSFER_STATUS_LABELS,
  type TransferStatus,
} from '@lifeline/domain';
import { type TransferDetail } from '@lifeline/schemas';
import { Alert, Card, CardHeader, cn } from '@lifeline/ui';
import { Check } from 'lucide-react';
import dynamic from 'next/dynamic';
import { formatAgo, formatMinutes, formatWhen } from '@/lib/format';

const TransferMap = dynamic(() => import('@/components/transfer-map'), {
  ssr: false,
  loading: () => <div className="h-[360px] animate-pulse rounded-b-md bg-surface-subtle" />,
});

/** The ambulance's position, how fresh it is, and when it should arrive. */
export function Tracking({ transfer: t }: { transfer: TransferDetail }) {
  if (!t.tracking) return null;
  const { position, eta, path } = t.tracking;
  const label = t.current?.vehicle?.registration ?? 'Ambulance';

  return (
    <Card>
      <CardHeader
        title="Live tracking"
        description={
          position
            ? `Last position ${formatAgo(position.recordedAt)} (${formatWhen(position.recordedAt)})${position.accuracy ? `, within ${Math.round(position.accuracy)} m` : ''}.`
            : 'Waiting for the first position from the crew app.'
        }
      />
      <div className="space-y-3 px-5 py-4">
        {eta && (
          <p className="text-lg font-semibold text-navy">
            About {formatMinutes(eta.minutes)} to{' '}
            {eta.target === 'PICKUP' ? 'the pickup' : t.destination.name}
            <span className="ml-2 text-sm font-normal text-slate">
              {eta.source === 'ROAD' ? 'by road' : 'estimate from straight-line distance'}
            </span>
          </p>
        )}
        {position && position.freshness !== 'LIVE' && (
          <Alert
            tone={position.freshness === 'LOST' ? 'critical' : 'warning'}
            title={FRESHNESS_LABELS[position.freshness]}
          >
            {position.freshness === 'LOST'
              ? 'No arrival estimate is shown from a position this old.'
              : 'Positions queued on the phone are sent when signal returns.'}
            {t.current?.provider?.phone && ` Dispatch: ${t.current.provider.phone}.`}
          </Alert>
        )}
      </div>
      <TransferMap
        places={[
          { ...t.pickup, role: 'pickup' },
          { ...t.destination, role: 'destination' },
        ]}
        ambulances={
          position
            ? [
                {
                  id: t.id,
                  label: `${label} · ${formatAgo(position.recordedAt)}`,
                  latitude: position.latitude,
                  longitude: position.longitude,
                  freshness: position.freshness,
                },
              ]
            : []
        }
        path={path}
      />
    </Card>
  );
}

const STEPS: { status: TransferStatus; at: (t: TransferDetail) => string | null }[] = [
  { status: 'AWAITING_TRANSPORT', at: (t) => t.requestedAt },
  { status: 'AMBULANCE_ASSIGNED', at: (t) => t.assignedAt },
  { status: 'DISPATCHED', at: (t) => t.dispatchedAt },
  { status: 'AT_PICKUP', at: (t) => t.atPickupAt },
  { status: 'PATIENT_COLLECTED', at: (t) => t.collectedAt },
  { status: 'IN_TRANSIT', at: () => null },
  { status: 'ARRIVED', at: (t) => t.arrivedAt },
  { status: 'HANDED_OVER', at: (t) => t.handedOverAt },
  { status: 'COMPLETED', at: (t) => t.completedAt },
];

/** The journey as a list of steps, readable without the map. */
export function JourneySteps({ transfer: t }: { transfer: TransferDetail }) {
  if (t.status === 'CANCELLED') return null;
  const order = STEPS.map((s) => s.status);
  const reached =
    t.status === 'INTERRUPTED' ? order.indexOf('IN_TRANSIT') : order.indexOf(t.status);
  const beyond = reached < 0;

  return (
    <ol className="grid gap-2 sm:grid-cols-3 lg:grid-cols-9" aria-label="Journey">
      {STEPS.map((step, i) => {
        const done = beyond || i < reached;
        const current = !beyond && i === reached;
        const at = step.at(t);
        return (
          <li
            key={step.status}
            aria-current={current ? 'step' : undefined}
            className={cn(
              'rounded-md border px-2.5 py-2 text-xs',
              current
                ? 'border-teal-deep bg-teal-soft'
                : done
                  ? 'border-border'
                  : 'border-dashed border-border text-muted',
            )}
          >
            <span className="flex items-center gap-1 font-medium text-ink">
              {done && <Check aria-hidden className="size-3.5 text-success" />}
              {step.status === 'AWAITING_TRANSPORT'
                ? 'Requested'
                : TRANSFER_STATUS_LABELS[step.status]}
            </span>
            {at && (done || current) && (
              <span className="tabular text-slate">{formatWhen(at)}</span>
            )}
            {current && t.status === 'INTERRUPTED' && (
              <span className="block font-medium text-critical">Problem reported</span>
            )}
            {current && isTracked(t.status) && !at && <span className="text-slate">Now</span>}
          </li>
        );
      })}
    </ol>
  );
}
