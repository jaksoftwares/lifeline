import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { CONDITION_LABEL, SERVICES, STATUS, URGENCY } from '@/lib/constants';
import { stageMinutes } from '@/lib/metrics';
import { loadStats } from '@/lib/stats';

/** CSV of the transfers in the user's scope. No patient names: the transfer code identifies each one. */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.profile.role === 'driver')
    return new NextResponse('Not allowed', { status: 403 });
  const days = Math.min(365, Math.max(1, Number(request.nextUrl.searchParams.get('days')) || 30));
  const { transfers } = await loadStats(user, days);

  const header = [
    'Code',
    'Requested',
    'Status',
    'Urgency',
    'Service',
    'From',
    'To',
    'Ambulance',
    'Minutes to acceptance',
    'Minutes in transit',
    'Minutes request to handover',
    'Distance km',
    'Fuel KES',
    'Consumables KES',
    'Other KES',
    'Total KES',
    'Condition at handover',
  ];
  const rows = transfers.map((t) => {
    const m = stageMinutes(t);
    return [
      t.code,
      t.requested_at,
      STATUS[t.status],
      URGENCY[t.urgency],
      SERVICES[t.service_needed],
      t.sending?.name,
      t.receiving?.name,
      t.ambulance?.plate,
      m.toAcceptance,
      m.transport,
      m.total,
      t.route_distance_km,
      t.fuel_cost,
      t.consumables_cost,
      t.other_cost,
      t.status === 'handed_over' ? t.total_cost : null,
      t.handover_condition ? CONDITION_LABEL[t.handover_condition] : null,
    ];
  });
  const cell = (v: unknown) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [header, ...rows].map((r) => r.map(cell).join(',')).join('\n');

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="afyaline-transfers-${days}d.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
