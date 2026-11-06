import 'server-only';
import type { CurrentUser } from './auth';
import { CONDITION_LABEL, SERVICES, URGENCY } from './constants';
import { stageMinutes } from './metrics';
import { createClient } from './supabase/server';
import type { Transfer, TransferEvent } from './types';

export type StatsTransfer = Transfer & {
  sending: { name: string } | null;
  receiving: { name: string } | null;
  ambulance: { plate: string } | null;
};

export type Scope = 'hospital' | 'provider' | 'network';

export function scopeOf(user: CurrentUser): Scope {
  if (user.profile.is_platform_admin || !user.organization) return 'network';
  return user.organization.type === 'hospital' ? 'hospital' : 'provider';
}

/** Transfers (and accept/decline decisions) visible to this user, requested in the last `days`. */
export async function loadStats(user: CurrentUser, days: number) {
  const supabase = await createClient();
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const scope = scopeOf(user);
  const orgId = user.organization?.id;

  let transfers = supabase
    .from('transfers')
    .select(
      `*, sending:organizations!transfers_sending_hospital_id_fkey(name),
      receiving:organizations!transfers_receiving_hospital_id_fkey(name),
      ambulance:ambulances(plate)`,
    )
    .gte('requested_at', since)
    .order('requested_at')
    .limit(5000);
  if (scope === 'hospital') {
    transfers = transfers.or(`sending_hospital_id.eq.${orgId},receiving_hospital_id.eq.${orgId}`);
  } else if (scope === 'provider') {
    transfers = transfers.eq('provider_id', orgId!);
  }

  let decisions = supabase
    .from('transfer_events')
    .select('status, note, organization_id')
    .in('status', ['accepted', 'declined'])
    .gte('created_at', since)
    .limit(10000);
  // A hospital's acceptance rate is about the requests it received.
  if (scope === 'hospital') decisions = decisions.eq('organization_id', orgId!);

  const [t, d] = await Promise.all([transfers, scope === 'provider' ? null : decisions]);
  return {
    scope,
    orgId,
    days,
    since,
    transfers: (t.data as StatsTransfer[]) ?? [],
    decisions: (d?.data as Pick<TransferEvent, 'status' | 'note'>[]) ?? [],
  };
}

const median = (values: (number | null)[]) => {
  const v = values.filter((x): x is number => x != null).sort((a, b) => a - b);
  if (!v.length) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : Math.round((v[mid - 1] + v[mid]) / 2);
};

const sum = (values: (number | null)[]) => values.reduce<number>((a, v) => a + Number(v ?? 0), 0);

/** Count by key, largest first. */
function countBy<T>(items: T[], key: (item: T) => string | null | undefined) {
  const counts = new Map<string, number>();
  for (const item of items) {
    const k = key(item);
    if (k) counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return [...counts].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
}

export function summarize({
  transfers,
  decisions,
  days,
  orgId,
}: Awaited<ReturnType<typeof loadStats>>) {
  const completed = transfers.filter((t) => t.status === 'handed_over');
  const stages = completed.map(stageMinutes);
  const all = transfers.map(stageMinutes);
  const accepted = decisions.filter((d) => d.status === 'accepted').length;
  const declined = decisions.filter((d) => d.status === 'declined').length;

  // One bar per day, oldest first.
  const perDay = Array.from({ length: days }, (_, i) => {
    const day = new Date(Date.now() - (days - 1 - i) * 86_400_000);
    const key = day.toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });
    return {
      key,
      label: day.toLocaleDateString('en-KE', {
        day: 'numeric',
        month: 'short',
        timeZone: 'Africa/Nairobi',
      }),
      value: 0,
    };
  });
  const index = new Map(perDay.map((d, i) => [d.key, i]));
  for (const t of transfers) {
    const key = new Date(t.requested_at).toLocaleDateString('en-CA', {
      timeZone: 'Africa/Nairobi',
    });
    const i = index.get(key);
    if (i != null) perDay[i].value++;
  }

  const byAmbulance = new Map<string, { trips: number; km: number; cost: number }>();
  for (const t of completed) {
    if (!t.ambulance) continue;
    const row = byAmbulance.get(t.ambulance.plate) ?? { trips: 0, km: 0, cost: 0 };
    row.trips++;
    row.km += Number(t.route_distance_km ?? 0);
    row.cost += Number(t.total_cost ?? 0);
    byAmbulance.set(t.ambulance.plate, row);
  }

  return {
    total: transfers.length,
    completed: completed.length,
    active: transfers.filter((t) => !['handed_over', 'cancelled'].includes(t.status)).length,
    cancelled: transfers.filter((t) => t.status === 'cancelled').length,
    outgoing: orgId ? transfers.filter((t) => t.sending_hospital_id === orgId).length : 0,
    incoming: orgId ? transfers.filter((t) => t.receiving_hospital_id === orgId).length : 0,
    acceptanceRate:
      accepted + declined ? Math.round((accepted / (accepted + declined)) * 100) : null,
    accepted,
    declined,
    median: {
      toAcceptance: median(all.map((s) => s.toAcceptance)),
      toDispatch: median(all.map((s) => s.toDispatch)),
      toPickup: median(stages.map((s) => s.toPickup)),
      transport: median(stages.map((s) => s.transport)),
      handover: median(stages.map((s) => s.handover)),
      total: median(stages.map((s) => s.total)),
      criticalTotal: median(
        completed.filter((t) => t.urgency === 'critical').map((t) => stageMinutes(t).total),
      ),
    },
    km: Math.round(sum(completed.map((t) => t.route_distance_km))),
    cost: {
      fuel: sum(completed.map((t) => t.fuel_cost)),
      consumables: sum(completed.map((t) => t.consumables_cost)),
      other: sum(completed.map((t) => t.other_cost)),
      total: sum(completed.map((t) => t.total_cost)),
      perTransfer: completed.length
        ? Math.round(sum(completed.map((t) => t.total_cost)) / completed.length)
        : null,
    },
    perDay,
    byUrgency: countBy(transfers, (t) => URGENCY[t.urgency]),
    byService: countBy(transfers, (t) => SERVICES[t.service_needed]),
    outcomes: countBy(completed, (t) =>
      t.handover_condition ? CONDITION_LABEL[t.handover_condition] : null,
    ),
    topReceiving: countBy(transfers, (t) => t.receiving?.name).slice(0, 6),
    topSending: countBy(transfers, (t) => t.sending?.name).slice(0, 6),
    declineReasons: countBy(
      decisions.filter((d) => d.status === 'declined'),
      (d) => d.note,
    ).slice(0, 6),
    byAmbulance: [...byAmbulance]
      .map(([plate, r]) => ({ plate, ...r, km: Math.round(r.km) }))
      .sort((a, b) => b.trips - a.trips),
  };
}

export type Summary = ReturnType<typeof summarize>;
