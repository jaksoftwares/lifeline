'use client';

import {
  CAPABILITY_DESCRIPTIONS,
  CAPABILITY_LABELS,
  CAPABILITY_LEVELS,
  type CapabilityLevel,
  SUGGESTED_CAPABILITY,
  VEHICLE_EQUIPMENT,
} from '@lifeline/domain';
import { type ReferralDetail } from '@lifeline/schemas';
import { Alert, Button, cn, Field, Input, Textarea } from '@lifeline/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, ApiError } from '@/lib/api';

/**
 * What the patient needs on the way. The level is pre-selected from the urgency as a starting point
 * only; the clinician decides.
 */
export function RequestTransportForm({ referral }: { referral: ReferralDetail }) {
  const queryClient = useQueryClient();
  const [capability, setCapability] = useState<CapabilityLevel>(
    SUGGESTED_CAPABILITY[referral.urgency ?? 'URGENT'],
  );
  const [equipment, setEquipment] = useState<string[]>([]);
  const [readyAt, setReadyAt] = useState('');
  const [notes, setNotes] = useState('');

  const request = useMutation({
    mutationFn: () =>
      api(`/referrals/${referral.id}/transfer`, {
        method: 'POST',
        body: {
          requiredCapability: capability,
          requiredEquipment: equipment,
          readyAt: readyAt ? new Date(readyAt).toISOString() : null,
          notes,
        },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['referral', referral.id] });
      void queryClient.invalidateQueries({ queryKey: ['referrals'] });
      void queryClient.invalidateQueries({ queryKey: ['transfers'] });
    },
  });
  const errors = request.error instanceof ApiError ? request.error.fieldErrors : {};
  const toggle = (code: string) =>
    setEquipment((list) =>
      list.includes(code) ? list.filter((c) => c !== code) : [...list, code],
    );

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        request.mutate();
      }}
    >
      {request.isError && !Object.keys(errors).length && (
        <Alert tone="critical" title={request.error.message} />
      )}
      <fieldset>
        <legend className="text-[13px] font-medium text-ink">Level of care on the way</legend>
        <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
          {CAPABILITY_LEVELS.map((level) => (
            <label
              key={level}
              className={cn(
                'flex cursor-pointer gap-3 rounded-md border p-3',
                capability === level
                  ? 'border-teal-deep bg-teal-soft'
                  : 'border-border hover:border-teal-deep',
              )}
            >
              <input
                type="radio"
                name="capability"
                className="mt-1 size-4 accent-teal-deep"
                checked={capability === level}
                onChange={() => setCapability(level)}
              />
              <span>
                <span className="block text-sm font-medium text-ink">
                  {CAPABILITY_LABELS[level]}
                </span>
                <span className="block text-xs text-slate">{CAPABILITY_DESCRIPTIONS[level]}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="text-[13px] font-medium text-ink">
          Equipment needed <span className="font-normal text-muted">(optional)</span>
        </legend>
        <div className="mt-1.5 flex flex-wrap gap-2">
          {VEHICLE_EQUIPMENT.map((e) => (
            <label
              key={e.code}
              className={cn(
                'inline-flex cursor-pointer items-center gap-2 rounded-pill border px-3 py-1 text-sm',
                equipment.includes(e.code)
                  ? 'border-teal-deep bg-teal-soft text-ink'
                  : 'border-border text-slate hover:border-teal-deep',
              )}
            >
              <input
                type="checkbox"
                className="size-3.5 accent-teal-deep"
                checked={equipment.includes(e.code)}
                onChange={() => toggle(e.code)}
              />
              {e.name}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-4 md:grid-cols-3">
        <Field
          label="Patient ready for collection"
          optional
          hint="Leave empty if ready now. Your local time."
          error={errors.readyAt}
        >
          {(p) => (
            <Input
              {...p}
              type="datetime-local"
              value={readyAt}
              onChange={(e) => setReadyAt(e.target.value)}
            />
          )}
        </Field>
        <Field
          label="Notes for the crew"
          optional
          className="md:col-span-2"
          hint="Shared with the ambulance provider before they confirm. Leave out the patient’s name."
          error={errors.notes}
        >
          {(p) => (
            <Textarea
              {...p}
              rows={2}
              placeholder="e.g. On 4 L oxygen by nasal prongs. Cervical collar in place."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          )}
        </Field>
      </div>
      <Button type="submit" size="lg" disabled={request.isPending}>
        Find an ambulance
      </Button>
    </form>
  );
}
