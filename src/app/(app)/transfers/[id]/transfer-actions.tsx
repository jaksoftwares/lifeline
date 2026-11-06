import { CheckCircle2, Clock } from 'lucide-react';
import { ActionButton } from '@/components/action-button';
import { ActionForm } from '@/components/form';
import { CostsForm } from '@/components/transfer/costs-form';
import { HospitalPicker } from '@/components/transfer/hospital-picker';
import { Card, Field, Input, Select } from '@/components/ui';
import type { CurrentUser } from '@/lib/auth';
import { AMBULANCE_TYPES } from '@/lib/constants';
import { distanceKm, formatKm } from '@/lib/geo';
import { getHospitalOptions } from '@/lib/queries';
import { createClient } from '@/lib/supabase/server';
import type { Ambulance, Profile } from '@/lib/types';
import {
  acceptTransfer,
  assignAmbulance,
  cancelTransfer,
  confirmHandover,
  declineAmbulanceRequest,
  declineTransfer,
  redirectTransfer,
  requestAmbulance,
} from '../actions';
import type { TransferDetail } from './page';

const DECLINE_REASONS = [
  'No bed available',
  'Specialist not available',
  'Equipment not available',
  'Theatre full',
];

/** The step the viewer's organization can take now. */
export async function TransferActions({
  transfer: t,
  user,
}: {
  transfer: TransferDetail;
  user: CurrentUser;
}) {
  const orgId = user.organization?.id;
  const isSender = orgId === t.sending_hospital_id;
  const isReceiver = orgId === t.receiving_hospital_id;
  const isProvider = orgId === t.provider_id;
  let panel: React.ReactNode = null;

  if (t.status === 'requested') {
    panel = isReceiver ? (
      <Panel title="Can you take this patient?">
        <div className="flex flex-wrap items-start gap-3">
          <ActionButton action={acceptTransfer.bind(null, t.id)} className="w-full px-6 sm:w-auto">
            <CheckCircle2 className="h-4 w-4" /> Accept patient
          </ActionButton>
        </div>
        <details className="mt-4">
          <summary className="cursor-pointer text-sm font-semibold text-red-700">Decline…</summary>
          <ActionForm
            action={declineTransfer.bind(null, t.id)}
            submit="Decline"
            variant="danger"
            className="mt-3 space-y-3"
          >
            <Reason options={DECLINE_REASONS} />
          </ActionForm>
        </details>
      </Panel>
    ) : (
      <Waiting>Waiting for {t.receiving.name} to respond.</Waiting>
    );
  } else if (t.status === 'declined') {
    if (isSender && user.organization) {
      const hospitals = (await getHospitalOptions(user.organization)).filter(
        (h) => h.id !== t.receiving_hospital_id,
      );
      panel = (
        <Panel title="Declined: send to another hospital" tone="red">
          <p className="mb-4 text-sm text-red-800">Reason: {t.decline_reason}</p>
          <ActionForm action={redirectTransfer.bind(null, t.id)} submit="Send request">
            <HospitalPicker hospitals={hospitals} service={t.service_needed} />
          </ActionForm>
        </Panel>
      );
    } else {
      panel = <Waiting>Declined: {t.decline_reason}</Waiting>;
    }
  } else if (t.status === 'accepted' && !t.provider_id) {
    panel = isSender ? (
      <Panel title="Accepted: request an ambulance" tone="green">
        <AmbulancePicker transfer={t} />
      </Panel>
    ) : (
      <Waiting>Accepted. Waiting for an ambulance.</Waiting>
    );
  } else if (t.status === 'accepted') {
    panel = isProvider ? (
      <Panel title="Ambulance requested">
        <AssignForm transfer={t} providerId={t.provider_id!} />
        <details className="mt-4">
          <summary className="cursor-pointer text-sm font-semibold text-red-700">
            Cannot take this trip…
          </summary>
          <ActionForm
            action={declineAmbulanceRequest.bind(null, t.id)}
            submit="Decline request"
            variant="danger"
            className="mt-3 space-y-3"
          >
            <Reason options={['No ambulance available', 'No driver available', 'Too far']} />
          </ActionForm>
        </details>
      </Panel>
    ) : (
      <Waiting>Waiting for {t.provider?.name} to dispatch.</Waiting>
    );
  } else if (t.status === 'arrived') {
    panel = isReceiver ? (
      <Panel title="Patient arrived: confirm handover" tone="green">
        <ActionForm action={confirmHandover.bind(null, t.id)} submit="Confirm handover">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Received by">
              <Input name="received_by" defaultValue={user.profile.full_name} required />
            </Field>
            <Field label="Condition on arrival">
              <Select name="condition" defaultValue="stable">
                <option value="improved">Improved</option>
                <option value="stable">Stable</option>
                <option value="deteriorated">Deteriorated</option>
                <option value="deceased">Deceased</option>
              </Select>
            </Field>
          </div>
          <Field label="Notes (optional)">
            <Input
              name="notes"
              maxLength={1000}
              placeholder="Anything the sending team should know"
            />
          </Field>
        </ActionForm>
      </Panel>
    ) : (
      <Waiting>Arrived. Waiting for handover confirmation.</Waiting>
    );
  }

  // The ambulance team records consumables once the patient is onboard (also after handover).
  const costs =
    isProvider && ['patient_onboard', 'arrived', 'handed_over'].includes(t.status) ? (
      <Card className="p-5 sm:p-6">
        <h2 className="mb-1 font-semibold">Trip costs</h2>
        <p className="mb-4 text-sm text-slate-600">Fuel is calculated automatically.</p>
        <CostsForm transferId={t.id} consumables={t.consumables_cost} other={t.other_cost} />
      </Card>
    ) : null;

  if (!panel && !costs) return null;
  return (
    <div className="space-y-3">
      {panel}
      {costs}
    </div>
  );
}

