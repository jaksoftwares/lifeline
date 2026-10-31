'use client';

import { DECLINE_REASON_LABELS, DECLINE_REASONS, type DeclineReason } from '@lifeline/domain';
import { type RequestView, type RespondToRequestInput } from '@lifeline/schemas';
import { Alert, Button, cn, Field, Input, Select, Textarea } from '@lifeline/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, ApiError } from '@/lib/api';

type Decision = RespondToRequestInput['decision'];

const DECISIONS: { value: Decision; label: string }[] = [
  { value: 'ACCEPT', label: 'Accept' },
  { value: 'REQUEST_INFO', label: 'Ask for more information' },
  { value: 'DECLINE', label: 'Decline' },
];

/** The receiving facility's answer. Acceptance is an explicit decision by an authorised person. */
export function RespondPanel({
  referralId,
  request,
}: {
  referralId: string;
  request: RequestView;
}) {
  const queryClient = useQueryClient();
  const [decision, setDecision] = useState<Decision>('ACCEPT');
  const [departmentId, setDepartmentId] = useState('');
  const [readyAt, setReadyAt] = useState('');
  const [note, setNote] = useState('');
  const [declineReason, setDeclineReason] = useState<DeclineReason | ''>('');
  const [question, setQuestion] = useState('');

  const respond = useMutation({
    mutationFn: () => {
      const body: RespondToRequestInput =
        decision === 'ACCEPT'
          ? {
              decision,
              note,
              receivingDepartmentId: departmentId || null,
              readyAt: readyAt ? new Date(readyAt).toISOString() : null,
            }
          : decision === 'DECLINE'
            ? { decision, declineReason: declineReason as DeclineReason, note }
            : { decision, question };
      return api(`/referral-requests/${request.id}/respond`, { method: 'POST', body });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['referral', referralId] });
      void queryClient.invalidateQueries({ queryKey: ['referrals'] });
    },
  });
  const errors = respond.error instanceof ApiError ? respond.error.fieldErrors : {};

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        respond.mutate();
      }}
    >
      {request.status === 'INFO_REQUESTED' && (
        <Alert tone="info" title="You asked for more information">
          You can still respond now, or wait for the referring facility to answer below.
        </Alert>
      )}
      {respond.isError && !Object.keys(errors).length && (
        <Alert tone="critical" title={respond.error.message} />
      )}
      <fieldset>
        <legend className="sr-only">Your decision</legend>
        <div className="inline-flex flex-wrap rounded-sm border border-border-strong bg-surface p-0.5">
          {DECISIONS.map((d) => (
            <label
              key={d.value}
              className={cn(
                'cursor-pointer rounded-[4px] px-3 py-1.5 text-sm font-medium',
                decision === d.value ? 'bg-navy text-white' : 'text-slate hover:text-ink',
              )}
            >
              <input
                type="radio"
                name="decision"
                className="sr-only"
                checked={decision === d.value}
                onChange={() => setDecision(d.value)}
              />
              {d.label}
            </label>
          ))}
        </div>
      </fieldset>

      {decision === 'ACCEPT' && (
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Receiving department" optional>
            {(p) => (
              <Select {...p} value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
                <option value="">Not specified</option>
                {(request.departments ?? []).map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field
            label="Ready to receive from"
            optional
            hint="Your local time."
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
            label="Conditions or instructions"
            optional
            className="md:col-span-2"
            error={errors.note}
          >
            {(p) => (
              <Textarea
                {...p}
                rows={2}
                placeholder="e.g. Bed 4 reserved in CCU. Call the unit on arrival."
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            )}
          </Field>
        </div>
      )}
      {decision === 'DECLINE' && (
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Reason" error={errors.declineReason}>
            {(p) => (
              <Select
                {...p}
                required
                value={declineReason}
                onChange={(e) => setDeclineReason(e.target.value as DeclineReason)}
              >
                <option value="" disabled>
                  Select a reason
                </option>
                {DECLINE_REASONS.map((r) => (
                  <option key={r} value={r}>
                    {DECLINE_REASON_LABELS[r]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field
            label="Details"
            optional={declineReason !== 'OTHER'}
            className="md:col-span-2"
            error={errors.note}
          >
            {(p) => (
              <Textarea {...p} rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
            )}
          </Field>
        </div>
      )}
      {decision === 'REQUEST_INFO' && (
        <Field label="What do you need to know?" error={errors.question}>
          {(p) => (
            <Textarea
              {...p}
              rows={3}
              required
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
            />
          )}
        </Field>
      )}

      <Button
        type="submit"
        variant={decision === 'DECLINE' ? 'secondary' : 'primary'}
        disabled={respond.isPending || (decision === 'DECLINE' && !declineReason)}
      >
        {respond.isPending
          ? 'Sending…'
          : decision === 'ACCEPT'
            ? 'Accept referral'
            : decision === 'DECLINE'
              ? 'Decline referral'
              : 'Send question'}
      </Button>
    </form>
  );
}
