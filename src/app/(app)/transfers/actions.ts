'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import {
  ActionError,
  optionalNumber,
  optionalText,
  parseForm,
  requireMember,
  run,
  text,
  type FormState,
} from '@/lib/actions';
import { SERVICES } from '@/lib/constants';
import { getCurrentUser } from '@/lib/auth';
import { fuelCost } from '@/lib/metrics';
import { getRoutes, located } from '@/lib/routing';
import { createAdminClient } from '@/lib/supabase/server';
import { changeTransfer, getTransfer, logEvent, releaseAmbulance } from '@/lib/transfers';
import type { Ambulance, Organization, Service } from '@/lib/types';

const now = () => new Date().toISOString();
const uuid = (label: string) => z.uuid({ error: label });

async function getHospital(id: string): Promise<Organization> {
  const { data } = await createAdminClient()
    .from('organizations')
    .select('*')
    .eq('id', id)
    .eq('type', 'hospital')
    .maybeSingle();
  if (!data) throw new ActionError('Choose a receiving hospital.');
  return data as Organization;
}

// ---------------------------------------------------------------------------
// Sending hospital: create
// ---------------------------------------------------------------------------
const createSchema = z.object({
  patient_name: text("Patient's full name", 120),
  patient_age: optionalNumber('Enter age in years').pipe(
    z.number().int().min(0, 'Enter age in years').max(130, 'Enter age in years').nullable(),
  ),
  patient_sex: z.enum(['female', 'male'], { error: 'Choose sex' }),
  urgency: z.enum(['critical', 'urgent', 'stable'], { error: 'Choose urgency' }),
  service_needed: z.enum(Object.keys(SERVICES) as [Service, ...Service[]], {
    error: 'Choose the service needed',
  }),
  condition_summary: text('Condition summary', 500),
  history: optionalText(1000),
  vitals: optionalText(300),
  receiving_hospital_id: uuid('Choose a receiving hospital'),
});

export async function createTransfer(_: FormState, formData: FormData): Promise<FormState> {
  return run(async () => {
    const actor = await requireMember({ type: 'hospital' });
    const input = parseForm(createSchema, formData);
    if (input.receiving_hospital_id === actor.organization.id) {
      throw new ActionError('Choose a different hospital from your own.');
    }
    await getHospital(input.receiving_hospital_id);

    const db = createAdminClient();
    const { data, error } = await db
      .from('transfers')
      .insert({
        ...input,
        sending_hospital_id: actor.organization.id,
        created_by: actor.profile.id,
      })
      .select('id')
      .single();
    if (error) {
      console.error('create transfer failed', error);
      throw new ActionError('Could not send the request. Please try again.');
    }
    await logEvent(data.id, 'requested', actor);
    redirect(`/transfers/${data.id}`);
  });
}

// ---------------------------------------------------------------------------
// Receiving hospital: accept / decline
// ---------------------------------------------------------------------------
async function forReceiver(transferId: string) {
  const actor = await requireMember({ type: 'hospital' });
  const transfer = await getTransfer(transferId);
  if (transfer.receiving_hospital_id !== actor.organization.id) {
    throw new ActionError('Only the receiving hospital can respond.');
  }
  return { actor, transfer };
}

export async function acceptTransfer(transferId: string): Promise<FormState> {
  return run(async () => {
    const { actor, transfer } = await forReceiver(transferId);
    await changeTransfer({
      transfer,
      actor,
      from: ['requested'],
      patch: { status: 'accepted', responded_at: now() },
      event: 'accepted',
    });
    revalidatePath(`/transfers/${transferId}`);
    return 'Accepted. The sending hospital has been notified.';
  });
}

export async function declineTransfer(
  transferId: string,
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  return run(async () => {
    const { actor, transfer } = await forReceiver(transferId);
    const { reason } = parseForm(z.object({ reason: text('Reason', 300) }), formData);
    await changeTransfer({
      transfer,
      actor,
      from: ['requested'],
      patch: { status: 'declined', responded_at: now(), decline_reason: reason },
      event: 'declined',
      note: reason,
    });
    revalidatePath(`/transfers/${transferId}`);
    return 'Declined.';
  });
}

// ---------------------------------------------------------------------------
// Sending hospital: redirect, request ambulance, cancel
// ---------------------------------------------------------------------------
async function forSender(transferId: string) {
  const actor = await requireMember({ type: 'hospital' });
  const transfer = await getTransfer(transferId);
  if (transfer.sending_hospital_id !== actor.organization.id) {
    throw new ActionError('Only the sending hospital can do this.');
  }
  return { actor, transfer };
}

