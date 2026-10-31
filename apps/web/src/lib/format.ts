// All times are shown in Kenyan time, whatever the device's timezone, so every party sees the same clock.
const dateTime = new Intl.DateTimeFormat('en-KE', {
  dateStyle: 'medium',
  timeStyle: 'short',
  hourCycle: 'h23',
  timeZone: 'Africa/Nairobi',
});

export function formatDateTime(iso: string | null | undefined): string {
  return iso ? dateTime.format(new Date(iso)) : '—';
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
