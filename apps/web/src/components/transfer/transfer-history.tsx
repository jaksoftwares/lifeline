'use client';

import { type TransferEventView } from '@lifeline/schemas';
import { Card, CardHeader } from '@lifeline/ui';
import { formatDateTime } from '@/lib/format';

function describe(e: TransferEventView): string {
  const who = e.institution?.name ?? 'the provider';
  switch (e.type) {
    case 'REQUESTED':
      return 'Transport requested';
    case 'UPDATED':
      return 'Transport needs changed';
    case 'OFFERED':
      return `Offered to ${who}`;
    case 'OFFER_WITHDRAWN':
      return `Offer to ${who} withdrawn`;
    case 'CONFIRMED':
      return `Confirmed by ${who}`;
    case 'DECLINED':
      return `Declined by ${who}`;
    case 'REASSIGNED':
      return 'Ambulance or crew changed';
    case 'RELEASED':
      return `Released by ${who}`;
    case 'EXTERNAL_ARRANGED':
      return 'Transport arranged outside Lifeline';
    case 'DISPATCHED':
      return 'Ambulance dispatched';
    case 'CANCELLED':
      return 'Transport cancelled';
    default:
      return e.type;
  }
}

/** The transfer's permanent record: every offer, answer and status change, with who and when. */
export function TransferHistory({ events }: { events: TransferEventView[] }) {
  return (
    <Card>
      <CardHeader
        title="Transport history"
        description="Every change is recorded and cannot be edited."
      />
      <ol className="px-5 py-4">
        {events.map((e, i) => (
          <li key={e.id} className="relative pb-4 pl-5 last:pb-0">
            {i < events.length - 1 && (
              <span aria-hidden className="absolute top-2 left-[5px] h-full w-px bg-border" />
            )}
            <span
              aria-hidden
              className="absolute top-1.5 left-0 size-[11px] rounded-full border-2 border-teal-deep bg-surface"
            />
            <p className="text-sm font-medium text-ink">{describe(e)}</p>
            <p className="tabular text-xs text-slate">
              {formatDateTime(e.occurredAt)}
              {e.actor && ` · ${e.actor.fullName}`}
            </p>
            {e.note && <p className="mt-0.5 text-xs text-slate">{e.note}</p>}
          </li>
        ))}
      </ol>
    </Card>
  );
}
