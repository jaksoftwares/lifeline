'use client';

import { useState } from 'react';
import { Ambulance, Hospital } from 'lucide-react';
import { ActionForm } from '@/components/form';
import { LocationField } from '@/components/location-field';
import { PasswordInput } from '@/components/password-input';
import { Field, Input, Select } from '@/components/ui';
import { COUNTIES } from '@/lib/constants';
import type { OrgType } from '@/lib/types';
import { register } from './actions';

const TYPES = [
  { value: 'hospital', label: 'Hospital', text: 'Send and receive patients', icon: Hospital },
  {
    value: 'ambulance_provider',
    label: 'Ambulance provider',
    text: 'Ambulances and drivers',
    icon: Ambulance,
  },
] as const;

export function RegisterForm() {
  const [type, setType] = useState<OrgType>('hospital');

  return (
    <ActionForm
      action={register}
      submit="Create account"
      pendingLabel="Creating your account…"
      className="space-y-6"
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {TYPES.map(({ value, label, text, icon: Icon }) => (
          <label
            key={value}
            className={`flex cursor-pointer items-center gap-3 rounded-xl border-2 p-4 transition ${
              type === value
                ? 'border-brand-600 bg-brand-50'
                : 'border-slate-200 hover:border-slate-300'
            }`}
          >
            <input
              type="radio"
              name="type"
              value={value}
              checked={type === value}
              onChange={() => setType(value)}
              className="sr-only"
            />
            <Icon className={`h-7 w-7 ${type === value ? 'text-brand-700' : 'text-slate-400'}`} />
            <span>
              <span className="block font-semibold">{label}</span>
              <span className="block text-xs text-slate-600">{text}</span>
            </span>
          </label>
        ))}
      </div>

      <fieldset className="space-y-4">
        <legend className="mb-3 font-semibold">
          {type === 'hospital' ? 'Hospital' : 'Provider'} details
        </legend>
        <Field label={type === 'hospital' ? 'Hospital name' : 'Organization name'}>
          <Input name="name" required />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="County">
            <Select name="county" required defaultValue="">
              <option value="" disabled>
                Choose…
              </option>
              {COUNTIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          </Field>
          <Field label="Phone">
            <Input name="phone" type="tel" required placeholder="+254 …" />
          </Field>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Address" className={type === 'hospital' ? '' : 'sm:col-span-2'}>
            <Input name="address" placeholder="Street / town" />
          </Field>
          {type === 'hospital' && (
            <Field label="Facility level">
              <Select name="level" defaultValue="4">
                {[2, 3, 4, 5, 6].map((l) => (
                  <option key={l} value={l}>
                    Level {l}
                  </option>
                ))}
              </Select>
            </Field>
          )}
        </div>
        <LocationField />
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="mb-3 font-semibold">Your account</legend>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Full name">
            <Input name="full_name" autoComplete="name" required />
          </Field>
          <Field label="Phone">
            <Input name="user_phone" type="tel" autoComplete="tel" />
          </Field>
          <Field label="Email">
            <Input
              name="email"
              type="email"
              autoComplete="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
            />
          </Field>
          <Field label="Password" hint="At least 8 characters">
            <PasswordInput name="password" autoComplete="new-password" />
          </Field>
        </div>
      </fieldset>
    </ActionForm>
  );
}
