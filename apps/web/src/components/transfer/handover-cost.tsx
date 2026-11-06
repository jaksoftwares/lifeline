'use client';

import { TRANSPORT_PAYER_LABELS, TRANSPORT_PAYERS } from '@lifeline/domain';
import { type HandoverView, type TransferDetail } from '@lifeline/schemas';
import {
  Alert,
  Button,
  Card,
  CardBody,
  CardHeader,
  Field,
  Input,
  Select,
  Textarea,
} from '@lifeline/ui';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { useTransferInvalidation } from './use-transfer-invalidation';

const CHECKLIST = [
  ['patientIdentityConfirmed', 'Patient identity confirmed with the receiving team'],
  ['clinicalSummaryReceived', 'Clinical summary and reason for transfer reviewed'],
  ['latestObservationsReceived', 'Latest observations and early-warning score handed over'],
  ['treatmentAndAllergiesReviewed', 'Treatment given, medicines and allergies reviewed'],
  ['documentsAndResultsAddressed', 'Documents and results handed over or confirmed not applicable'],
] as const;

type ChecklistKey = (typeof CHECKLIST)[number][0];

const EMPTY_CHECKLIST: Record<ChecklistKey, boolean> = {
  patientIdentityConfirmed: false,
  clinicalSummaryReceived: false,
  latestObservationsReceived: false,
  treatmentAndAllergiesReviewed: false,
  documentsAndResultsAddressed: false,
};

const COSTABLE_STATUSES = ['ARRIVED', 'HANDED_OVER'];

export function HandoverCost({ transfer: t }: { transfer: TransferDetail }) {
  const show = ['ARRIVED', 'HANDED_OVER', 'COMPLETED'].includes(t.status);
  if (!show) return null;

  return (
    <div className="space-y-4">
      {t.handover ? (
        <HandoverRecord handover={t.handover} />
      ) : t.status === 'ARRIVED' && t.viewer.canSignHandover ? (
        <HandoverForm transfer={t} />
      ) : t.status === 'ARRIVED' ? (
        <Card>
          <CardHeader title="Handover" />
          <CardBody>
            <p className="text-sm text-slate">Waiting for the receiving decision-maker to sign.</p>
          </CardBody>
        </Card>
      ) : null}

      {t.cost ? (
        <CostRecord transfer={t} />
      ) : t.viewer.canRecordCost && COSTABLE_STATUSES.includes(t.status) ? (
        <CostForm transfer={t} />
      ) : t.status === 'HANDED_OVER' ? (
        <Card>
          <CardHeader title="Trip cost" />
          <CardBody>
            <p className="text-sm text-slate">
              Waiting for an authorised participant to record the cost.
            </p>
          </CardBody>
        </Card>
      ) : null}

      {t.status === 'HANDED_OVER' && t.viewer.canComplete && <CompleteTransfer transfer={t} />}
    </div>
  );
}

function HandoverForm({ transfer: t }: { transfer: TransferDetail }) {
  const invalidate = useTransferInvalidation(t);
  const [checked, setChecked] = useState(EMPTY_CHECKLIST);
  const [notes, setNotes] = useState('');
  const sign = useMutation({
    mutationFn: () =>
      api(`/transfers/${t.id}/handover`, {
        method: 'POST',
        body: { ...checked, notes },
      }),
    onSuccess: invalidate,
  });
  const complete = Object.values(checked).every(Boolean);

  return (
    <Card className="border-teal-deep shadow-[inset_4px_0_0_var(--color-teal-deep)]">
      <CardHeader
        title="Receiving handover"
        description="Confirm each item with the arriving crew. Signing records you and the time."
      />
      <CardBody className="space-y-4">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            sign.mutate();
          }}
        >
          <fieldset className="space-y-3">
            <legend className="mb-2 text-sm font-medium text-ink">Handover checklist</legend>
            {CHECKLIST.map(([key, label]) => (
              <label key={key} className="flex items-start gap-2 text-sm text-ink">
                <input
                  type="checkbox"
                  className="mt-0.5 size-4 accent-teal-deep"
                  checked={checked[key]}
                  onChange={(e) =>
                    setChecked((previous) => ({ ...previous, [key]: e.target.checked }))
                  }
                />
                {label}
              </label>
            ))}
          </fieldset>
          <Field label="Handover notes" optional>
            {(p) => (
              <Textarea
                {...p}
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add any relevant details or follow-up instructions."
              />
            )}
          </Field>
          {sign.isError && <Alert tone="critical" title={sign.error.message} />}
          <Button type="submit" disabled={!complete || sign.isPending}>
            Sign handover
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}

