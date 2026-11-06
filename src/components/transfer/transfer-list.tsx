import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { SERVICES, STATUS, STATUS_TONE, URGENCY, URGENCY_TONE } from '@/lib/constants';
import { timeAgo } from '@/lib/format';
import type { Transfer } from '@/lib/types';
import { Badge, Card } from '../ui';

export type TransferListItem = Transfer & {
  sending: { name: string } | null;
  receiving: { name: string } | null;
};

export const TRANSFER_LIST_SELECT =
  '*, sending:organizations!transfers_sending_hospital_id_fkey(name), receiving:organizations!transfers_receiving_hospital_id_fkey(name)';

/** Whether the viewer's organization has something to do on this transfer right now. */
export function needsAction(t: Transfer, orgId: string | null | undefined) {
  if (!orgId) return false;
  if (t.receiving_hospital_id === orgId) return t.status === 'requested';
  if (t.sending_hospital_id === orgId) {
    return t.status === 'declined' || (t.status === 'accepted' && !t.provider_id);
  }
  if (t.provider_id === orgId) return t.status === 'accepted';
  return false;
}

export function TransferList({
  transfers,
  orgId,
  empty,
}: {
  transfers: TransferListItem[];
  orgId?: string | null;
  empty: string;
}) {
  if (!transfers.length) {
    return <Card className="p-8 text-center text-sm text-slate-500">{empty}</Card>;
  }
  return (
    <Card className="divide-y divide-slate-100 overflow-hidden">
      {transfers.map((t) => {
        const action = needsAction(t, orgId);
        return (
          <Link
            key={t.id}
            href={`/transfers/${t.id}`}
            className={`flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4 transition hover:bg-slate-50 ${
              action ? 'border-l-4 border-l-amber-500 bg-amber-50/40' : ''
            }`}
          >
            <div className="min-w-0 flex-1 basis-64">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{t.patient_name}</span>
                <Badge tone={URGENCY_TONE[t.urgency]}>{URGENCY[t.urgency]}</Badge>
                <span className="text-sm text-slate-500">{SERVICES[t.service_needed]}</span>
              </div>
              <p className="mt-1 flex items-center gap-1.5 truncate text-sm text-slate-600">
                {t.sending?.name} <ArrowRight className="h-3.5 w-3.5 shrink-0" />{' '}
                {t.receiving?.name}
              </p>
            </div>
            <div className="flex items-center gap-3">
              {action && <span className="text-xs font-semibold text-amber-700">Your action</span>}
              <Badge tone={STATUS_TONE[t.status]}>{STATUS[t.status]}</Badge>
              <span className="w-24 text-right text-xs text-slate-500">
                {t.code}
                <br />
                {timeAgo(t.requested_at)}
              </span>
            </div>
          </Link>
        );
      })}
    </Card>
  );
}
