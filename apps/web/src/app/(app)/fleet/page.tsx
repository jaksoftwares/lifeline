'use client';

import {
  CAPABILITY_LABELS,
  CAPABILITY_LEVELS,
  type CapabilityLevel,
  CREW_QUALIFICATION_LABELS,
  CREW_QUALIFICATIONS,
  type CrewQualification,
  equipmentName,
  type Permission,
  VEHICLE_EQUIPMENT,
  VEHICLE_STATUS_LABELS,
  VEHICLE_STATUSES,
  type VehicleStatus,
} from '@lifeline/domain';
import { type VehicleView } from '@lifeline/schemas';
import {
  Alert,
  Button,
  Card,
  CardBody,
  CardHeader,
  cn,
  EmptyState,
  Field,
  Input,
  Loading,
  Select,
} from '@lifeline/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Ambulance, Plus } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { PageHeader } from '@/components/app-shell';
import { CapabilityTag, VehicleStatusChip } from '@/components/transport-chips';
import { api, ApiError } from '@/lib/api';
import { formatAgo } from '@/lib/format';
import { useCrew, useInstitutions, useVehicles } from '@/lib/queries';
import { useSession } from '@/lib/session';

export default function FleetPage() {
  const { network, scopeFor } = useSession();
  const institutions = useInstitutions(network.id);
  const viewScope = scopeFor('fleet:view');
  const dispatchScope = scopeFor('dispatch:assign');
  const seesAll = viewScope === 'ALL' || dispatchScope === 'ALL';
  const ownIds = new Set([
    ...(viewScope === 'ALL' ? [] : viewScope),
    ...(dispatchScope === 'ALL' ? [] : dispatchScope),
  ]);
  const providers = (institutions.data ?? []).filter(
    (i) => i.type === 'AMBULANCE_PROVIDER' && (seesAll || ownIds.has(i.id)),
  );
  const [chosen, setChosen] = useState('');
  const providerId = chosen || (seesAll ? '' : (providers[0]?.id ?? ''));
  const vehicles = useVehicles(network.id, providerId || undefined);

  /** True when the viewer holds the permission at this provider. */
  const at = (permission: Permission, id: string) => {
    const scope = scopeFor(permission);
    return scope === 'ALL' || scope.includes(id);
  };

  return (
    <>
      <PageHeader
        title="Fleet"
        description="Ambulances, their availability and their crews. Confirm availability at the start of every shift so vehicles keep being suggested."
        actions={
          (seesAll || providers.length > 1) && (
            <Select
              aria-label="Provider"
              className="w-72"
              value={providerId}
              onChange={(e) => setChosen(e.target.value)}
            >
              {seesAll && <option value="">All providers</option>}
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          )
        }
      />

      <div className="space-y-6">
        {providerId && at('fleet:manage', providerId) && <AddVehicle providerId={providerId} />}

        {vehicles.isPending && <Loading label="Loading vehicles…" />}
        {vehicles.isError && <Alert tone="critical" title={vehicles.error.message} />}
        {vehicles.data?.length === 0 && (
          <Card>
            <EmptyState icon={Ambulance} title="No vehicles registered yet." />
          </Card>
        )}
        {vehicles.data && vehicles.data.length > 0 && (
          <ul className="space-y-2">
            {vehicles.data.map((v) => (
              <VehicleRow
                key={v.id}
                vehicle={v}
                showProvider={!providerId}
                canSetStatus={
                  at('dispatch:assign', v.provider.id) || at('fleet:manage', v.provider.id)
                }
                canManage={at('fleet:manage', v.provider.id)}
              />
            ))}
          </ul>
        )}

        {providerId && <Crew providerId={providerId} canManage={at('fleet:manage', providerId)} />}
      </div>
    </>
  );
}

function useFleetInvalidation() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ['vehicles'] });
    void queryClient.invalidateQueries({ queryKey: ['crew'] });
    void queryClient.invalidateQueries({ queryKey: ['transfer-suggestions'] });
  };
}

