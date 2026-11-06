import 'server-only';
import { SERVICES, URGENCY } from './constants';
import { appUrl, sendEmails, type Email } from './email';
import { createAdminClient } from './supabase/server';
import type { Transfer, TransferEventType } from './types';

type Loaded = Transfer & {
  sending: { name: string };
  receiving: { name: string };
  provider: { name: string } | null;
  ambulance: { plate: string } | null;
};

/** Email addresses of people, looked up from Supabase Auth. */
async function emailsOf(profileIds: string[]) {
  const db = createAdminClient();
  const users = await Promise.all(profileIds.map((id) => db.auth.admin.getUserById(id)));
  return users.map((u) => u.data.user?.email).filter((e): e is string => !!e);
}

/** Everyone at an organization who handles transfers (admins and staff, not drivers). */
async function teamEmails(orgId: string | null) {
  if (!orgId) return [];
  const { data } = await createAdminClient()
    .from('profiles')
    .select('id')
    .eq('organization_id', orgId)
    .in('role', ['admin', 'staff']);
  return emailsOf((data ?? []).map((p) => p.id));
}

/**
 * Emails the people who need to act or know about this step. Realtime alerts cover people
 * who have Afyaline open; email reaches those who don't.
 */
export async function notifyTransferEvent(
  transferId: string,
  event: TransferEventType,
  note: string | null,
) {
  if (!process.env.POSTMARK_API_TOKEN) return;
  const { data } = await createAdminClient()
    .from('transfers')
    .select(
      `*, sending:organizations!transfers_sending_hospital_id_fkey(name),
      receiving:organizations!transfers_receiving_hospital_id_fkey(name),
      provider:organizations!transfers_provider_id_fkey(name),
      ambulance:ambulances(plate)`,
    )
    .eq('id', transferId)
    .maybeSingle();
  const t = data as Loaded | null;
  if (!t) return;

  const ref = `${t.code} · ${URGENCY[t.urgency]} · ${SERVICES[t.service_needed]}`;
  const flag = t.urgency === 'critical' ? '[Critical] ' : '';
  const open = { label: 'Open transfer', href: `${appUrl()}/transfers/${t.id}` };
  const messages: { to: Promise<string[]>; email: Omit<Email, 'to'> }[] = [];
  const add = (
    to: Promise<string[]>,
    subject: string,
    heading: string,
    lines: string[],
    action = open,
  ) =>
    messages.push({
      to,
      email: { subject: `${flag}${subject}`, heading, lines: [ref, ...lines], action },
    });

  switch (event) {
    case 'requested':
    case 'redirected':
      add(
        teamEmails(t.receiving_hospital_id),
        `New transfer request from ${t.sending.name}`,
        `${t.sending.name} wants to transfer a patient to you`,
        ['Please accept or decline as soon as possible.'],
        { label: 'Respond now', href: open.href },
      );
      break;
    case 'accepted':
      add(
        teamEmails(t.sending_hospital_id),
        `${t.code} accepted by ${t.receiving.name}`,
        `${t.receiving.name} accepted your patient`,
        ['Next: request an ambulance.'],
        { label: 'Request an ambulance', href: open.href },
      );
      break;
    case 'declined':
      add(
        teamEmails(t.sending_hospital_id),
        `${t.code} declined by ${t.receiving.name}`,
        `${t.receiving.name} could not take your patient`,
        [`Reason: ${note ?? 'not given'}.`, 'Next: send the request to another hospital.'],
        { label: 'Choose another hospital', href: open.href },
      );
      break;
    case 'ambulance_requested':
      add(
        teamEmails(t.provider_id),
        `Ambulance requested by ${t.sending.name}`,
        `${t.sending.name} needs an ambulance`,
        [`Destination: ${t.receiving.name}.`, 'Confirm the ambulance and assign a driver.'],
        { label: 'Dispatch now', href: open.href },
      );
      break;
    case 'ambulance_declined':
      add(
        teamEmails(t.sending_hospital_id),
        `Ambulance request for ${t.code} declined`,
        'The ambulance provider could not take this trip',
        [`Reason: ${note ?? 'not given'}.`, 'Next: request another ambulance.'],
      );
      break;
    case 'ambulance_assigned':
      for (const org of [t.sending_hospital_id, t.receiving_hospital_id]) {
        add(
          teamEmails(org),
          `Ambulance dispatched for ${t.code}`,
          `${t.provider?.name ?? 'The ambulance provider'} dispatched ${t.ambulance?.plate ?? 'an ambulance'}`,
          ['Follow the ambulance live on the transfer page.'],
        );
      }
      if (t.driver_id) {
        add(
          emailsOf([t.driver_id]),
          `New trip: ${t.sending.name} to ${t.receiving.name}`,
          'You have a new trip',
          [`Pick up at ${t.sending.name}, take to ${t.receiving.name}.`],
          { label: 'Open my trip', href: `${appUrl()}/trip` },
        );
      }
      break;
    case 'patient_onboard':
      add(
        teamEmails(t.receiving_hospital_id),
        `${t.code}: patient on the way to you`,
        `The patient from ${t.sending.name} is on the way`,
        ['Prepare to receive the patient. Track the ambulance live.'],
      );
      break;
    case 'handed_over':
      for (const org of [t.sending_hospital_id, t.provider_id]) {
        add(
          teamEmails(org),
          `${t.code} handed over at ${t.receiving.name}`,
          'The transfer is complete',
          [`Received by ${t.handover_received_by ?? 'the receiving team'}.`],
          { label: 'View transfer report', href: `${appUrl()}/report/${t.id}` },
        );
      }
      break;
    case 'cancelled':
      for (const org of [t.receiving_hospital_id, t.provider_id]) {
        add(teamEmails(org), `${t.code} cancelled`, `${t.sending.name} cancelled this transfer`, [
          `Reason: ${note ?? 'not given'}.`,
        ]);
      }
      if (t.driver_id) {
        add(emailsOf([t.driver_id]), `Trip ${t.code} cancelled`, 'Your trip was cancelled', [
          `Reason: ${note ?? 'not given'}.`,
        ]);
      }
      break;
    // Departure and arrival are covered by live alerts for people already following the transfer.
  }

  const emails = await Promise.all(
    messages.map(async (m) => [...new Set(await m.to)].map((to) => ({ ...m.email, to }))),
  );
  await sendEmails(emails.flat());
}
