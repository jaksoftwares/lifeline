'use client';

import {
  FACILITY_LEVELS,
  INSTITUTION_TYPE_LABELS,
  INSTITUTION_TYPES,
  type InstitutionType,
  KENYAN_COUNTIES,
  OWNERSHIP_LABELS,
  OWNERSHIP_TYPES,
} from '@lifeline/domain';
import { type CreateInstitutionInput, type FacilityProfile } from '@lifeline/schemas';
import { Alert, Button, Card, CardBody, CardHeader, Field, Input, Select } from '@lifeline/ui';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useSession } from '@/lib/session';

export function AddInstitutionPanel({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (name: string) => void;
}) {
  const { network } = useSession();
  const [type, setType] = useState<InstitutionType>('FACILITY');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [level, setLevel] = useState('');
  const [county, setCounty] = useState('');
  const [ownership, setOwnership] = useState('');
  const [phone, setPhone] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');

  const create = useMutation({
    mutationFn: (input: CreateInstitutionInput) =>
      api<FacilityProfile>(`/networks/${network.id}/institutions`, { method: 'POST', body: input }),
    onSuccess: (created) => onCreated(created.name),
  });
  const fieldErrors = create.error instanceof ApiError ? create.error.fieldErrors : {};

  return (
    <Card className="mb-6">
      <CardHeader
        title="Add an institution"
        description="Add a facility or ambulance provider to this network. Its administrators can complete the details."
        actions={
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
        }
      />
      <CardBody>
        <form
          className="grid gap-4 md:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate({
              type,
              name,
              code,
              level: type === 'FACILITY' && level ? Number(level) : null,
              county: (county || null) as CreateInstitutionInput['county'],
              ownership: (ownership || null) as CreateInstitutionInput['ownership'],
              phone: phone.trim() || null,
              latitude: latitude ? Number(latitude) : null,
              longitude: longitude ? Number(longitude) : null,
            });
          }}
        >
          {create.isError && !Object.keys(fieldErrors).length && (
            <Alert tone="critical" title={create.error.message} className="md:col-span-2" />
          )}
          <Field label="Type">
            {(p) => (
              <Select
                {...p}
                value={type}
                onChange={(e) => setType(e.target.value as InstitutionType)}
              >
                {INSTITUTION_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {INSTITUTION_TYPE_LABELS[t]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Name" error={fieldErrors.name}>
            {(p) => (
              <Input {...p} required value={name} onChange={(e) => setName(e.target.value)} />
            )}
          </Field>
          <Field
            label="Short code"
            hint="Unique in the network, e.g. KRH-01."
            error={fieldErrors.code}
          >
            {(p) => (
              <Input
                {...p}
                required
                className="font-mono uppercase"
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            )}
          </Field>
          {type === 'FACILITY' && (
            <Field label="Level (KEPH)" error={fieldErrors.level}>
              {(p) => (
                <Select {...p} required value={level} onChange={(e) => setLevel(e.target.value)}>
                  <option value="" disabled>
                    Select a level
                  </option>
                  {FACILITY_LEVELS.map((l) => (
                    <option key={l} value={l}>
                      Level {l}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          )}
          <Field label="County" optional error={fieldErrors.county}>
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
          <Field label="Main phone" optional hint="Format: +254XXXXXXXXX" error={fieldErrors.phone}>
            {(p) => (
              <Input {...p} type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
            )}
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Latitude" optional hint="e.g. -1.2921" error={fieldErrors.latitude}>
              {(p) => (
                <Input
                  {...p}
                  inputMode="decimal"
                  value={latitude}
                  onChange={(e) => setLatitude(e.target.value)}
                />
              )}
            </Field>
            <Field label="Longitude" optional hint="e.g. 36.8219" error={fieldErrors.longitude}>
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
          <div className="md:col-span-2">
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? 'Adding…' : 'Add institution'}
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}
