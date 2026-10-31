'use client';

import { type ReferralEventView } from '@lifeline/schemas';
import { Card, CardHeader } from '@lifeline/ui';
import { formatDateTime } from '@/lib/format';

function describe(e: ReferralEventView): string {
  const where = e.institution?.name ?? 'the facility';
  switch (e.type) {
    case 'CREATED':
      return 'Referral started';
    case 'SUBMITTED':
      return 'Referral sent';
    case 'REQUEST_SENT':
      return `Sent to ${where}`;
    case 'INFO_REQUESTED':
      return `${where} asked for more information`;
    case 'INFO_PROVIDED':
      return 'Information provided';
    case 'ACCEPTED':
      return `Accepted by ${where}`;
    case 'DECLINED':
      return `Declined by ${where}`;
    case 'WITHDRAWN':
      return `Request to ${where} withdrawn`;
    case 'CANCELLED':
      return 'Referral cancelled';
    case 'ASSESSMENT_RECORDED':
      return 'Observations recorded';
    case 'ATTACHMENT_ADDED':
      return 'Document attached';
    default:
      return e.type;
  }
}

/** The referral's permanent record: what happened, who did it and when. */
export function History({ events }: { events: ReferralEventView[] }) {
  return (
    <Card>
      <CardHeader title="History" description="Every change is recorded and cannot be edited." />
      <ol className="space-y-0 px-5 py-4">
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
