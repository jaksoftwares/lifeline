import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import type { TransferDetail } from '@/app/(app)/transfers/[id]/page';
import { Logo } from '@/components/logo';
import { requireUser } from '@/lib/auth';
import {
  AMBULANCE_TYPES,
  CONDITION_LABEL,
  EVENT_LABEL,
  SERVICES,
  STATUS,
  URGENCY,
} from '@/lib/constants';
import { dateTime, money } from '@/lib/format';
import { formatKm } from '@/lib/geo';
import { formatMinutes, stageMinutes } from '@/lib/metrics';
import { createClient } from '@/lib/supabase/server';
import type { TransferEvent } from '@/lib/types';
import { PrintButton } from './print-button';

export const metadata: Metadata = { title: 'Transfer report' };

/** One-page, printable record of a transfer: patient, journey, times, costs and handover. */
export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireUser();
  const supabase = await createClient();
  const [{ data }, { data: eventRows }] = await Promise.all([
    supabase
      .from('transfers')
      .select(
        `*,
        sending:organizations!transfers_sending_hospital_id_fkey(*),
        receiving:organizations!transfers_receiving_hospital_id_fkey(*),
        provider:organizations!transfers_provider_id_fkey(*),
        ambulance:ambulances(*),
        driver:profiles!transfers_driver_id_fkey(full_name, phone)`,
      )
      .eq('id', id)
      .maybeSingle(),
    supabase.from('transfer_events').select('*').eq('transfer_id', id).order('created_at'),
  ]);
  if (!data) notFound();
  const t = data as TransferDetail;
  const events = (eventRows as TransferEvent[]) ?? [];
  const m = stageMinutes(t);
  const km = t.route_distance_km == null ? null : Number(t.route_distance_km);

  return (
    <div className="min-h-screen bg-slate-100 py-8 print:bg-white print:py-0">
      <div className="mx-auto mb-4 flex max-w-3xl items-center justify-between px-4 print:hidden">
        <Link
          href={`/transfers/${t.id}`}
          className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-ink"
        >
          <ArrowLeft className="h-4 w-4" /> Back to transfer
        </Link>
        <PrintButton />
      </div>

      <article className="mx-auto max-w-3xl space-y-6 bg-white p-8 text-sm shadow-sm print:max-w-none print:p-0 print:shadow-none">
        <header className="flex items-start justify-between border-b border-slate-200 pb-4">
          <div>
            <Logo />
            <h1 className="mt-3 text-xl font-bold">Patient transfer report</h1>
          </div>
          <div className="text-right text-xs text-slate-500">
            <p className="text-base font-bold text-ink">{t.code}</p>
            <p>Status: {STATUS[t.status]}</p>
            <p>Generated {dateTime(new Date().toISOString())}</p>
          </div>
        </header>

        <section className="grid grid-cols-3 gap-4 rounded-lg bg-slate-50 p-4 text-center print:border print:border-slate-200">
          <Big label="Request to handover" value={formatMinutes(m.total)} />
          <Big label="Distance" value={formatKm(km)} />
          <Big label="Total cost" value={money(t.total_cost)} />
        </section>

        <Section title="Patient">
          <Grid
            rows={[
              ['Name', t.patient_name],
              [
                'Age / sex',
                `${t.patient_age == null ? '—' : t.patient_age === 0 ? 'Under 1 year' : `${t.patient_age} years`} / ${t.patient_sex ?? '—'}`,
              ],
              ['Urgency', URGENCY[t.urgency]],
              ['Service needed', SERVICES[t.service_needed]],
              ['Condition', t.condition_summary],
              ['History', t.history ?? '—'],
              ['Vitals at referral', t.vitals ?? '—'],
            ]}
          />
        </Section>

        <Section title="Journey">
          <Grid
            rows={[
              ['From', `${t.sending.name}, ${t.sending.county} · ${t.sending.phone}`],
              ['To', `${t.receiving.name}, ${t.receiving.county} · ${t.receiving.phone}`],
              [
                'Ambulance',
                t.ambulance
                  ? `${t.ambulance.plate} · ${AMBULANCE_TYPES[t.ambulance.type]} · ${t.provider?.name ?? ''}`
                  : '—',
              ],
              [
                'Driver',
                t.driver
                  ? `${t.driver.full_name}${t.driver.phone ? ` · ${t.driver.phone}` : ''}`
                  : '—',
              ],
            ]}
          />
        </Section>

        <Section title="Times">
          <Grid
            rows={[
              ['Request to acceptance', formatMinutes(m.toAcceptance)],
              ['Ambulance request to dispatch', formatMinutes(m.toDispatch)],
              ['Ambulance to pickup', formatMinutes(m.toPickup)],
              ['Patient in transit', formatMinutes(m.transport)],
              ['Arrival to handover', formatMinutes(m.handover)],
              ['Total, request to handover', formatMinutes(m.total)],
            ]}
          />
        </Section>

        <Section title="Costs (KES)">
          <Grid
            rows={[
              [
                'Fuel',
                `${money(t.fuel_cost)}${
                  km != null && t.ambulance && t.provider?.fuel_price != null
                    ? ` (${formatKm(km)} × ${t.ambulance.fuel_use} L/100 km × KES ${t.provider.fuel_price}/L)`
                    : ''
                }`,
              ],
              ['Consumables', money(t.consumables_cost)],
              ['Other', money(t.other_cost)],
              ['Total', money(t.total_cost)],
            ]}
          />
        </Section>

        <Section title="Handover">
          <Grid
            rows={[
              ['Received by', t.handover_received_by ?? '—'],
              [
                'Condition on arrival',
                t.handover_condition ? CONDITION_LABEL[t.handover_condition] : '—',
              ],
              ['Handed over at', t.handed_over_at ? dateTime(t.handed_over_at) : '—'],
              ['Notes', t.handover_notes ?? '—'],
            ]}
          />
        </Section>

        <Section title="Timeline">
          <table className="w-full">
            <tbody className="divide-y divide-slate-100">
              {events.map((e) => (
                <tr key={e.id}>
                  <td className="py-1.5 pr-3 align-top whitespace-nowrap text-slate-500">
                    {dateTime(e.created_at)}
                  </td>
                  <td className="py-1.5 pr-3 align-top font-medium">
                    {EVENT_LABEL[e.status] ?? e.status}
                    {e.note && <span className="font-normal text-slate-600"> · {e.note}</span>}
                  </td>
                  <td className="py-1.5 align-top text-right text-slate-500">{e.actor_name}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>

        <footer className="border-t border-slate-200 pt-3 text-xs text-slate-500">
          Generated by Afyaline. Contains confidential patient information: share only with those
          involved in the patient&apos;s care.
        </footer>
      </article>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="break-inside-avoid">
      <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-brand-700">{title}</h2>
      {children}
    </section>
  );
}

function Grid({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="grid grid-cols-[11rem_1fr] gap-x-4 gap-y-1.5">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-slate-500">{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function Big({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-lg font-bold">{value}</p>
    </div>
  );
}
