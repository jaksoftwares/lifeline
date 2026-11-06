'use server';

import { redirect } from 'next/navigation';
import { after } from 'next/server';
import { z } from 'zod';
import {
  ActionError,
  location,
  optionalNumber,
  optionalText,
  parseForm,
  run,
  text,
  type FormState,
} from '@/lib/actions';
import { COUNTIES } from '@/lib/constants';
import { adminEmails, appUrl, sendEmails } from '@/lib/email';
import { createAdminClient, createClient } from '@/lib/supabase/server';

const schema = z.object({
  type: z.enum(['hospital', 'ambulance_provider'], {
    error: 'Choose hospital or ambulance provider',
  }),
  name: text('Organization name'),
  county: z.enum(COUNTIES, { error: 'Choose a county' }),
  phone: text('Organization phone', 30),
  address: optionalText(200),
  level: optionalNumber('Choose a facility level'),
  ...location,
  full_name: text('Your name', 100),
  user_phone: optionalText(30),
  email: z.email('Enter a valid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

/** Open registration (demo mode): creates the organization and its first admin, then signs in. */
export async function register(_: FormState, formData: FormData): Promise<FormState> {
  return run(async () => {
    const input = parseForm(schema, formData);
    const admin = createAdminClient();

    const created = await admin.auth.admin.createUser({
      email: input.email,
      password: input.password,
      email_confirm: true,
      user_metadata: { full_name: input.full_name },
    });
    if (created.error) {
      throw new ActionError(
        created.error.code === 'email_exists'
          ? 'An account with this email already exists. Sign in instead.'
          : created.error.message,
      );
    }
    const userId = created.data.user.id;

    const org = await admin
      .from('organizations')
      .insert({
        type: input.type,
        name: input.name,
        county: input.county,
        phone: input.phone,
        address: input.address,
        email: input.email,
        lat: input.lat,
        lng: input.lng,
        level: input.type === 'hospital' ? input.level : null,
        fuel_price: input.type === 'ambulance_provider' ? 180 : null,
      })
      .select('id')
      .single();
    const profile = org.error
      ? org
      : await admin.from('profiles').insert({
          id: userId,
          organization_id: org.data.id,
          full_name: input.full_name,
          phone: input.user_phone,
          role: 'admin',
        });
    if (org.error || profile.error) {
      // Undo, so the person can simply try again.
      if (org.data) await admin.from('organizations').delete().eq('id', org.data.id);
      await admin.auth.admin.deleteUser(userId);
      console.error('registration failed', org.error ?? profile.error);
      throw new ActionError('Registration failed. Please try again.');
    }

    const supabase = await createClient();
    await supabase.auth.signInWithPassword({ email: input.email, password: input.password });

    const isHospital = input.type === 'hospital';
    after(() =>
      sendEmails([
        {
          to: input.email,
          subject: `Welcome to Afyaline, ${input.name}`,
          heading: `Welcome to Afyaline, ${input.full_name.split(' ')[0]}`,
          lines: [
            `${input.name} is now on the Afyaline network.`,
            isHospital
              ? 'Next: set your beds and services so other hospitals can send patients to you, and add your team.'
              : 'Next: add your ambulances and drivers so hospitals can request them.',
          ],
          action: {
            label: 'Open Afyaline',
            href: `${appUrl()}/${isHospital ? 'capacity' : 'fleet'}`,
          },
        },
        ...adminEmails().map((to) => ({
          to,
          subject: `New ${isHospital ? 'hospital' : 'ambulance provider'} on Afyaline: ${input.name}`,
          heading: `${input.name} registered`,
          lines: [
            `${isHospital ? 'Hospital' : 'Ambulance provider'} in ${input.county}, phone ${input.phone}.`,
            `Registered by ${input.full_name} (${input.email}).`,
          ],
          action: { label: 'View the network', href: `${appUrl()}/network` },
        })),
      ]),
    );
    redirect(input.type === 'hospital' ? '/capacity' : '/fleet');
  });
}