function VehicleRow({
  vehicle: v,
  showProvider,
  canSetStatus,
  canManage,
}: {
  vehicle: VehicleView;
  showProvider: boolean;
  canSetStatus: boolean;
  canManage: boolean;
}) {
  const invalidate = useFleetInvalidation();
  const [status, setStatus] = useState<VehicleStatus>(v.status);
  const [note, setNote] = useState(v.statusNote ?? '');
  const [editing, setEditing] = useState(false);
  const update = useMutation({
    mutationFn: (body: { status: VehicleStatus; note: string }) =>
      api(`/vehicles/${v.id}/status`, { method: 'POST', body }),
    onSuccess: invalidate,
  });
  const retire = useMutation({
    mutationFn: () =>
      api(`/vehicles/${v.id}`, {
        method: 'PATCH',
        body: { recordStatus: v.recordStatus === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' },
      }),
    onSuccess: invalidate,
  });
  const retired = v.recordStatus === 'INACTIVE';

  return (
    <li className={cn('rounded-md border border-border bg-surface p-4', retired && 'opacity-70')}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1.5">
          <p className="font-medium text-ink">
            {v.registration}
            {v.callSign && <span className="font-normal text-slate"> ({v.callSign})</span>}
            {showProvider && (
              <span className="ml-2 text-sm font-normal text-slate">{v.provider.name}</span>
            )}
          </p>
          <p className="flex flex-wrap items-center gap-1.5">
            <CapabilityTag level={v.capability} />
            {v.equipment.map((code) => (
              <span
                key={code}
                className="rounded-pill border border-border px-2 py-0.5 text-xs text-slate"
              >
                {equipmentName(code)}
              </span>
            ))}
          </p>
          <p className={cn('text-xs', v.stale && !retired ? 'font-medium text-ink' : 'text-slate')}>
            {v.statusUpdatedAt
              ? `${VEHICLE_STATUS_LABELS[v.status]} confirmed ${formatAgo(v.statusUpdatedAt)}${v.statusUpdatedBy ? ` by ${v.statusUpdatedBy.fullName}` : ''}`
              : 'Availability never confirmed'}
            {v.stale && !retired && ' · out of date, so not suggested'}
            {v.statusNote && ` · ${v.statusNote}`}
          </p>
          {v.base?.name && <p className="text-xs text-slate">Based at {v.base.name}</p>}
          {v.onTransfer && (
            <Link
              href={`/transfers/${v.onTransfer.id}`}
              className="text-sm text-teal-deep hover:underline"
            >
              On transfer {v.onTransfer.reference}
            </Link>
          )}
        </div>
        <div className="flex flex-col items-end gap-2">
          {retired ? (
            <span className="text-sm text-slate">Retired</span>
          ) : (
            <VehicleStatusChip status={v.status} onTransfer={!!v.onTransfer} stale={v.stale} />
          )}
          {canSetStatus && !retired && v.status === 'AVAILABLE' && (
            <Button
              size="sm"
              variant={v.stale ? 'primary' : 'secondary'}
              disabled={update.isPending}
              onClick={() => update.mutate({ status: 'AVAILABLE', note })}
            >
              Confirm still available
            </Button>
          )}
        </div>
      </div>

      {canSetStatus && !retired && (
        <form
          className="mt-3 flex flex-wrap items-end gap-2 border-t border-border pt-3"
          onSubmit={(e) => {
            e.preventDefault();
            update.mutate({ status, note });
          }}
        >
          <label className="text-[13px] font-medium text-ink">
            Availability
            <Select
              className="mt-1 h-9 w-44"
              value={status}
              onChange={(e) => setStatus(e.target.value as VehicleStatus)}
            >
              {VEHICLE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {VEHICLE_STATUS_LABELS[s]}
                </option>
              ))}
            </Select>
          </label>
          <label className="min-w-48 flex-1 text-[13px] font-medium text-ink">
            Note <span className="font-normal text-muted">(optional)</span>
            <Input
              className="mt-1 h-9"
              placeholder="e.g. Tyre change, back at 14:00"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
          <Button type="submit" size="sm" variant="secondary" disabled={update.isPending}>
            Update
          </Button>
          {update.isError && <p className="w-full text-xs text-critical">{update.error.message}</p>}
        </form>
      )}

      {canManage && (
        <div className="mt-3 flex flex-wrap gap-3 text-sm">
          {!retired && (
            <button
              type="button"
              className="text-teal-deep hover:underline"
              onClick={() => setEditing(!editing)}
            >
              {editing ? 'Close' : 'Edit details'}
            </button>
          )}
          <button
            type="button"
            className="text-slate hover:text-ink hover:underline"
            disabled={retire.isPending}
            onClick={() => retire.mutate()}
          >
            {retired ? 'Return to service' : 'Retire from the fleet'}
          </button>
          {retire.isError && <p className="w-full text-xs text-critical">{retire.error.message}</p>}
        </div>
      )}
      {editing && (
        <div className="mt-3 border-t border-border pt-3">
          <VehicleForm vehicle={v} onDone={() => setEditing(false)} />
        </div>
      )}
    </li>
  );
}

