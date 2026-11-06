import Link from 'next/link';
import { CheckCircle2, FileText } from 'lucide-react';
import { buttonClass, Card } from '@/components/ui';
import { CONDITION_LABEL } from '@/lib/constants';
import { dateTime, money } from '@/lib/format';
import { formatKm } from '@/lib/geo';
import { formatMinutes, stageMinutes } from '@/lib/metrics';
import type { TransferDetail } from './page';

/** Shown to everyone once the patient is handed over: outcome, times and costs. */
export function HandoverSummary({ transfer: t }: { transfer: TransferDetail }) {
  if (t.status !== 'handed_over') return null;
  const m = stageMinutes(t);

  return (
    <Card className="border-t-4 border-t-emerald-600 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 h-6 w-6 text-emerald-600" />
          <div>
            <h2 className="text-lg font-semibold">Handed over</h2>
            <p className="text-sm text-slate-600">
              {t.handed_over_at && dateTime(t.handed_over_at)} · received by{' '}
              {t.handover_received_by}
              {t.handover_condition && ` · ${CONDITION_LABEL[t.handover_condition]} on arrival`}
            </p>
            {t.handover_notes && <p className="mt-1 text-sm text-slate-600">{t.handover_notes}</p>}
          </div>
        </div>
        <Link href={`/report/${t.id}`} className={buttonClass('secondary')}>
          <FileText className="h-4 w-4" /> Transfer report
        </Link>
      </div>

      <dl className="mt-6 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
        <Stat label="Request to handover" value={formatMinutes(m.total)} strong />
        <Stat label="Time to acceptance" value={formatMinutes(m.toAcceptance)} />
        <Stat label="Patient in transit" value={formatMinutes(m.transport)} />
        <Stat
          label="Distance"
          value={formatKm(t.route_distance_km == null ? null : Number(t.route_distance_km))}
        />
        <Stat label="Fuel" value={money(t.fuel_cost)} />
        <Stat label="Consumables" value={money(t.consumables_cost)} />
        <Stat label="Other" value={money(t.other_cost)} />
        <Stat label="Total cost" value={money(t.total_cost)} strong />
      </dl>
    </Card>
  );
}

function Stat({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div>
      <dt className="text-slate-500">{label}</dt>
      <dd className={`mt-0.5 ${strong ? 'text-lg font-bold' : 'font-semibold'}`}>{value}</dd>
    </div>
  );
}
