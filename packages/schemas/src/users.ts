import { type InstitutionType, type Role } from '@lifeline/domain';
import { z } from 'zod';
import { emailSchema, passwordSchema, roleSchema } from './auth';

/** Kenyan mobile numbers in international format, e.g. +254712345678. */
export const kenyanPhoneSchema = z
  .string()
  .trim()
  .regex(/^\+254[17]\d{8}$/, 'Enter a Kenyan mobile number in the format +2547XXXXXXXX.');

export const membershipInputSchema = z.object({
  networkId: z.string().min(1),
  /** Omit for network-wide roles. */
  institutionId: z.string().min(1).nullable(),
  role: roleSchema,
});
export type MembershipInput = z.infer<typeof membershipInputSchema>;

export const createUserSchema = z.object({
  fullName: z.string().trim().min(2, 'Enter the person’s full name.').max(120),
  email: emailSchema,
  phone: kenyanPhoneSchema.optional(),
  /** Shared with the user out of band; they must replace it at first sign-in. */
  temporaryPassword: passwordSchema,
  membership: membershipInputSchema,
});
export type CreateUserInput = z.infer<typeof createUserSchema>;

export const listUsersQuerySchema = z.object({
  networkId: z.string().min(1),
  institutionId: z.string().min(1).optional(),
});

export interface UserMembershipSummary {
  id: string;
  role: Role;
  roleLabel: string;
  institution: { id: string; name: string; type: InstitutionType } | null;
}

export interface UserSummary {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  status: 'ACTIVE' | 'DEACTIVATED';
  mfaEnabled: boolean;
  lastLoginAt: string | null;
  memberships: UserMembershipSummary[];
}