function AddVehicle({ providerId }: { providerId: string }) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <Plus aria-hidden className="size-4" /> Register a vehicle
      </Button>
    );
  }
  return (
    <Card>
      <CardHeader
        title="Register a vehicle"
        description="New vehicles stay off duty until a dispatcher marks them available."
      />
      <CardBody>
        <VehicleForm providerId={providerId} onDone={() => setOpen(false)} />
      </CardBody>
    </Card>
  );
}

function VehicleForm({
  vehicle,
  providerId,
  onDone,
}: {
  vehicle?: VehicleView;
  providerId?: string;
  onDone: () => void;
}) {
  const invalidate = useFleetInvalidation();
  const [registration, setRegistration] = useState(vehicle?.registration ?? '');
  const [callSign, setCallSign] = useState(vehicle?.callSign ?? '');
  const [capability, setCapability] = useState<CapabilityLevel>(vehicle?.capability ?? 'BLS');
  const [equipment, setEquipment] = useState<string[]>(vehicle?.equipment ?? []);
  const [baseName, setBaseName] = useState(vehicle?.base?.name ?? '');

  const save = useMutation({
    mutationFn: () => {
      const body = { registration, callSign, capability, equipment, baseName };
      return vehicle
        ? api(`/vehicles/${vehicle.id}`, { method: 'PATCH', body })
        : api(`/institutions/${providerId}/vehicles`, { method: 'POST', body });
    },
    onSuccess: () => {
      invalidate();
      onDone();
    },
  });
  const errors = save.error instanceof ApiError ? save.error.fieldErrors : {};
  const toggle = (code: string) =>
    setEquipment((list) =>
      list.includes(code) ? list.filter((c) => c !== code) : [...list, code],
    );

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
      <div className="grid gap-4 md:grid-cols-2">
        <Field
          label="Registration"
          hint="As on the number plate, e.g. KDA 101A"
          error={errors.registration}
        >
          {(p) => (
            <Input
              {...p}
              required
              value={registration}
              onChange={(e) => setRegistration(e.target.value)}
            />
          )}
        </Field>
        <Field label="Call sign" optional error={errors.callSign}>
          {(p) => <Input {...p} value={callSign} onChange={(e) => setCallSign(e.target.value)} />}
        </Field>
        <Field label="Level of care" error={errors.capability}>
          {(p) => (
            <Select
              {...p}
              value={capability}
              onChange={(e) => setCapability(e.target.value as CapabilityLevel)}
            >
              {CAPABILITY_LEVELS.map((c) => (
                <option key={c} value={c}>
                  {CAPABILITY_LABELS[c]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field
          label="Base"
          optional
          hint="Station or garage name. Distances are measured from your address."
          error={errors.baseName}
        >
          {(p) => <Input {...p} value={baseName} onChange={(e) => setBaseName(e.target.value)} />}
        </Field>
      </div>
      <fieldset>
        <legend className="text-[13px] font-medium text-ink">Equipment carried</legend>
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
      <div className="flex gap-2">
        <Button type="submit" disabled={save.isPending}>
          {vehicle ? 'Save changes' : 'Register vehicle'}
        </Button>
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function Crew({ providerId, canManage }: { providerId: string; canManage: boolean }) {
  const crew = useCrew(providerId);
  const invalidate = useFleetInvalidation();
  const [fullName, setFullName] = useState('');
  const [qualification, setQualification] = useState<CrewQualification>('EMT');
  const [phone, setPhone] = useState('');
  const [userId, setUserId] = useState('');
  const add = useMutation({
    mutationFn: () =>
      api(`/institutions/${providerId}/crew`, {
        method: 'POST',
        body: { fullName, qualification, phone, userId: userId || null },
      }),
    onSuccess: () => {
      setFullName('');
      setPhone('');
      setUserId('');
      invalidate();
    },
  });
  const toggle = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      api(`/crew/${id}`, {
        method: 'PATCH',
        body: { recordStatus: active ? 'INACTIVE' : 'ACTIVE' },
      }),
    onSuccess: invalidate,
  });
  const errors = add.error instanceof ApiError ? add.error.fieldErrors : {};

  return (
    <Card>
      <CardHeader
        title="Crew"
        description="People who staff your ambulances. Dispatchers choose the crew for each trip."
      />
      <CardBody className="space-y-4">
        {crew.isPending && <Loading label="Loading crew…" />}
        {crew.isError && <Alert tone="critical" title={crew.error.message} />}
        {crew.data && (
          <ul className="divide-y divide-border">
            {crew.data.crew.map((c) => (
              <li
                key={c.id}
                className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
              >
                <span className={cn(c.recordStatus === 'INACTIVE' && 'text-muted')}>
                  <span className="font-medium text-ink">{c.fullName}</span>{' '}
                  <span className="text-slate">
                    {CREW_QUALIFICATION_LABELS[c.qualification]}
                    {c.phone && ` · ${c.phone}`}
                    {c.account ? ` · uses the crew app (${c.account.email})` : ''}
                    {c.recordStatus === 'INACTIVE' && ' · inactive'}
                  </span>
                </span>
                <span className="flex items-center gap-3">
                  {c.onTransfer && (
                    <span className="text-xs font-medium text-ink">On a transfer</span>
                  )}
                  {canManage && (
                    <button
                      type="button"
                      className="text-xs text-slate hover:text-ink hover:underline"
                      onClick={() =>
                        toggle.mutate({ id: c.id, active: c.recordStatus === 'ACTIVE' })
                      }
                    >
                      {c.recordStatus === 'ACTIVE' ? 'Mark inactive' : 'Mark active'}
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}

        {canManage && (
          <form
            className="grid gap-3 border-t border-border pt-4 md:grid-cols-4"
            onSubmit={(e) => {
              e.preventDefault();
              add.mutate();
            }}
          >
            {add.isError && !Object.keys(errors).length && (
              <Alert tone="critical" title={add.error.message} className="md:col-span-4" />
            )}
            <Field label="Full name" error={errors.fullName}>
              {(p) => (
                <Input
                  {...p}
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                />
              )}
            </Field>
            <Field label="Qualification">
              {(p) => (
                <Select
                  {...p}
                  value={qualification}
                  onChange={(e) => setQualification(e.target.value as CrewQualification)}
                >
                  {CREW_QUALIFICATIONS.map((q) => (
                    <option key={q} value={q}>
                      {CREW_QUALIFICATION_LABELS[q]}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Phone" optional error={errors.phone}>
              {(p) => (
                <Input
                  {...p}
                  type="tel"
                  placeholder="+254…"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              )}
            </Field>
            <Field label="Crew app account" optional>
              {(p) => (
                <Select {...p} value={userId} onChange={(e) => setUserId(e.target.value)}>
                  <option value="">None</option>
                  {(crew.data?.unlinkedAccounts ?? []).map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.fullName}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <div className="md:col-span-4">
              <Button type="submit" variant="secondary" disabled={add.isPending}>
                Add crew member
              </Button>
            </div>
          </form>
        )}
      </CardBody>
    </Card>
  );
}
