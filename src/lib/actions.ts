import 'server-only';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { getCurrentUser, requireUser, type CurrentUser } from './auth';
import type { Organization, OrgType } from './types';

/** What every form action returns to its form. */
export interface FormState {
  error?: string;
  success?: string;
  /** The form field the error is about, so the form can highlight and focus it. */
  field?: string;
}

/** An expected failure whose message is safe to show the user, optionally about one field. */
export class ActionError extends Error {
  constructor(
    message: string,
    readonly field?: string,
  ) {
    super(message);
  }
}

export type Member = CurrentUser & { organization: Organization };

/** For server actions: a signed-in, non-driver member of an organization (optionally of a type, or an admin). */
export async function requireMember(
  opts: { type?: OrgType; admin?: boolean } = {},
): Promise<Member> {
  const user = await getCurrentUser();
  const org = user?.organization;
  if (!user || !org || user.profile.role === 'driver' || (opts.type && org.type !== opts.type)) {
    throw new ActionError('You are not allowed to do this.');
  }
  if (opts.admin && user.profile.role !== 'admin') {
    throw new ActionError('Only an administrator can do this.');
  }
  return user as Member;
}

/** For server actions: a signed-in driver of an ambulance provider. */
export async function requireDriver(): Promise<Member> {
  const user = await getCurrentUser();
  if (!user?.organization || user.profile.role !== 'driver') {
    throw new ActionError('Only drivers can do this.');
  }
  return user as Member;
}

/** For pages: the same check, but redirects instead of throwing. */
export async function requireMemberPage(type?: OrgType): Promise<Member> {
  const user = await requireUser();
  const org = user.organization;
  if (!org || user.profile.role === 'driver' || (type && org.type !== type)) redirect('/dashboard');
  return user as Member;
}

/** Validates FormData against a schema. Fields named `x[]` become arrays. */
export function parseForm<T extends z.ZodType>(schema: T, formData: FormData): z.infer<T> {
  const raw: Record<string, unknown> = {};
  for (const key of new Set(formData.keys())) {
    if (key.startsWith('$ACTION')) continue;
    raw[key.replace(/\[\]$/, '')] = key.endsWith('[]') ? formData.getAll(key) : formData.get(key);
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new ActionError(issue.message, issue.path[0]?.toString());
  }
  return result.data;
}

/** Runs an action body and turns expected failures into form messages. */
export async function run(body: () => Promise<string | void>): Promise<FormState> {
  try {
    return { success: (await body()) ?? 'Saved.' };
  } catch (error) {
    if (error instanceof ActionError) return { error: error.message, field: error.field };
    throw error; // includes Next.js redirects
  }
}

/** Throws a user-facing error if a Supabase call failed. */
export function check<T>(
  result: { data: T; error: { message: string; code?: string } | null },
  message: string,
): T {
  if (result.error) {
    console.error(message, result.error);
    throw new ActionError(
      result.error.code === '23505' ? `${message}: it already exists.` : message,
    );
  }
  return result.data;
}

// Common field rules
export const text = (label: string, max = 200) =>
  z
    .string({ error: `${label} is required` })
    .trim()
    .min(1, `${label} is required`)
    .max(max);

export const optionalText = (max = 500) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => v || null);

/** A number field; an empty input is "missing", never 0. */
export const number = (message: string) =>
  z.preprocess(
    (v) => (v === '' || v == null ? undefined : v),
    z.coerce.number({ error: message }).refine(Number.isFinite, message),
  );

export const optionalNumber = (message: string) =>
  z.preprocess(
    (v) => (v === '' || v == null ? null : v),
    z.coerce.number({ error: message }).refine(Number.isFinite, message).nullable(),
  );

export const location = {
  lat: number('Set your location on the map').pipe(z.number().min(-90).max(90)),
  lng: number('Set your location on the map').pipe(z.number().min(-180).max(180)),
};
