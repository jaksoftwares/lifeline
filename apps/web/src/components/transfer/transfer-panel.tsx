'use client';

import {
  ASSIGNMENT_DECLINE_LABELS,
  CAPABILITY_LABELS,
  CREW_QUALIFICATION_LABELS,
  equipmentName,
  EXTERNAL_TRANSPORT_LABELS,
  PRE_COLLECTION_STATUSES,
} from '@lifeline/domain';
import { type AssignmentView, type TransferDetail } from '@lifeline/schemas';
import { Alert, Button, Card, CardBody, CardHeader, Input, Loading } from '@lifeline/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Phone } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import {
  AssignmentStatusChip,
  CapabilityTag,
  TransferStatusChip,
} from '@/components/transport-chips';
import { api } from '@/lib/api';
import { formatAgo, formatDateTime, formatMinutes } from '@/lib/format';
import { useTransfer } from '@/lib/queries';
import { DispatchPanel } from './dispatch-panel';
import { ExternalTransportForm } from './external-transport-form';
import { TransferHistory } from './transfer-history';
import { VehiclePicker } from './vehicle-picker';

/** Refreshes everything that shows this transfer after a change. */
export function useTransferInvalidation(transfer: Pick<TransferDetail, 'id' | 'referral'>) {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ['transfer', transfer.id] });
    void queryClient.invalidateQueries({ queryKey: ['transfer-suggestions', transfer.id] });
    void queryClient.invalidateQueries({ queryKey: ['transfers'] });
    void queryClient.invalidateQueries({ queryKey: ['vehicles'] });
    void queryClient.invalidateQueries({ queryKey: ['crew'] });
    void queryClient.invalidateQueries({ queryKey: ['referral', transfer.referral.id] });
    void queryClient.invalidateQueries({ queryKey: ['referrals'] });
  };
}

export function TransferPanel({ transferId }: { transferId: string }) {
  const transfer = useTransfer(transferId);
  if (transfer.isPending) return <Loading label="Loading transport details…" />;
  if (transfer.isError) {
    return (
      <Alert tone="critical" title="We couldn’t load the transport details">
        {transfer.error.message}
      </Alert>
    );
  }
  return <TransferView transfer={transfer.data} />;
}

