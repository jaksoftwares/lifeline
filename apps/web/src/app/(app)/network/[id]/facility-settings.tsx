'use client';

import {
  KENYAN_COUNTIES,
  OWNERSHIP_LABELS,
  OWNERSHIP_TYPES,
  RESOURCE_KIND_LABELS,
  type ResourceKind,
} from '@lifeline/domain';
import {
  type DepartmentView,
  type FacilityDetail,
  type UpdateFacilityProfileInput,
} from '@lifeline/schemas';
import { Alert, Button, Card, CardBody, CardHeader, Field, Input, Select } from '@lifeline/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useCatalogue } from '@/lib/queries';

/** Administrative settings for one institution, shown to its administrators and network administrators. */
export function FacilitySettings({ detail }: { detail: FacilityDetail }) {
  const queryClient = useQueryClient();
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['facility', detail.facility.id] });
    void queryClient.invalidateQueries({ queryKey: ['facility-search'] });
    void queryClient.invalidateQueries({ queryKey: ['institutions'] });
  };

  return (
    <section className="mt-10" aria-labelledby="settings-heading">
      <h2 id="settings-heading" className="mb-4 font-display text-xl font-bold">
        Facility settings
      </h2>
      <div className="grid gap-6 lg:grid-cols-2">
        <ProfileForm detail={detail} onSaved={refresh} />
        {detail.facility.type === 'FACILITY' && (
          <DepartmentsEditor detail={detail} onSaved={refresh} />
        )}
        {detail.facility.type === 'FACILITY' && (
          <CatalogueChoices detail={detail} onSaved={refresh} />
        )}
      </div>
    </section>
  );
}

