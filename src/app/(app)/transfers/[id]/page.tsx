import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft, Phone } from 'lucide-react';
import { Badge, Card } from '@/components/ui';
import { requireUser } from '@/lib/auth';
import {
  AMBULANCE_TYPES,
  EVENT_LABEL,
  SERVICES,
  STATUS,
  STATUS_TONE,
  URGENCY,
  URGENCY_TONE,
} from '@/lib/constants';
import { dateTime } from '@/lib/format';
import { formatKm } from '@/lib/geo';
import { formatMinutes } from '@/lib/metrics';
import { createClient } from '@/lib/supabase/server';
import type { Ambulance, Organization, Transfer, TransferEvent } from '@/lib/types';
import { CancelTransfer, TransferActions } from './transfer-actions';
import { HandoverSummary } from './handover-summary';
import { LiveTracking } from './live-tracking';

export const metadata: Metadata = { title: 'Transfer' };

export type TransferDetail = Transfer & {
  sending: Organization;
  receiving: Organization;
  provider: Organization | null;
  ambulance: Ambulance | null;
  driver: { full_name: string; phone: string | null } | null;
};

export default async function TransferPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  if (user.profile.role === 'driver' && !user.profile.is_platform_admin) redirect('/trip');

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

  return (
    <>
      <Link
        href="/transfers"
        className="mb-4 inline-flex items-center gap-1 text-sm text-slate-600 hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" /> Transfers
      </Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-slate-500">{t.code}</p>
          <h1 className="text-2xl font-bold tracking-tight">{t.patient_name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge tone={URGENCY_TONE[t.urgency]}>{URGENCY[t.urgency]}</Badge>
            <Badge tone="neutral">{SERVICES[t.service_needed]}</Badge>
          </div>
        </div>
        <span className="text-base">
          <Badge tone={STATUS_TONE[t.status]}>{STATUS[t.status]}</Badge>
        </span>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-3">
          <TransferActions transfer={t} user={user} />
          <LiveTracking transfer={t} />
          <HandoverSummary transfer={t} />

          <Card className="p-5 sm:p-6">
            <h2 className="mb-4 font-semibold">Patient</h2>
            <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
              <Item label="Age">
                {t.patient_age == null
                  ? '—'
                  : t.patient_age === 0
                    ? 'Under 1 year'
                    : `${t.patient_age} years`}
              </Item>
              <Item label="Sex">
                {t.patient_sex ? t.patient_sex[0].toUpperCase() + t.patient_sex.slice(1) : '—'}
              </Item>
              <Item label="Vitals" className="col-span-2 sm:col-span-1">
                {t.vitals ?? '—'}
              </Item>
              <Item label="Condition" className="col-span-2 sm:col-span-3">
                {t.condition_summary}
              </Item>
              {t.history && (
                <Item label="History" className="col-span-2 sm:col-span-3">
                  {t.history}
                </Item>
              )}
            </dl>
          </Card>

          <Card className="divide-y divide-slate-100">
            <Contact
              label="From"
              name={t.sending.name}
              detail={t.sending.county}
              phone={t.sending.phone}
            />
            <Contact
              label="To"
              name={t.receiving.name}
              detail={t.receiving.county}
              phone={t.receiving.phone}
            />
            {t.provider && (
              <Contact
                label="Ambulance"
                name={t.provider.name}
                detail={
                  t.ambulance
                    ? `${t.ambulance.plate} · ${AMBULANCE_TYPES[t.ambulance.type]}${t.status === 'accepted' ? ' · awaiting confirmation' : ''}`
                    : t.provider.county
                }
                phone={t.provider.phone}
              />
            )}
            {t.driver && (
              <Contact
                label="Driver"
                name={t.driver.full_name}
                detail={t.driver.phone}
                phone={t.driver.phone}
              />
            )}
            {t.route_distance_km != null && (
              <p className="px-5 py-3 text-sm text-slate-600 sm:px-6">
                Planned trip: {formatKm(Number(t.route_distance_km))} ·{' '}
                {formatMinutes(
                  t.route_duration_min == null ? null : Math.round(Number(t.route_duration_min)),
                )}
              </p>
            )}
          </Card>
          <CancelTransfer transfer={t} user={user} />
        </div>

        <Card className="h-fit p-5 sm:p-6 lg:col-span-2">
          <h2 className="mb-4 font-semibold">Timeline</h2>
          <ol className="relative space-y-5 border-l-2 border-slate-200 pl-5">
            {events.map((e) => (
              <li key={e.id} className="relative">
                <span className="absolute -left-[27px] top-1 h-3 w-3 rounded-full border-2 border-white bg-brand-600" />
                <p className="text-sm font-semibold">{EVENT_LABEL[e.status] ?? e.status}</p>
                {e.note && <p className="text-sm text-slate-600">{e.note}</p>}
                <p className="text-xs text-slate-500">
                  {dateTime(e.created_at)}
                  {e.actor_name && ` · ${e.actor_name}`}
                </p>
              </li>
            ))}
          </ol>
        </Card>
      </div>
    </>
  );
}

function Item({
  label,
  className = '',
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <dt className="text-slate-500">{label}</dt>
      <dd className="mt-0.5 font-medium">{children}</dd>
    </div>
  );
}

/** One party to the transfer with a call button. */
function Contact({
  label,
  name,
  detail,
  phone,
}: {
  label: string;
  name: string;
  detail?: string | null;
  phone?: string | null;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-5 py-4 sm:px-6">
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase text-slate-500">{label}</p>
        <p className="font-medium">{name}</p>
        {detail && <p className="truncate text-sm text-slate-500">{detail}</p>}
      </div>
      {phone && (
        <a
          href={`tel:${phone.replace(/s/g, '')}`}
          title={`Call ${phone}`}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-brand-50 px-3.5 py-2 text-sm font-semibold text-brand-700 hover:bg-brand-100"
        >
          <Phone className="h-4 w-4" /> Call
        </a>
      )}
    </div>
  );
}