/** The sending hospital can cancel until the patient is in the ambulance. Kept at the bottom. */
export function CancelTransfer({
  transfer: t,
  user,
}: {
  transfer: TransferDetail;
  user: CurrentUser;
}) {
  const canCancel =
    user.organization?.id === t.sending_hospital_id &&
    ['requested', 'declined', 'accepted', 'ambulance_assigned', 'en_route_to_pickup'].includes(
      t.status,
    );
  if (!canCancel) return null;
  return (
    <details className="px-1">
      <summary className="cursor-pointer text-sm text-slate-500 hover:text-red-700">
        Cancel transfer…
      </summary>
      <ActionForm
        action={cancelTransfer.bind(null, t.id)}
        submit="Cancel transfer"
        variant="danger"
        className="mt-3 space-y-3"
      >
        <Reason
          options={[
            'Patient condition changed',
            'Treated locally',
            'Patient deceased',
            'Family declined transfer',
          ]}
        />
      </ActionForm>
    </details>
  );
}

function Panel({
  title,
  tone = 'brand',
  children,
}: {
  title: string;
  tone?: 'brand' | 'red' | 'green';
  children: React.ReactNode;
}) {
  const border = {
    brand: 'border-t-brand-600',
    red: 'border-t-red-600',
    green: 'border-t-emerald-600',
  }[tone];
  return (
    <Card className={`border-t-4 p-5 sm:p-6 ${border}`}>
      <h2 className="mb-4 text-base font-semibold sm:text-lg">{title}</h2>
      {children}
    </Card>
  );
}

function Waiting({ children }: { children: React.ReactNode }) {
  return (
    <Card className="flex items-center gap-3 p-5 text-sm text-slate-700">
      <Clock className="h-5 w-5 shrink-0 text-brand-600" />
      {children}
    </Card>
  );
}

function Reason({ options }: { options: string[] }) {
  return (
    <Field label="Reason">
      <Input
        name="reason"
        list="reasons"
        required
        maxLength={300}
        placeholder="Choose or type a reason"
      />
      <datalist id="reasons">
        {options.map((o) => (
          <option key={o} value={o} />
        ))}
      </datalist>
    </Field>
  );
}