function ProfileForm({ detail, onSaved }: { detail: FacilityDetail; onSaved: () => void }) {
  const f = detail.facility;
  const [county, setCounty] = useState(f.county ?? '');
  const [ownership, setOwnership] = useState(f.ownership ?? '');
  const [address, setAddress] = useState(f.address ?? '');
  const [phone, setPhone] = useState(f.phone ?? '');
  const [latitude, setLatitude] = useState(f.latitude?.toString() ?? '');
  const [longitude, setLongitude] = useState(f.longitude?.toString() ?? '');

  const save = useMutation({
    mutationFn: (input: UpdateFacilityProfileInput) =>
      api(`/institutions/${f.id}/profile`, { method: 'PATCH', body: input }),
    onSuccess: onSaved,
  });
  const errors = save.error instanceof ApiError ? save.error.fieldErrors : {};

  return (
    <Card>
      <CardHeader
        title="Contact and location"
        description="Location is used to estimate travel times."
      />
      <CardBody>
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate({
              county: (county || null) as UpdateFacilityProfileInput['county'],
              ownership: (ownership || null) as UpdateFacilityProfileInput['ownership'],
              address,
              phone: phone.trim() || null,
              latitude: latitude ? Number(latitude) : null,
              longitude: longitude ? Number(longitude) : null,
            });
          }}
        >
          {save.isSuccess && (
            <Alert tone="success" title="Details saved" className="sm:col-span-2" />
          )}
          {save.isError && !Object.keys(errors).length && (
            <Alert tone="critical" title={save.error.message} className="sm:col-span-2" />
          )}
          <Field label="Main phone" optional hint="Format: +254XXXXXXXXX" error={errors.phone}>
            {(p) => (
              <Input {...p} type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
            )}
          </Field>
          <Field label="County" optional error={errors.county}>
            {(p) => (
              <Select {...p} value={county} onChange={(e) => setCounty(e.target.value)}>
                <option value="">Not set</option>
                {KENYAN_COUNTIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Address" optional className="sm:col-span-2" error={errors.address}>
            {(p) => <Input {...p} value={address} onChange={(e) => setAddress(e.target.value)} />}
          </Field>
          <Field label="Ownership" optional>
            {(p) => (
              <Select {...p} value={ownership} onChange={(e) => setOwnership(e.target.value)}>
                <option value="">Not set</option>
                {OWNERSHIP_TYPES.map((o) => (
                  <option key={o} value={o}>
                    {OWNERSHIP_LABELS[o]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Latitude" optional error={errors.latitude}>
              {(p) => (
                <Input
                  {...p}
                  inputMode="decimal"
                  value={latitude}
                  onChange={(e) => setLatitude(e.target.value)}
                />
              )}
            </Field>
            <Field label="Longitude" optional error={errors.longitude}>
              {(p) => (
                <Input
                  {...p}
                  inputMode="decimal"
                  value={longitude}
                  onChange={(e) => setLongitude(e.target.value)}
                />
              )}
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? 'Saving…' : 'Save details'}
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}

function CatalogueChoices({ detail, onSaved }: { detail: FacilityDetail; onSaved: () => void }) {
  const catalogue = useCatalogue(detail.facility.networkId);
  const [services, setServices] = useState(() => new Set(detail.services.map((s) => s.id)));
  const [resources, setResources] = useState(
    () => new Set(detail.capacity.map((c) => c.resource.id)),
  );

  const save = useMutation({
    mutationFn: async () => {
      await api(`/institutions/${detail.facility.id}/services`, {
        method: 'PUT',
        body: { serviceIds: [...services] },
      });
      await api(`/institutions/${detail.facility.id}/resources`, {
        method: 'PUT',
        body: { resourceIds: [...resources] },
      });
    },
    onSuccess: onSaved,
  });

  const toggle = (set: Set<string>, update: (s: Set<string>) => void, id: string) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    update(next);
  };

  if (!catalogue.data) return null;
  const kinds: ResourceKind[] = ['BED', 'EQUIPMENT', 'SPECIALIST'];

  return (
    <Card className="lg:col-span-2">
      <CardHeader
        title="Services and capacity items"
        description="Services decide which searches find this facility. Capacity items are what staff report on the Capacity page."
      />
      <CardBody>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
          className="space-y-5"
        >
          {save.isSuccess && <Alert tone="success" title="Services and capacity items saved" />}
          {save.isError && <Alert tone="critical" title={save.error.message} />}
          <div className="grid gap-6 md:grid-cols-2">
            <fieldset>
              <legend className="mb-2 text-sm font-semibold text-navy">Services offered</legend>
              <div className="space-y-1.5">
                {catalogue.data.services.map((s) => (
                  <label key={s.id} className="flex items-center gap-2 text-sm text-ink">
                    <input
                      type="checkbox"
                      className="size-4 accent-teal-deep"
                      checked={services.has(s.id)}
                      onChange={() => toggle(services, setServices, s.id)}
                    />
                    {s.name}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="space-y-4">
              {kinds.map((kind) => (
                <fieldset key={kind}>
                  <legend className="mb-2 text-sm font-semibold text-navy">
                    {RESOURCE_KIND_LABELS[kind]}
                  </legend>
                  <div className="space-y-1.5">
                    {catalogue.data.resources
                      .filter((r) => r.kind === kind)
                      .map((r) => (
                        <label key={r.id} className="flex items-center gap-2 text-sm text-ink">
                          <input
                            type="checkbox"
                            className="size-4 accent-teal-deep"
                            checked={resources.has(r.id)}
                            onChange={() => toggle(resources, setResources, r.id)}
                          />
                          {r.name}
                        </label>
                      ))}
                  </div>
                </fieldset>
              ))}
            </div>
          </div>
          <p className="text-xs text-slate">
            Removing a capacity item keeps its past reports in the history.
          </p>
          <Button type="submit" disabled={save.isPending}>
            {save.isPending ? 'Saving…' : 'Save services and items'}
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}

function DepartmentsEditor({ detail, onSaved }: { detail: FacilityDetail; onSaved: () => void }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');

  const add = useMutation({
    mutationFn: () =>
      api<DepartmentView>(`/institutions/${detail.facility.id}/departments`, {
        method: 'POST',
        body: { name, phone: phone.trim() || null },
      }),
    onSuccess: () => {
      setName('');
      setPhone('');
      onSaved();
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/departments/${id}`, { method: 'DELETE' }),
    onSuccess: onSaved,
  });
  const errors = add.error instanceof ApiError ? add.error.fieldErrors : {};

  return (
    <Card>
      <CardHeader title="Departments" description="Direct lines that referring teams can call." />
      <CardBody className="space-y-4">
        {remove.isError && <Alert tone="critical" title={remove.error.message} />}
        {detail.departments.length > 0 && (
          <ul className="divide-y divide-border rounded-md border border-border">
            {detail.departments.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <span>
                  <span className="text-ink">{d.name}</span>
                  {d.phone && <span className="tabular ml-2 text-slate">{d.phone}</span>}
                </span>
                <button
                  type="button"
                  className="rounded-sm p-1 text-muted hover:bg-critical/10 hover:text-critical"
                  aria-label={`Remove ${d.name}`}
                  onClick={() => {
                    if (confirm(`Remove ${d.name}?`)) remove.mutate(d.id);
                  }}
                >
                  <Trash2 aria-hidden className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <form
          className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            add.mutate();
          }}
        >
          <Field label="Department" error={errors.name}>
            {(p) => (
              <Input {...p} required value={name} onChange={(e) => setName(e.target.value)} />
            )}
          </Field>
          <Field label="Phone" optional error={errors.phone}>
            {(p) => (
              <Input {...p} type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
            )}
          </Field>
          <Button type="submit" variant="secondary" disabled={add.isPending}>
            Add
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}