function TransferView({ transfer: t }: { transfer: TransferDetail }) {
  const current = t.current;
  const dispatchable = current && t.viewer.dispatchableAssignmentIds.includes(current.id);
  const beforeCollection = PRE_COLLECTION_STATUSES.includes(t.status);
  const earlier = t.assignments.filter((a) => a.id !== current?.id);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="Transport"
          description={`Requested by ${t.requestedBy.fullName}, ${formatDateTime(t.requestedAt)}`}
          actions={<TransferStatusChip status={t.status} />}
        />
        <CardBody className="space-y-4">
          {t.status === 'CANCELLED' && (
            <Alert tone="neutral" title={`Cancelled ${formatDateTime(t.cancelledAt)}`}>
              {t.cancelReason}
            </Alert>
          )}
          <Route transfer={t} />
          <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
            <Item label="Care needed on the way">
              <span className="flex flex-wrap gap-1.5">
                <CapabilityTag level={t.requiredCapability} />
                {t.requiredEquipment.map((code) => (
                  <span
                    key={code}
                    className="rounded-pill border border-border px-2.5 py-0.5 text-xs text-ink"
                  >
                    {equipmentName(code)}
                  </span>
                ))}
              </span>
            </Item>
            <Item label="Patient ready for collection">
              {t.readyAt ? formatDateTime(t.readyAt) : 'Now'}
            </Item>
            {t.patient && <Item label="Patient">{t.patient.displayName}</Item>}
            {t.notes && (
              <Item label="Notes for the crew" wide>
                <span className="whitespace-pre-wrap">{t.notes}</span>
              </Item>
            )}
          </dl>
          {!t.patient && (
            <p className="text-xs text-slate">
              The patient’s name is shared with your team once you confirm the trip.
            </p>
          )}
        </CardBody>
      </Card>

      {current && <CurrentAssignment transfer={t} assignment={current} />}

      {t.viewer.canArrange && t.status === 'AWAITING_TRANSPORT' && !current && (
        <Arrange transfer={t} />
      )}

      {dispatchable && <DispatchPanel transfer={t} assignment={current} />}

      {earlier.length > 0 && (
        <Card>
          <CardHeader title="Earlier offers" />
          <CardBody>
            <ul className="space-y-2 text-sm">
              {earlier.map((a) => (
                <li key={a.id} className="flex flex-wrap items-baseline justify-between gap-2">
                  <span>
                    {assignmentTitle(a)}
                    {a.declineReason && (
                      <span className="text-slate">
                        {' '}
                        · {ASSIGNMENT_DECLINE_LABELS[a.declineReason]}
                        {a.responseNote ? `: ${a.responseNote}` : ''}
                      </span>
                    )}
                    {a.endReason && <span className="text-slate"> · {a.endReason}</span>}
                  </span>
                  <AssignmentStatusChip status={a.status} />
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}

      <TransferHistory events={t.events} />

      {t.viewer.canArrange && beforeCollection && <CancelTransfer transfer={t} />}
    </div>
  );
}

function Route({ transfer: t }: { transfer: TransferDetail }) {
  const dept = t.destination.department;
  return (
    <div className="flex flex-wrap items-start gap-3 rounded-md bg-surface-subtle p-3 text-sm">
      <div className="min-w-40 flex-1">
        <p className="text-[13px] text-slate">Pick up from</p>
        <p className="font-medium text-ink">{t.pickup.name}</p>
        <PhoneLink phone={t.pickup.phone} />
      </div>
      <ArrowRight aria-hidden className="mt-5 size-4 shrink-0 text-slate" />
      <div className="min-w-40 flex-1">
        <p className="text-[13px] text-slate">Take to</p>
        <p className="font-medium text-ink">
          {t.destination.name}
          {dept && <span className="font-normal text-slate"> · {dept.name}</span>}
        </p>
        <PhoneLink phone={dept?.phone ?? t.destination.phone} />
      </div>
      {t.tripMinutes != null && (
        <p className="w-full text-xs text-slate sm:w-auto sm:self-center">
          About {formatMinutes(t.tripMinutes)} by road (estimate)
        </p>
      )}
    </div>
  );
}

function CurrentAssignment({
  transfer: t,
  assignment: a,
}: {
  transfer: TransferDetail;
  assignment: AssignmentView;
}) {
  const invalidate = useTransferInvalidation(t);
  const [withdrawing, setWithdrawing] = useState(false);
  const [reason, setReason] = useState('');
  const withdraw = useMutation({
    mutationFn: () =>
      api(`/dispatch-assignments/${a.id}/withdraw`, { method: 'POST', body: { reason } }),
    onSuccess: () => {
      setWithdrawing(false);
      invalidate();
    },
  });
  const markDispatched = useMutation({
    mutationFn: () => api(`/dispatch-assignments/${a.id}/dispatch`, { method: 'POST' }),
    onSuccess: invalidate,
  });
  const canWithdraw =
    t.viewer.canArrange && PRE_COLLECTION_STATUSES.includes(t.status) && a.kind === 'PROVIDER';

  return (
    <Card
      className={
        a.status === 'PROPOSED'
          ? 'border-warning shadow-[inset_4px_0_0_var(--color-warning)]'
          : 'border-success shadow-[inset_4px_0_0_var(--color-success)]'
      }
    >
      <CardHeader
        title={a.status === 'PROPOSED' ? 'Awaiting provider confirmation' : 'Ambulance'}
        description={
          a.status === 'PROPOSED'
            ? `Offered ${formatAgo(a.proposedAt)} by ${a.proposedBy.fullName}. Nothing is assigned until the provider confirms.`
            : a.respondedAt
              ? `Confirmed ${formatDateTime(a.respondedAt)}${a.respondedBy ? ` by ${a.respondedBy.fullName}` : ''}`
              : undefined
        }
        actions={<AssignmentStatusChip status={a.status} />}
      />
      <CardBody className="space-y-3 text-sm">
        <p className="font-medium text-ink">{assignmentTitle(a)}</p>
        {a.provider?.phone && <PhoneLink phone={a.provider.phone} label="Provider dispatch" />}
        {a.external?.contactPhone && <PhoneLink phone={a.external.contactPhone} label="Contact" />}
        {a.vehicle && (
          <p className="text-slate">
            {CAPABILITY_LABELS[a.vehicle.capability]}
            {a.vehicle.equipment.length > 0 &&
              ` · ${a.vehicle.equipment.map(equipmentName).join(', ')}`}
          </p>
        )}
        {a.crew.length > 0 && (
          <div>
            <p className="text-[13px] text-slate">Crew</p>
            <ul className="mt-1 space-y-0.5">
              {a.crew.map((c) => (
                <li key={c.id}>
                  {c.fullName}{' '}
                  <span className="text-slate">({CREW_QUALIFICATION_LABELS[c.qualification]})</span>
                  {c.phone && (
                    <a
                      href={`tel:${c.phone}`}
                      className="tabular ml-2 text-teal-deep hover:underline"
                    >
                      {c.phone}
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
        {a.etaMinutes != null && t.status === 'AMBULANCE_ASSIGNED' && (
          <p>
            Provider’s estimate: about{' '}
            <span className="tabular">{formatMinutes(a.etaMinutes)}</span> to pickup once
            dispatched.
          </p>
        )}
        {t.dispatchedAt && <p>Dispatched {formatDateTime(t.dispatchedAt)}.</p>}
        {a.note && <p className="text-slate">Note to provider: {a.note}</p>}
        {a.responseNote && <p className="text-slate">Provider’s note: {a.responseNote}</p>}

        {(withdraw.isError || markDispatched.isError) && (
          <Alert
            tone="critical"
            title={(withdraw.error ?? markDispatched.error)?.message ?? 'Something went wrong.'}
          />
        )}
        <div className="flex flex-wrap gap-2">
          {a.kind === 'EXTERNAL' && t.viewer.canArrange && t.status === 'AMBULANCE_ASSIGNED' && (
            <Button
              size="sm"
              disabled={markDispatched.isPending}
              onClick={() => markDispatched.mutate()}
            >
              It has left for the pickup
            </Button>
          )}
          {canWithdraw && !withdrawing && (
            <Button size="sm" variant="secondary" onClick={() => setWithdrawing(true)}>
              {a.status === 'PROPOSED' ? 'Withdraw offer' : 'Take the trip back'}
            </Button>
          )}
        </div>
        {withdrawing && (
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              withdraw.mutate();
            }}
          >
            <label className="min-w-64 flex-1 text-[13px] font-medium text-ink">
              Why? The provider sees this.
              <Input
                className="mt-1"
                required
                minLength={3}
                placeholder="e.g. No answer after 15 minutes"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
            <Button type="submit" size="sm" variant="secondary" disabled={withdraw.isPending}>
              Withdraw
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setWithdrawing(false)}>
              Keep it
            </Button>
          </form>
        )}
      </CardBody>
    </Card>
  );
}

/** Offer a suggested vehicle, or record transport arranged some other way. */
function Arrange({ transfer }: { transfer: TransferDetail }) {
  const [external, setExternal] = useState(false);
  return (
    <Card className="border-teal-deep shadow-[inset_4px_0_0_var(--color-teal-deep)]">
      <CardHeader
        title={external ? 'Record transport arranged outside Lifeline' : 'Choose an ambulance'}
        description={
          external
            ? 'For 922, a county ambulance not on Lifeline, or other transport.'
            : 'Suitable vehicles, quickest to reach the patient first. The provider confirms before anything is assigned.'
        }
      />
      <CardBody className="space-y-4">
        {external ? (
          <ExternalTransportForm transfer={transfer} onCancel={() => setExternal(false)} />
        ) : (
          <>
            <VehiclePicker transfer={transfer} />
            <button
              type="button"
              className="text-sm text-teal-deep hover:underline"
              onClick={() => setExternal(true)}
            >
              Transport arranged another way (922, county or other)
            </button>
          </>
        )}
      </CardBody>
    </Card>
  );
}

function CancelTransfer({ transfer }: { transfer: TransferDetail }) {
  const invalidate = useTransferInvalidation(transfer);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const cancel = useMutation({
    mutationFn: () => api(`/transfers/${transfer.id}/cancel`, { method: 'POST', body: { reason } }),
    onSuccess: invalidate,
  });
  if (!open) {
    return (
      <button
        type="button"
        className="text-sm text-slate hover:text-ink hover:underline"
        onClick={() => setOpen(true)}
      >
        Cancel transport
      </button>
    );
  }
  return (
    <form
      className="flex max-w-xl flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        cancel.mutate();
      }}
    >
      <label className="min-w-64 flex-1 text-[13px] font-medium text-ink">
        Why is transport no longer needed?
        <Input
          className="mt-1"
          required
          minLength={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </label>
      <Button type="submit" variant="secondary" disabled={cancel.isPending}>
        Cancel transport
      </Button>
      <Button variant="ghost" onClick={() => setOpen(false)}>
        Keep it
      </Button>
      {cancel.isError && <p className="w-full text-xs text-critical">{cancel.error.message}</p>}
    </form>
  );
}

export function assignmentTitle(a: AssignmentView): string {
  if (a.kind === 'EXTERNAL' && a.external) {
    return [
      EXTERNAL_TRANSPORT_LABELS[a.external.service],
      a.external.providerName,
      a.external.vehicleRegistration,
    ]
      .filter(Boolean)
      .join(' · ');
  }
  const vehicle = a.vehicle
    ? `${a.vehicle.registration}${a.vehicle.callSign ? ` (${a.vehicle.callSign})` : ''}`
    : null;
  return [a.provider?.name, vehicle].filter(Boolean).join(' · ');
}

function Item({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? 'sm:col-span-2' : undefined}>
      <dt className="text-[13px] font-medium text-slate">{label}</dt>
      <dd className="mt-0.5 text-ink">{children}</dd>
    </div>
  );
}

function PhoneLink({ phone, label }: { phone: string | null; label?: string }) {
  if (!phone) return null;
  return (
    <a
      href={`tel:${phone}`}
      className="tabular inline-flex items-center gap-1 text-sm text-teal-deep hover:underline"
    >
      <Phone aria-hidden className="size-3.5" />
      {label && <span>{label}:</span>} {phone}
    </a>
  );
}