/** Available ambulances, nearest to the sending hospital first. Critical patients need life support. */
async function AmbulancePicker({ transfer: t }: { transfer: TransferDetail }) {
  const supabase = await createClient();
  const { data } = await supabase
    .from('ambulances')
    .select('*, provider:organizations(name, phone)')
    .eq('status', 'available');
  const ambulances = ((data as (Ambulance & { provider: { name: string; phone: string } })[]) ?? [])
    .filter((a) => t.urgency !== 'critical' || a.type !== 'basic')
    .map((a) => ({ ...a, km: distanceKm(a, t.sending) }))
    .sort((a, b) => (a.km ?? 1e9) - (b.km ?? 1e9));

  if (!ambulances.length) {
    return (
      <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
        No suitable ambulance is free right now. Try again shortly.
      </p>
    );
  }
  return (
    <ActionForm action={requestAmbulance.bind(null, t.id)} submit="Request this ambulance">
      {t.urgency === 'critical' && (
        <p className="text-sm text-slate-600">Critical patient: life-support ambulances only.</p>
      )}
      <ul className="space-y-2">
        {ambulances.map((a, i) => (
          <li key={a.id}>
            <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 p-3 transition has-checked:border-brand-600 has-checked:bg-brand-50 hover:border-slate-300">
              <input
                type="radio"
                name="ambulance_id"
                value={a.id}
                defaultChecked={i === 0}
                required
                className="accent-brand-600"
              />
              <span className="min-w-0 flex-1">
                <span className="block font-medium">
                  {a.plate} · {AMBULANCE_TYPES[a.type]}
                </span>
                <span className="block text-xs text-slate-500">
                  {a.provider.name} · {a.provider.phone}
                </span>
                <span className="block text-xs capitalize text-slate-500">
                  {a.equipment.join(', ')}
                </span>
              </span>
              <span className="shrink-0 text-sm font-semibold text-slate-700">
                {formatKm(a.km)}
              </span>
            </label>
          </li>
        ))}
      </ul>
    </ActionForm>
  );
}

/** Provider confirms an ambulance (the requested one by default) and picks a free driver. */
async function AssignForm({
  transfer: t,
  providerId,
}: {
  transfer: TransferDetail;
  providerId: string;
}) {
  const supabase = await createClient();
  const [{ data: fleet }, { data: drivers }, { data: busy }] = await Promise.all([
    supabase
      .from('ambulances')
      .select('*')
      .eq('provider_id', providerId)
      .eq('status', 'available')
      .order('plate'),
    supabase
      .from('profiles')
      .select('*')
      .eq('organization_id', providerId)
      .eq('role', 'driver')
      .order('full_name'),
    supabase
      .from('transfers')
      .select('driver_id')
      .eq('provider_id', providerId)
      .in('status', ['ambulance_assigned', 'en_route_to_pickup', 'patient_onboard', 'arrived']),
  ]);
  const busyDrivers = new Set((busy ?? []).map((b) => b.driver_id));
  const free = ((drivers as Profile[]) ?? []).filter((d) => !busyDrivers.has(d.id));
  const ambulances = (fleet as Ambulance[]) ?? [];

  if (!ambulances.length || !free.length) {
    return (
      <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
        {!ambulances.length
          ? 'None of your ambulances is available.'
          : 'All your drivers are on trips.'}{' '}
        Free one up on the Fleet page, or decline below.
      </p>
    );
  }
  return (
    <ActionForm action={assignAmbulance.bind(null, t.id)} submit="Confirm & dispatch">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Ambulance">
          <Select name="ambulance_id" defaultValue={t.ambulance_id ?? undefined}>
            {ambulances.map((a) => (
              <option key={a.id} value={a.id}>
                {a.plate} · {AMBULANCE_TYPES[a.type]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Driver">
          <Select name="driver_id">
            {free.map((d) => (
              <option key={d.id} value={d.id}>
                {d.full_name}
              </option>
            ))}
          </Select>
        </Field>
      </div>
    </ActionForm>
  );
}
