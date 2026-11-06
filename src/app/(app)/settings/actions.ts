'use server';

import { revalidatePath } from 'next/cache';
import { after } from 'next/server';
import { z } from 'zod';
import {
  ActionError,
  check,
  location,
  optionalNumber,
  optionalText,
  parseForm,
  requireMember,
  run,
  text,
  type FormState,
} from '@/lib/actions';
import { COUNTIES } from '@/lib/constants';
import { appUrl, sendEmails } from '@/lib/email';
import { createAdminClient } from '@/lib/supabase/server';

const orgSchema = z.object({
  name: text('Name'),
  county: z.enum(COUNTIES, { error: 'Choose a county' }),
  phone: text('Phone', 30),
  address: optionalText(200),
  level: optionalNumber('Choose a facility level'),
  fuel_price: optionalNumber('Enter the fuel price'),
  ...location,
});

export async function saveOrganization(_: FormState, formData: FormData): Promise<FormState> {
  return run(async () => {
    const { organization } = await requireMember({ admin: true });
    const input = parseForm(orgSchema, formData);
    const isHospital = organization.type === 'hospital';
    if (!isHospital && (input.fuel_price == null || input.fuel_price <= 0)) {
      throw new ActionError('Enter the fuel price per litre.');
    }
    check(
      await createAdminClient()
        .from('organizations')
        .update({
          ...input,
          level: isHospital ? input.level : null,
          fuel_price: isHospital ? null : input.fuel_price,
        })
        .eq('id', organization.id),
      'Could not save details',
    );
    revalidatePath('/', 'layout');
    return 'Details saved.';
  });
}

const personSchema = z.object({
  full_name: text('Full name', 100),
  phone: optionalText(30),
  email: z.email('Enter a valid email address'),
  password: z.string().min(8, 'Temporary password must be at least 8 characters'),
  role: z.enum(['admin', 'staff', 'driver']),
  license_number: optionalText(50),
});

/** An admin adds a colleague or driver. They sign in with the temporary password given here. */
export async function addPerson(_: FormState, formData: FormData): Promise<FormState> {
  return run(async () => {
    const { organization } = await requireMember({ admin: true });
    const input = parseForm(personSchema, formData);
    if (input.role === 'driver' && organization.type !== 'ambulance_provider') {
      throw new ActionError('Only ambulance providers have drivers.');
    }
    if (input.role === 'driver' && !input.license_number) {
      throw new ActionError("Enter the driver's licence number.");
    }

    const db = createAdminClient();
    const created = await db.auth.admin.createUser({
      email: input.email,
      password: input.password,
      email_confirm: true,
      user_metadata: { full_name: input.full_name },
    });
    if (created.error) {
      throw new ActionError(
        created.error.code === 'email_exists'
          ? 'Someone already uses this email.'
          : created.error.message,
      );
    }
    const profile = await db.from('profiles').insert({
      id: created.data.user.id,
      organization_id: organization.id,
      full_name: input.full_name,
      phone: input.phone,
      role: input.role,
      license_number: input.role === 'driver' ? input.license_number : null,
    });
    if (profile.error) {
      await db.auth.admin.deleteUser(created.data.user.id);
      check(profile, 'Could not add this person');
    }
    // The temporary password is never emailed: the admin hands it over in person.
    const isDriver = input.role === 'driver';
    after(() =>
      sendEmails([
        {
          to: input.email,
          subject: `You have been added to ${organization.name} on Afyaline`,
          heading: `Welcome to Afyaline, ${input.full_name.split(' ')[0]}`,
          lines: [
            `${organization.name} added you as ${isDriver ? 'an ambulance driver' : input.role === 'admin' ? 'an administrator' : 'a team member'}.`,
            `Sign in with this email address (${input.email}) and the temporary password your administrator gives you.`,
            ...(isDriver
              ? [
                  'Open Afyaline on your phone and add it to your home screen. Your trips appear under My trip.',
                ]
              : []),
          ],
          action: { label: 'Sign in', href: `${appUrl()}/login` },
        },
      ]),
    );
    revalidatePath('/settings');
    revalidatePath('/fleet');
    return `${input.full_name} added. They can sign in with ${input.email} and the temporary password.`;
  });
}

export async function removePerson(personId: string): Promise<FormState> {
  return run(async () => {
    const { organization, profile } = await requireMember({ admin: true });
    if (personId === profile.id) throw new ActionError('You cannot remove yourself.');

    const db = createAdminClient();
    const { data: person } = await db
      .from('profiles')
      .select('organization_id')
      .eq('id', personId)
      .maybeSingle();
    if (person?.organization_id !== organization.id) throw new ActionError('Person not found.');

    const result = await db.auth.admin.deleteUser(personId);
    if (result.error) throw new ActionError('Could not remove this person.');
    revalidatePath('/settings');
    revalidatePath('/fleet');
    return 'Removed.';
  });
}
