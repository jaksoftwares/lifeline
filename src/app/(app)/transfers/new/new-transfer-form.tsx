'use client';

import { useState } from 'react';
import { ActionForm } from '@/components/form';
import { HospitalPicker } from '@/components/transfer/hospital-picker';
import { Card, Field, Input, Select, Textarea } from '@/components/ui';
import { SERVICES, URGENCY } from '@/lib/constants';
import type { HospitalOption } from '@/lib/queries';
import type { Service, Urgency } from '@/lib/types';
import { createTransfer } from '../actions';

const URGENCY_STYLE: Record<Urgency, string> = {
  critical: 'has-checked:border-red-600 has-checked:bg-red-50 has-checked:text-red-700',
  urgent: 'has-checked:border-amber-500 has-checked:bg-amber-50 has-checked:text-amber-800',
  stable: 'has-checked:border-emerald-600 has-checked:bg-emerald-50 has-checked:text-emerald-700',
};

export function NewTransferForm({ hospitals }: { hospitals: HospitalOption[] }) {
  const [service, setService] = useState<Service | ''>('');

  return (
    <ActionForm action={createTransfer} submit="Send transfer request" className="space-y-6">
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
        <Card className="space-y-4 p-6">
          <h2 className="font-semibold">1. Patient</h2>
          <Field label="Full name">
            <Input name="patient_name" autoComplete="off" required />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Age (years)" hint="0 if under 1 year">
              <Input name="patient_age" type="number" inputMode="numeric" min={0} max={130} />
            </Field>
            <Field label="Sex">
              <Select name="patient_sex" required defaultValue="">
                <option value="" disabled>
                  Choose…
                </option>
                <option value="female">Female</option>
                <option value="male">Male</option>
              </Select>
            </Field>
          </div>
          <fieldset>
            <legend className="mb-1.5 text-sm font-medium text-slate-700">Urgency</legend>
            <div className="grid grid-cols-3 gap-2">
              {(Object.entries(URGENCY) as [Urgency, string][]).map(([value, label]) => (
                <label
                  key={value}
                  className={`cursor-pointer rounded-lg border-2 border-slate-200 py-2.5 text-center text-sm font-semibold ${URGENCY_STYLE[value]}`}
                >
                  <input type="radio" name="urgency" value={value} required className="sr-only" />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
          <Field label="Condition">
            <Textarea name="condition_summary" rows={3} required maxLength={500} />
          </Field>
          <Field label="History (optional)">
            <Textarea name="history" rows={2} maxLength={1000} />
          </Field>
          <Field label="Vitals (optional)">
            <Input name="vitals" placeholder="BP 120/80, HR 96, SpO2 95%" maxLength={300} />
          </Field>
        </Card>

        <Card className="space-y-4 p-6">
          <h2 className="font-semibold">2. Receiving hospital</h2>
          <Field label="Service needed">
            <Select
              name="service_needed"
              required
              value={service}
              onChange={(e) => setService(e.target.value as Service)}
            >
              <option value="" disabled>
                Choose…
              </option>
              {Object.entries(SERVICES).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
          <HospitalPicker hospitals={hospitals} service={service} />
        </Card>
      </div>
    </ActionForm>
  );
}
