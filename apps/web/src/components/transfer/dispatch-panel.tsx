'use client';

import {
  ASSIGNMENT_DECLINE_LABELS,
  ASSIGNMENT_DECLINE_REASONS,
  type AssignmentDeclineReason,
  CAPABILITY_LABELS,
  CREW_QUALIFICATION_LABELS,
  equipmentName,
  meetsCapability,
  VEHICLE_STATUS_LABELS,
} from '@lifeline/domain';
import { type AssignmentView, type TransferDetail, type VehicleView } from '@lifeline/schemas';
import {
  Alert,
  Button,
  Card,
  CardBody,
  CardHeader,
  cn,
  Field,
  Input,
  Loading,
  Select,
} from '@lifeline/ui';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useCrew, useVehicles } from '@/lib/queries';
import { useTransferInvalidation } from './use-transfer-invalidation';

type Mode = 'confirm' | 'decline' | 'reassign' | 'release' | null;

/** The provider's side: confirm with a vehicle and crew, decline, dispatch, change or release. */
export function DispatchPanel({
  transfer: t,
  assignment: a,
}: {
  transfer: TransferDetail;
  assignment: AssignmentView;
}) {
  const invalidate = useTransferInvalidation(t);
  const [mode, setMode] = useState<Mode>(a.status === 'PROPOSED' ? 'confirm' : null);
  const dispatch = useMutation({
    mutationFn: () => api(`/dispatch-assignments/${a.id}/dispatch`, { method: 'POST' }),
    onSuccess: invalidate,
  });

  if (a.status === 'PROPOSED') {
    return (
      <Card className="border-teal-deep shadow-[inset_4px_0_0_var(--color-teal-deep)]">
        <CardHeader
          title="Can you take this transfer?"
          description="Confirming assigns the vehicle and crew, and confirms the vehicle is available now."
        />
        <CardBody className="space-y-4">
          <Toggle
            options={[
              ['confirm', 'Confirm'],
              ['decline', 'Decline'],
            ]}
            value={mode}
            onChange={setMode}
          />
          {mode === 'confirm' && <CrewForm transfer={t} assignment={a} action="confirm" />}
          {mode === 'decline' && <DeclineForm transfer={t} assignment={a} />}
        </CardBody>
      </Card>
    );
  }

  // Once the ambulance has reached the patient, changes go through the crew app.
  const beforePickup = t.status === 'AMBULANCE_ASSIGNED' || t.status === 'DISPATCHED';
  if (!beforePickup) {
    return (
      <Card>
        <CardHeader
          title="Dispatch"
          description="The crew is updating this trip from the crew app. Call them if anything changes."
        />
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader title="Dispatch" description="Your team’s actions on this trip." />
      <CardBody className="space-y-4">
        {dispatch.isError && <Alert tone="critical" title={dispatch.error.message} />}
        <div className="flex flex-wrap gap-2">
          {t.status === 'AMBULANCE_ASSIGNED' && (
            <Button disabled={dispatch.isPending} onClick={() => dispatch.mutate()}>
              Mark as dispatched
            </Button>
          )}
          <Button
            variant="secondary"
            onClick={() => setMode(mode === 'reassign' ? null : 'reassign')}
          >
            Change vehicle or crew
          </Button>
          <Button variant="ghost" onClick={() => setMode(mode === 'release' ? null : 'release')}>
            We can’t do this trip
          </Button>
        </div>
        {mode === 'reassign' && <CrewForm transfer={t} assignment={a} action="reassign" />}
        {mode === 'release' && <ReleaseForm transfer={t} assignment={a} />}
      </CardBody>
    </Card>
  );
}

function Toggle<T extends string>({
  options,
  value,
  onChange,
}: {
  options: [T, string][];
  value: T | null;
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex flex-wrap rounded-sm border border-border-strong bg-surface p-0.5">
      {options.map(([v, label]) => (
        <button
          key={v}
          type="button"
          aria-pressed={value === v}
          onClick={() => onChange(v)}
          className={cn(
            'rounded-[4px] px-3 py-1.5 text-sm font-medium',
            value === v ? 'bg-navy text-white' : 'text-slate hover:text-ink',
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/** Why a vehicle can't take this transfer, or null if it can. Mirrors the server's check. */
function unsuitable(v: VehicleView, t: TransferDetail, currentVehicleId?: string) {
  if (v.recordStatus === 'INACTIVE') return 'Retired';
  if (v.onTransfer && v.id !== currentVehicleId) return 'On another transfer';
  if (v.status === 'OUT_OF_SERVICE') return 'Out of service';
  if (!meetsCapability(v.capability, t.requiredCapability))
    return `${CAPABILITY_LABELS[v.capability]} only`;
  const missing = t.requiredEquipment.filter((c) => !v.equipment.includes(c));
  if (missing.length) return `No ${missing.map(equipmentName).join(', ').toLowerCase()}`;
  return null;
}

function CrewForm({
  transfer: t,
  assignment: a,
  action,
}: {
  transfer: TransferDetail;
  assignment: AssignmentView;
  action: 'confirm' | 'reassign';
}) {
  const invalidate = useTransferInvalidation(t);
  const providerId = a.provider!.id;
  const vehicles = useVehicles(t.networkId, providerId);
  const crew = useCrew(providerId);
  const [vehicleId, setVehicleId] = useState(a.vehicle?.id ?? '');
  const [crewIds, setCrewIds] = useState<string[]>(a.crew.map((c) => c.id));
  const [eta, setEta] = useState('');
  const [note, setNote] = useState('');

  const save = useMutation({
    mutationFn: () =>
      action === 'confirm'
        ? api(`/dispatch-assignments/${a.id}/confirm`, {
            method: 'POST',
            body: {
              vehicleId,
              crewMemberIds: crewIds,
              etaMinutes: eta ? Number(eta) : null,
              note,
            },
          })
        : api(`/dispatch-assignments/${a.id}/reassign`, {
            method: 'POST',
            body: { vehicleId, crewMemberIds: crewIds, reason: note },
          }),
    onSuccess: invalidate,
  });
  const errors = save.error instanceof ApiError ? save.error.fieldErrors : {};

  if (vehicles.isPending || crew.isPending) return <Loading label="Loading your fleet…" />;
  if (vehicles.isError || crew.isError)
    return <Alert tone="critical" title="We couldn’t load your fleet and crew." />;

  const ownCrew = new Set(a.crew.map((c) => c.id));
  const activeCrew = crew.data.crew.filter((c) => c.recordStatus === 'ACTIVE');
  const toggle = (id: string) =>
    setCrewIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      {save.isError && !Object.keys(errors).length && (
        <Alert tone="critical" title={save.error.message} />
      )}
      <Field
        label="Vehicle"
        hint={
          action === 'confirm'
            ? 'The vehicle offered is selected. You can send another suitable one.'
            : undefined
        }
        error={errors.vehicleId}
      >
        {(p) => (
          <Select {...p} required value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
            <option value="" disabled>
              Choose a vehicle
            </option>
            {vehicles.data.map((v) => {
              const problem = unsuitable(
                v,
                t,
                a.status === 'CONFIRMED' ? a.vehicle?.id : undefined,
              );
              return (
                <option key={v.id} value={v.id} disabled={!!problem}>
                  {v.registration}
                  {v.callSign ? ` (${v.callSign})` : ''} · {CAPABILITY_LABELS[v.capability]} ·{' '}
                  {problem ?? VEHICLE_STATUS_LABELS[v.status]}
                </option>
              );
            })}
          </Select>
        )}
      </Field>

      <fieldset>
        <legend className="text-[13px] font-medium text-ink">Crew</legend>
        {activeCrew.length === 0 ? (
          <p className="mt-1 text-sm text-slate">
            No crew members are registered. Your provider administrator adds them under Fleet.
          </p>
        ) : (
          <ul className="mt-1.5 grid gap-1.5 sm:grid-cols-2">
            {activeCrew.map((c) => {
              const busy = c.onTransfer && !ownCrew.has(c.id);
              return (
                <li key={c.id}>
                  <label
                    className={cn(
                      'flex items-center gap-2 rounded-sm border border-border px-3 py-2 text-sm',
                      busy ? 'text-muted' : 'cursor-pointer hover:border-teal-deep',
                    )}
                  >
                    <input
                      type="checkbox"
                      className="size-4 accent-teal-deep"
                      checked={crewIds.includes(c.id)}
                      disabled={busy}
                      onChange={() => toggle(c.id)}
                    />
                    <span>
                      {c.fullName}{' '}
                      <span className="text-xs text-slate">
                        {CREW_QUALIFICATION_LABELS[c.qualification]}
                        {busy && ' · on another transfer'}
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
        {errors.crewMemberIds && (
          <p className="mt-1 text-xs text-critical">{errors.crewMemberIds}</p>
        )}
      </fieldset>

      {action === 'confirm' ? (
        <div className="grid gap-4 md:grid-cols-3">
          <Field
            label="Minutes to pickup"
            optional
            hint="Your estimate once dispatched."
            error={errors.etaMinutes}
          >
            {(p) => (
              <Input
                {...p}
                type="number"
                inputMode="numeric"
                min={1}
                max={600}
                value={eta}
                onChange={(e) => setEta(e.target.value)}
              />
            )}
          </Field>
          <Field
            label="Note to the facility"
            optional
            className="md:col-span-2"
            error={errors.note}
          >
            {(p) => <Input {...p} value={note} onChange={(e) => setNote(e.target.value)} />}
          </Field>
        </div>
      ) : (
        <Field label="Reason for the change" error={errors.reason}>
          {(p) => (
            <Input
              {...p}
              required
              minLength={3}
              placeholder="e.g. Puncture on the way; sending DAS-4"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          )}
        </Field>
      )}

      <Button
        type="submit"
        size="lg"
        disabled={save.isPending || !vehicleId || crewIds.length === 0}
      >
        {action === 'confirm' ? 'Confirm vehicle and crew' : 'Save the change'}
      </Button>
    </form>
  );
}

function DeclineForm({
  transfer,
  assignment,
}: {
  transfer: TransferDetail;
  assignment: AssignmentView;
}) {
  const invalidate = useTransferInvalidation(transfer);
  const [reason, setReason] = useState<AssignmentDeclineReason | ''>('');
  const [note, setNote] = useState('');
  const decline = useMutation({
    mutationFn: () =>
      api(`/dispatch-assignments/${assignment.id}/decline`, {
        method: 'POST',
        body: { reason, note },
      }),
    onSuccess: invalidate,
  });
  const errors = decline.error instanceof ApiError ? decline.error.fieldErrors : {};
  return (
    <form
      className="grid gap-4 md:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        decline.mutate();
      }}
    >
      {decline.isError && !Object.keys(errors).length && (
        <Alert tone="critical" title={decline.error.message} className="md:col-span-2" />
      )}
      <Field label="Reason" error={errors.reason}>
        {(p) => (
          <Select
            {...p}
            required
            value={reason}
            onChange={(e) => setReason(e.target.value as AssignmentDeclineReason)}
          >
            <option value="" disabled>
              Choose a reason
            </option>
            {ASSIGNMENT_DECLINE_REASONS.map((r) => (
              <option key={r} value={r}>
                {ASSIGNMENT_DECLINE_LABELS[r]}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field label="Details" optional={reason !== 'OTHER'} error={errors.note}>
        {(p) => <Input {...p} value={note} onChange={(e) => setNote(e.target.value)} />}
      </Field>
      <div className="md:col-span-2">
        <Button type="submit" variant="secondary" disabled={decline.isPending || !reason}>
          Decline the transfer
        </Button>
      </div>
    </form>
  );
}

function ReleaseForm({
  transfer,
  assignment,
}: {
  transfer: TransferDetail;
  assignment: AssignmentView;
}) {
  const invalidate = useTransferInvalidation(transfer);
  const [reason, setReason] = useState('');
  const release = useMutation({
    mutationFn: () =>
      api(`/dispatch-assignments/${assignment.id}/release`, { method: 'POST', body: { reason } }),
    onSuccess: invalidate,
  });
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        release.mutate();
      }}
    >
      <p className="text-sm text-slate">
        The referring facility is told straight away and chooses another ambulance.
      </p>
      {release.isError && <Alert tone="critical" title={release.error.message} />}
      <Field label="What happened?">
        {(p) => (
          <Input
            {...p}
            required
            minLength={3}
            placeholder="e.g. Vehicle broke down at the depot"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        )}
      </Field>
      <Button type="submit" variant="critical" disabled={release.isPending}>
        Release this trip
      </Button>
    </form>
  );
}
