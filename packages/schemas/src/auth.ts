import { PASSWORD_MIN_LENGTH, type Permission, type Role, ROLES } from '@lifeline/domain';
import { z } from 'zod';

export { PASSWORD_MIN_LENGTH };

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Use at least ${PASSWORD_MIN_LENGTH} characters.`)
  .max(128, 'Use no more than 128 characters.');

/** Normalised before validation, so pasted addresses with stray spaces or capitals are accepted. */
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email('Enter a valid email address.'));

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Enter your password.'),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const totpCodeSchema = z
  .string()
  .regex(/^\d{6}$/, 'Enter the 6-digit code from your authenticator app.');

export const mfaVerifySchema = z.object({
  challengeToken: z.string().min(1),
  code: totpCodeSchema,
});
export type MfaVerifyInput = z.infer<typeof mfaVerifySchema>;

export const challengeSchema = z.object({
  challengeToken: z.string().min(1),
});

export const initialPasswordSchema = z.object({
  challengeToken: z.string().min(1),
  newPassword: passwordSchema,
});
export type InitialPasswordInput = z.infer<typeof initialPasswordSchema>;

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Enter your current password.'),
  newPassword: passwordSchema,
});
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

/**
 * Sign-in is a short sequence. Each step either finishes (`AUTHENTICATED`) or returns a
 * short-lived challenge token for the next required step.
 */
export type AuthStep =
  'AUTHENTICATED' | 'PASSWORD_CHANGE_REQUIRED' | 'MFA_SETUP_REQUIRED' | 'MFA_REQUIRED';

/** Sent by the crew app on sign-in requests; tokens then come back in the body instead of cookies. */
export const MOBILE_CLIENT_HEADER = 'x-lifeline-client';

/** Tokens for the crew app, which keeps them in the device's secure storage. */
export interface MobileTokens {
  accessToken: string;
  /** Absent when the refresh token was not rotated (a concurrent refresh already did). */
  refreshToken?: string;
  accessExpiresInSeconds: number;
  sessionExpiresAt: string;
}

export const mobileRefreshSchema = z.object({ refreshToken: z.string().min(10).max(500) });

export type AuthStepResponse =
  | { step: 'AUTHENTICATED'; user: CurrentUser; tokens?: MobileTokens }
  | { step: Exclude<AuthStep, 'AUTHENTICATED'>; challengeToken: string };

export interface MfaSetupResponse {
  otpauthUrl: string;
  /** Base32 secret for manual entry when the QR code cannot be scanned. */
  secret: string;
  qrCodeDataUrl: string;
}

export interface CurrentUserMembership {
  id: string;
  role: Role;
  roleLabel: string;
  network: { id: string; name: string };
  institution: { id: string; name: string; type: 'FACILITY' | 'AMBULANCE_PROVIDER' } | null;
}

export interface CurrentUser {
  id: string;
  email: string;
  fullName: string;
  mfaEnabled: boolean;
  memberships: CurrentUserMembership[];
  /** Union of permissions across memberships. Shapes navigation only; the API authorises each request. */
  permissions: Permission[];
}

export const roleSchema = z.enum(ROLES);