export async function redirectTransfer(
  transferId: string,
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  return run(async () => {
    const { actor, transfer } = await forSender(transferId);
    const { receiving_hospital_id } = parseForm(
      z.object({ receiving_hospital_id: uuid('Choose a receiving hospital') }),
      formData,
    );
    if (receiving_hospital_id === actor.organization.id) {
      throw new ActionError('Choose a different hospital from your own.');
    }
    const hospital = await getHospital(receiving_hospital_id);
    await changeTransfer({
      transfer,
      actor,
      from: ['declined'],
      patch: {
        status: 'requested',
        receiving_hospital_id,
        responded_at: null,
        decline_reason: null,
      },
      event: 'redirected',
      note: `Sent to ${hospital.name}`,
    });
    revalidatePath(`/transfers/${transferId}`);
    return `Sent to ${hospital.name}.`;
  });
}

export async function requestAmbulance(
  transferId: string,
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  return run(async () => {
    const { actor, transfer } = await forSender(transferId);
    const { ambulance_id } = parseForm(
      z.object({ ambulance_id: uuid('Choose an ambulance') }),
      formData,
    );
    const { data } = await createAdminClient()
      .from('ambulances')
      .select('*, provider:organizations(name)')
      .eq('id', ambulance_id)
      .maybeSingle();
    const ambulance = data as (Ambulance & { provider: { name: string } }) | null;
    if (!ambulance || ambulance.status !== 'available') {
      throw new ActionError('That ambulance is no longer available. Choose another.');
    }
    await changeTransfer({
      transfer,
      actor,
      from: ['accepted'],
      where: { provider_id: null },
      patch: {
        provider_id: ambulance.provider_id,
        ambulance_id: ambulance.id,
        ambulance_requested_at: now(),
      },
      event: 'ambulance_requested',
      note: `${ambulance.plate} · ${ambulance.provider.name}`,
    });
    revalidatePath(`/transfers/${transferId}`);
    return `Request sent to ${ambulance.provider.name}.`;
  });
}

export async function cancelTransfer(
  transferId: string,
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  return run(async () => {
    const { actor, transfer } = await forSender(transferId);
    const { reason } = parseForm(z.object({ reason: text('Reason', 300) }), formData);
    await changeTransfer({
      transfer,
      actor,
      // Once the patient is in the ambulance, the trip has to finish.
      from: ['requested', 'declined', 'accepted', 'ambulance_assigned', 'en_route_to_pickup'],
      patch: { status: 'cancelled', cancelled_at: now(), cancel_reason: reason },
      event: 'cancelled',
      note: reason,
    });
    if (transfer.assigned_at) await releaseAmbulance(transfer.ambulance_id);
    revalidatePath(`/transfers/${transferId}`);
    return 'Transfer cancelled.';
  });
}

// ---------------------------------------------------------------------------
// Ambulance provider: assign, or decline the request
// ---------------------------------------------------------------------------
async function forProvider(transferId: string) {
  const actor = await requireMember({ type: 'ambulance_provider' });
  const transfer = await getTransfer(transferId);
  if (transfer.provider_id !== actor.organization.id || transfer.status !== 'accepted') {
    throw new ActionError('This request is no longer waiting for you.');
  }
  return { actor, transfer };
}

export async function assignAmbulance(
  transferId: string,
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  return run(async () => {
    const { actor, transfer } = await forProvider(transferId);
    const input = parseForm(
      z.object({ ambulance_id: uuid('Choose an ambulance'), driver_id: uuid('Choose a driver') }),
      formData,
    );
    const db = createAdminClient();
    const providerId = actor.organization.id;

    const [{ data: driver }, { count: driverBusy }, { data: places }] = await Promise.all([
      db
        .from('profiles')
        .select('id, full_name')
        .eq('id', input.driver_id)
        .eq('organization_id', providerId)
        .eq('role', 'driver')
        .maybeSingle(),
      db
        .from('transfers')
        .select('id', { count: 'exact', head: true })
        .eq('driver_id', input.driver_id)
        .in('status', ['ambulance_assigned', 'en_route_to_pickup', 'patient_onboard', 'arrived']),
      db
        .from('organizations')
        .select('id, lat, lng')
        .in('id', [transfer.sending_hospital_id, transfer.receiving_hospital_id]),
    ]);
    if (!driver) throw new ActionError('Choose one of your drivers.');
    if (driverBusy) throw new ActionError(`${driver.full_name} is already on a trip.`);

    // Reserve the ambulance first; only an available one of ours can be taken.
    const { data: taken } = await db
      .from('ambulances')
      .update({ status: 'on_trip' })
      .eq('id', input.ambulance_id)
      .eq('provider_id', providerId)
      .eq('status', 'available')
      .select('*')
      .maybeSingle();
    const ambulance = taken as Ambulance | null;
    if (!ambulance) throw new ActionError('That ambulance is not available. Choose another.');

    const place = (id: string) => places?.find((p) => p.id === id);
    // Planned trip by road: ambulance → pickup → receiving hospital.
    const points = located(
      ambulance,
      place(transfer.sending_hospital_id),
      place(transfer.receiving_hospital_id),
    );
    const route = points ? (await getRoutes(points))[0] : null;
    try {
      await changeTransfer({
        transfer,
        actor,
        from: ['accepted'],
        where: { provider_id: providerId },
        patch: {
          status: 'ambulance_assigned',
          ambulance_id: ambulance.id,
          driver_id: driver.id,
          assigned_at: now(),
          route_distance_km: route?.km ?? null,
          route_duration_min: route?.minutes ?? null,
        },
        event: 'ambulance_assigned',
        note: `${ambulance.plate} · ${driver.full_name}`,
      });
    } catch (error) {
      await releaseAmbulance(ambulance.id);
      throw error;
    }
    revalidatePath(`/transfers/${transferId}`);
    return `${ambulance.plate} assigned to ${driver.full_name}.`;
  });
}

