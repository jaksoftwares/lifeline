import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Download } from 'lucide-react';
import { BarList, ChartCard, ColumnChart, StatTile } from '@/components/charts';
import { buttonClass, Card, PageHeader } from '@/components/ui';
import { requireUser } from '@/lib/auth';
import { money } from '@/lib/format';
import { formatMinutes } from '@/lib/metrics';
import { loadStats, summarize } from '@/lib/stats';

export const metadata: Metadata = { title: 'Reports' };

const PERIODS = [7, 30, 90];

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const user = await requireUser();
  if (user.profile.role === 'driver') redirect('/trip');
  const requested = Number((await searchParams).days);
  const days = PERIODS.includes(requested) ? requested : 30;

  const data = await loadStats(user, days);
  const s = summarize(data);
  const { scope } = data;
  const ownName = user.organization?.name;
  const mins = (v: number) => formatMinutes(v);

  return (
    <>
      <PageHeader
        title="Reports"
        description={`${scope === 'network' ? 'Whole network' : ownName} · last ${days} days`}
        actions={
          <Link
            href={`/reports/export?days=${days}`}
            className={buttonClass('secondary')}
            prefetch={false}
          >
            <Download className="h-4 w-4" /> Export CSV
          </Link>
        }
      />

      {/* Filters: one row, above the charts. */}
      <div className="mb-6 flex w-fit gap-1 rounded-lg bg-slate-200/60 p-1 text-sm font-semibold">
        {PERIODS.map((p) => (
          <Link
            key={p}
            href={`/reports?days=${p}`}
            className={`rounded-md px-4 py-1.5 ${p === days ? 'bg-white shadow-sm' : 'text-slate-600 hover:text-ink'}`}
          >
            {p} days
          </Link>
        ))}
      </div>

      {scope === 'provider' ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatTile label="Trips completed" value={s.completed} sub={`${s.active} in progress`} />
          <StatTile
            label="Median dispatch time"
            value={formatMinutes(s.median.toDispatch)}
            sub="Request to ambulance assigned"
          />
          <StatTile
            label="Distance"
            value={`${s.km.toLocaleString()} km`}
            sub="Planned route, completed trips"
          />
          <StatTile
            label="Total cost"
            value={money(s.cost.total)}
            sub={`${money(s.cost.perTransfer)} per trip`}
          />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatTile
            label="Transfers"
            value={s.total}
            sub={
              scope === 'hospital'
                ? `${s.outgoing} sent · ${s.incoming} received`
                : `${s.completed} completed · ${s.active} in progress`
            }
          />
          <StatTile
            label="Median request to handover"
            value={formatMinutes(s.median.total)}
            sub={`Critical patients: ${formatMinutes(s.median.criticalTotal)}`}
          />
          <StatTile
            label="Median time to acceptance"
            value={formatMinutes(s.median.toAcceptance)}
            sub={
              s.acceptanceRate == null
                ? 'No decisions yet'
                : `${s.acceptanceRate}% of requests accepted${scope === 'hospital' ? ' by you' : ''}`
            }
          />
          <StatTile
            label="Transport cost"
            value={money(s.cost.total)}
            sub={`${money(s.cost.perTransfer)} per transfer · ${s.km.toLocaleString()} km`}
          />
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <ChartCard
          title={scope === 'provider' ? 'Trips requested per day' : 'Transfers requested per day'}
          className="lg:col-span-2"
        >
          <ColumnChart data={s.perDay} unit={scope === 'provider' ? 'trips' : 'transfers'} />
        </ChartCard>

        <ChartCard title="Time per stage" subtitle="Median minutes">
          <BarList
            keepOrder
            format={mins}
            items={[
              ...(scope === 'provider'
                ? []
                : [{ label: 'Request to acceptance', value: s.median.toAcceptance ?? 0 }]),
              { label: 'Ambulance request to dispatch', value: s.median.toDispatch ?? 0 },
              { label: 'Ambulance to pickup', value: s.median.toPickup ?? 0 },
              { label: 'Patient in transit', value: s.median.transport ?? 0 },
              { label: 'Arrival to handover', value: s.median.handover ?? 0 },
            ]}
          />
        </ChartCard>

        <ChartCard title="Cost breakdown" subtitle="Completed transfers, KES">
          <BarList
            format={money}
            items={[
              { label: 'Fuel', value: s.cost.fuel },
              { label: 'Consumables', value: s.cost.consumables },
              { label: 'Other', value: s.cost.other },
            ]}
          />
        </ChartCard>

        <ChartCard title="Urgency">
          <BarList items={s.byUrgency} />
        </ChartCard>

        <ChartCard title="Condition at handover" subtitle="Completed transfers">
          <BarList items={s.outcomes} />
        </ChartCard>

        {scope !== 'provider' && (
          <ChartCard
            title={
              scope === 'hospital' ? 'Where your patients went' : 'Busiest receiving hospitals'
            }
          >
            <BarList
              items={s.topReceiving.filter((r) => r.label !== ownName)}
              empty="No transfers sent."
            />
          </ChartCard>
        )}
        {scope !== 'provider' && (
          <ChartCard
            title={
              scope === 'hospital'
                ? 'Who refers patients to you'
                : 'Most active referring hospitals'
            }
          >
            <BarList
              items={s.topSending.filter((r) => r.label !== ownName)}
              empty="No transfers received."
            />
          </ChartCard>
        )}
        {scope !== 'provider' && (
          <ChartCard
            title="Decline reasons"
            subtitle={`${s.declined} declined · ${s.accepted} accepted`}
          >
            <BarList items={s.declineReasons} empty="No declines in this period." />
          </ChartCard>
        )}
      </div>

      {scope === 'provider' && (
        <Card className="mt-6 overflow-x-auto">
          <h2 className="px-5 pt-5 font-semibold">Ambulance use</h2>
          <table className="mt-3 w-full text-sm">
            <thead className="border-b border-slate-200 text-left text-slate-500">
              <tr>
                <th className="px-5 py-2 font-medium">Ambulance</th>
                <th className="px-5 py-2 text-right font-medium">Trips</th>
                <th className="px-5 py-2 text-right font-medium">Distance</th>
                <th className="px-5 py-2 text-right font-medium">Cost</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 tabular-nums">
              {s.byAmbulance.map((a) => (
                <tr key={a.plate}>
                  <td className="px-5 py-2 font-medium">{a.plate}</td>
                  <td className="px-5 py-2 text-right">{a.trips}</td>
                  <td className="px-5 py-2 text-right">{a.km.toLocaleString()} km</td>
                  <td className="px-5 py-2 text-right">{money(a.cost)}</td>
                </tr>
              ))}
              {!s.byAmbulance.length && (
                <tr>
                  <td colSpan={4} className="px-5 py-4 text-slate-500">
                    No completed trips in this period.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      )}

      <p className="mt-6 text-xs text-slate-500">
        Distances are planned road routes. CSV export excludes patient names.
      </p>
    </>
  );
}
