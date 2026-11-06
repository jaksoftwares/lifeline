import 'server-only';

/** A clear message for each Supabase Auth failure, instead of one generic "something went wrong". */
export function authErrorMessage(error: {
  code?: string;
  status?: number;
  name?: string;
  message: string;
}) {
  switch (error.code) {
    case 'invalid_credentials':
      return 'Incorrect email or password. Check both and try again.';
    case 'email_not_confirmed':
      return 'This email address has not been confirmed yet. Ask your administrator to resend the invite.';
    case 'user_banned':
      return 'This account has been suspended. Contact your administrator.';
    case 'over_request_rate_limit':
    case 'over_email_send_rate_limit':
      return 'Too many attempts. Wait a minute, then try again.';
    case 'email_exists':
    case 'user_already_exists':
      return 'An account with this email already exists. Sign in instead.';
    case 'weak_password':
      return 'Choose a stronger password: at least 8 characters, mixing letters and numbers.';
    case 'same_password':
      return 'Choose a password different from your current one.';
  }
  if (error.status === 429) return 'Too many attempts. Wait a minute, then try again.';
  if (error.name === 'AuthRetryableFetchError' || error.status === 0 || error.status === 503) {
    return 'Cannot reach the sign-in service right now. Check your connection and try again.';
  }
  console.error('auth error', error);
  return 'Something went wrong. Please try again.';
}

/** Emails are case-insensitive; store and compare them in one form. */
export const normalizeEmail = (email: string) => email.trim().toLowerCase();