export async function declineAmbulanceRequest(
  transferId: string,
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  return run(async () => {
    const { actor, transfer } = await forProvider(transferId);
    const { reason } = parseForm(z.object({ reason: text('Reason', 300) }), formData);
    await changeTransfer({
      transfer,
      actor,
      from: ['accepted'],
      where: { provider_id: actor.organization.id },
      patch: { provider_id: null, ambulance_id: null, ambulance_requested_at: null },
      event: 'ambulance_declined',
      note: reason,
    });
    revalidatePath('/transfers');
    redirect('/transfers');
  });
}

// ---------------------------------------------------------------------------
// Receiving hospital: confirm handover. Closes the transfer and frees the ambulance.
// ---------------------------------------------------------------------------
const handoverSchema = z.object({
  received_by: text('Received by', 120),
  condition: z.enum(['improved', 'stable', 'deteriorated', 'deceased'], {
    error: "Choose the patient's condition on arrival",
  }),
  notes: optionalText(1000),
});

export async function confirmHandover(
  transferId: string,
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  return run(async () => {
    const { actor, transfer } = await forReceiver(transferId);
    const input = parseForm(handoverSchema, formData);

    const db = createAdminClient();
    const [{ data: ambulance }, { data: provider }] = await Promise.all([
      db
        .from('ambulances')
        .select('fuel_use')
        .eq('id', transfer.ambulance_id ?? '')
        .maybeSingle(),
      db
        .from('organizations')
        .select('fuel_price')
        .eq('id', transfer.provider_id ?? '')
        .maybeSingle(),
    ]);
    const fuel = fuelCost(
      transfer.route_distance_km == null ? null : Number(transfer.route_distance_km),
      ambulance ? Number(ambulance.fuel_use) : null,
      provider?.fuel_price == null ? null : Number(provider.fuel_price),
    );

    await changeTransfer({
      transfer,
      actor,
      from: ['arrived'],
      patch: {
        status: 'handed_over',
        handed_over_at: now(),
        handover_received_by: input.received_by,
        handover_condition: input.condition,
        handover_notes: input.notes,
        fuel_cost: fuel,
      },
      event: 'handed_over',
      note: `Received by ${input.received_by}`,
    });
    await releaseAmbulance(transfer.ambulance_id);
    revalidatePath(`/transfers/${transferId}`);
    return 'Handover confirmed. The transfer is complete.';
  });
}

// ---------------------------------------------------------------------------
// Driver or provider: consumables and other trip costs (KES)
// ---------------------------------------------------------------------------
const kes = (label: string) =>
  optionalNumber(`${label}: enter an amount in KES`).pipe(
    z.number().min(0, `${label} cannot be negative`).max(1_000_000).nullable(),
  );

export async function saveTripCosts(
  transferId: string,
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  return run(async () => {
    const user = await getCurrentUser();
    const transfer = await getTransfer(transferId);
    const orgId = user?.organization?.id;
    const allowed =
      user?.profile.role === 'driver'
        ? transfer.driver_id === user.profile.id
        : !!orgId && orgId === transfer.provider_id;
    if (!allowed) throw new ActionError('Only the ambulance team can record trip costs.');
    if (!['patient_onboard', 'arrived', 'handed_over'].includes(transfer.status)) {
      throw new ActionError('Costs can be recorded once the patient is onboard.');
    }

    const input = parseForm(
      z.object({ consumables_cost: kes('Consumables'), other_cost: kes('Other costs') }),
      formData,
    );
    const { error } = await createAdminClient()
      .from('transfers')
      .update(input)
      .eq('id', transferId);
    if (error) throw new ActionError('Could not save the costs.');
    revalidatePath(`/transfers/${transferId}`);
    revalidatePath('/trip');
    return 'Costs saved.';
  });
}
