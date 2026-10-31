// All times are shown in Kenyan time, whatever the device's timezone, so every party sees the same clock.
const dateTime = new Intl.DateTimeFormat('en-KE', {
  dateStyle: 'medium',
  timeStyle: 'short',
  hourCycle: 'h23',
  timeZone: 'Africa/Nairobi',
});

const time = new Intl.DateTimeFormat('en-KE', {
  timeStyle: 'short',
  hourCycle: 'h23',
  timeZone: 'Africa/Nairobi',
});
const dayKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Nairobi' });

export function formatDateTime(iso: string | null | undefined): string {
  return iso ? dateTime.format(new Date(iso)) : '—';
}

/** "14:32" for today, otherwise the date and time, in Kenyan time. */
export function formatWhen(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  return dayKey.format(date) === dayKey.format(now) ? time.format(date) : dateTime.format(date);
}

/** "25 min ago", "9 h ago", "3 days ago". */
export function formatAgo(iso: string, now: Date = new Date()): string {
  const minutes = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 60_000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.round(hours / 24)} days ago`;
}

export function formatMinutes(total: number): string {
  if (total < 60) return `${total} min`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

const AUDIT_ACTION_LABELS: Record<string, string> = {
  'auth.login.succeeded': 'Signed in',
  'auth.login.failed': 'Sign-in failed',
  'auth.logout': 'Signed out',
  'auth.password.changed': 'Password changed',
  'auth.mfa.enabled': 'Two-step verification set up',
  'auth.session.token_reuse_detected': 'Session ended: copied sign-in token detected',
  'user.created': 'User created',
  'user.deactivated': 'User deactivated',
  'user.reactivated': 'User reactivated',
  'user.mfa_reset': 'Two-step verification reset',
  'membership.granted': 'Role granted',
  'membership.revoked': 'Role removed',
  'institution.created': 'Institution added',
  'institution.profile_updated': 'Facility details updated',
  'institution.identity_updated': 'Institution name, level or status changed',
  'facility.services_updated': 'Services updated',
  'facility.resources_updated': 'Reported capacity items changed',
  'department.created': 'Department added',
  'department.updated': 'Department updated',
  'department.removed': 'Department removed',
  'capacity.updated': 'Capacity reported',
  'referral.created': 'Referral started',
  'referral.submitted': 'Referral sent',
  'referral.requests_added': 'Referral sent to more facilities',
  'referral.request_withdrawn': 'Referral request withdrawn',
  'referral.cancelled': 'Referral cancelled',
  'referral.viewed': 'Referral opened',
  'referral.assessment_recorded': 'Observations recorded',
  'referral.request_accept': 'Referral accepted',
  'referral.request_decline': 'Referral declined',
  'referral.request_request_info': 'More information requested',
  'referral.message_sent': 'Referral message sent',
  'referral.attachment_added': 'Document attached',
  'referral.attachment_downloaded': 'Document downloaded',
  'transfer.requested': 'Transport requested',
  'transfer.updated': 'Transport needs changed',
  'transfer.offered': 'Transfer offered to a vehicle',
  'transfer.offer_withdrawn': 'Transfer offer withdrawn',
  'transfer.confirmed': 'Ambulance confirmed',
  'transfer.declined': 'Transfer declined by provider',
  'transfer.reassigned': 'Ambulance or crew changed',
  'transfer.released': 'Transfer released by provider',
  'transfer.external_arranged': 'Transport arranged outside Lifeline',
  'transfer.dispatched': 'Ambulance dispatched',
  'transfer.cancelled': 'Transfer cancelled',
  'transfer.viewed': 'Transfer opened',
  'vehicle.created': 'Vehicle registered',
  'vehicle.updated': 'Vehicle details changed',
  'vehicle.status_updated': 'Vehicle availability updated',
  'crew.created': 'Crew member added',
  'crew.updated': 'Crew member changed',
};

export function auditActionLabel(action: string): string {
  return AUDIT_ACTION_LABELS[action] ?? action;
}

/** A readable temporary password: four groups of random letters and digits. */
export function generateTemporaryPassword(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  // Rejection sampling keeps every character equally likely.
  const limit = 256 - (256 % alphabet.length);
  let chars = '';
  while (chars.length < 16) {
    for (const byte of crypto.getRandomValues(new Uint8Array(32))) {
      if (byte < limit && chars.length < 16) chars += alphabet[byte % alphabet.length];
    }
  }
  return chars.match(/.{4}/g)!.join('-');
}