function HandoverRecord({ handover }: { handover: HandoverView }) {
  return (
    <Card>
      <CardHeader
        title="Handover signed"
        description={`${handover.signedBy.fullName} · ${formatDateTime(handover.signedAt)}`}
      />
      <CardBody className="space-y-2 text-sm">
        <ul className="space-y-1">
          {CHECKLIST.map(([key, label]) => (
            <li key={key} className="flex items-start gap-2 text-ink">
              <span aria-hidden className="font-bold text-success">
                ✓
              </span>
              {label}
            </li>
          ))}
        </ul>
        {handover.notes && <p className="whitespace-pre-wrap text-slate">{handover.notes}</p>}
      </CardBody>
    </Card>
  );
}

function CostForm({ transfer: t }: { transfer: TransferDetail }) {
  const invalidate = useTransferInvalidation(t);
  const [amount, setAmount] = useState('');
  const [payer, setPayer] = useState<(typeof TRANSPORT_PAYERS)[number]>('REFERRING_FACILITY');
  const [payerName, setPayerName] = useState('');
  const [notes, setNotes] = useState('');
  const record = useMutation({
    mutationFn: () =>
      api(`/transfers/${t.id}/cost`, {
        method: 'POST',
        body: { amount, payer, payerName, notes },
      }),
    onSuccess: invalidate,
  });

  return (
    <Card>
      <CardHeader
        title="Record trip cost"
        description="Record the agreed cost and payer in Kenyan shillings. Lifeline does not process payment."
      />
      <CardBody>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            record.mutate();
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Amount (KES)">
              {(p) => (
                <Input
                  {...p}
                  type="number"
                  min="0"
                  max="999999999.99"
                  step="0.01"
                  required
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              )}
            </Field>
            <Field label="Payer">
              {(p) => (
                <Select
                  {...p}
                  value={payer}
                  onChange={(e) => setPayer(e.target.value as (typeof TRANSPORT_PAYERS)[number])}
                >
                  {TRANSPORT_PAYERS.map((value) => (
                    <option key={value} value={value}>
                      {TRANSPORT_PAYER_LABELS[value]}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            {payer === 'OTHER' && (
              <Field label="Payer name">
                {(p) => (
                  <Input
                    {...p}
                    required
                    maxLength={120}
                    value={payerName}
                    onChange={(e) => setPayerName(e.target.value)}
                  />
                )}
              </Field>
            )}
            <Field
              label="Cost notes"
              optional
              className={payer === 'OTHER' ? undefined : 'sm:col-span-2'}
            >
              {(p) => (
                <Textarea
                  {...p}
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Optional context, e.g. invoice reference."
                />
              )}
            </Field>
          </div>
          {record.isError && <Alert tone="critical" title={record.error.message} />}
          <Button type="submit" disabled={record.isPending || !amount}>
            Record cost
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}

function CostRecord({ transfer: t }: { transfer: TransferDetail }) {
  const cost = t.cost!;
  const amount = new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency: cost.currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cost.amount);

  return (
    <Card>
      <CardHeader
        title="Trip cost recorded"
        description={`${cost.recordedBy.fullName} · ${formatDateTime(cost.recordedAt)}`}
      />
      <CardBody className="space-y-1 text-sm">
        <p className="font-semibold text-ink">{amount}</p>
        <p className="text-slate">
          Paid by {cost.payer === 'OTHER' ? cost.payerName : TRANSPORT_PAYER_LABELS[cost.payer]}
        </p>
        {cost.notes && <p className="whitespace-pre-wrap text-slate">{cost.notes}</p>}
      </CardBody>
    </Card>
  );
}

function CompleteTransfer({ transfer: t }: { transfer: TransferDetail }) {
  const invalidate = useTransferInvalidation(t);
  const complete = useMutation({
    mutationFn: () => api(`/transfers/${t.id}/complete`, { method: 'POST' }),
    onSuccess: invalidate,
  });

  return (
    <Card>
      <CardHeader title="Complete transfer" />
      <CardBody className="space-y-3">
        {t.cost ? (
          <>
            <p className="text-sm text-slate">
              Handover and cost are recorded. Completing closes the transfer and releases the
              ambulance.
            </p>
            {complete.isError && <Alert tone="critical" title={complete.error.message} />}
            <Button
              disabled={complete.isPending}
              onClick={() =>
                window.confirm('Complete this transfer and release the ambulance?') &&
                complete.mutate()
              }
            >
              Complete transfer
            </Button>
          </>
        ) : (
          <p className="text-sm text-slate">
            Record the trip cost before completing this transfer.
          </p>
        )}
      </CardBody>
    </Card>
  );
}
