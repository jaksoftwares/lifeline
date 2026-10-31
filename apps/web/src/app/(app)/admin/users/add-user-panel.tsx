'use client';

import {
  INSTITUTION_TYPE_LABELS,
  PASSWORD_MIN_LENGTH,
  type Role,
  ROLE_DEFINITIONS,
  ROLES,
  roleFitsInstitution,
} from '@lifeline/domain';
import { type CreateUserInput } from '@lifeline/schemas';
import { Alert, Button, Card, CardBody, CardHeader, Field, Input, Select } from '@lifeline/ui';
import { useMutation } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { generateTemporaryPassword } from '@/lib/format';
import { useInstitutions } from '@/lib/queries';
import { useSession } from '@/lib/session';

const NETWORK_PLACE = 'network';

export function AddUserPanel({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (message: string) => void;
}) {
  const { network, scopeFor } = useSession();
  const scope = scopeFor('users:manage');
  const institutions = useInstitutions(network.id);

  const places = useMemo(() => {
    const list = (institutions.data ?? [])
      .filter((i) => scope === 'ALL' || scope.includes(i.id))
      .map((i) => ({ value: i.id, label: i.name, type: i.type }));
    return scope === 'ALL'
      ? [
          { value: NETWORK_PLACE, label: `${network.name} (network-wide roles)`, type: null },
          ...list,
        ]
      : list;
  }, [institutions.data, scope, network.name]);

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [place, setPlace] = useState('');
  const [role, setRole] = useState<Role | ''>('');
  const [temporaryPassword, setTemporaryPassword] = useState(generateTemporaryPassword);

  const selectedPlace = places.find((p) => p.value === place);
  const roles = selectedPlace
    ? ROLES.filter((r) => roleFitsInstitution(r, selectedPlace.type))
    : [];

  const create = useMutation({
    mutationFn: (input: CreateUserInput) => api('/users', { method: 'POST', body: input }),
    onSuccess: () =>
      onCreated(
        `${fullName} has been added. Share the temporary password ${temporaryPassword} with them in person or by phone; they will choose their own at first sign-in.`,
      ),
  });
  const fieldErrors = create.error instanceof ApiError ? create.error.fieldErrors : {};

  return (
    <Card className="mb-6">
      <CardHeader
        title="Add a user"
        description="They’ll sign in with a temporary password and choose their own."
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
            if (!role || !selectedPlace) return;
            create.mutate({
              fullName,
              email,
              phone: phone.trim() || undefined,
              temporaryPassword,
              membership: {
                networkId: network.id,
                institutionId: selectedPlace.value === NETWORK_PLACE ? null : selectedPlace.value,
                role,
              },
            });
          }}
        >
          {create.isError && !Object.keys(fieldErrors).length && (
            <Alert tone="critical" title={create.error.message} className="md:col-span-2" />
          )}
          <Field label="Full name" error={fieldErrors.fullName}>
            {(p) => (
              <Input
                {...p}
                required
                autoComplete="off"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
              />
            )}
          </Field>
          <Field label="Work email" error={fieldErrors.email}>
            {(p) => (
              <Input
                {...p}
                type="email"
                required
                autoComplete="off"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            )}
          </Field>
          <Field
            label="Mobile number"
            optional
            hint="Format: +2547XXXXXXXX. Used for urgent alerts in later phases."
            error={fieldErrors.phone}
          >
            {(p) => (
              <Input
                {...p}
                type="tel"
                inputMode="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            )}
          </Field>
          <Field label="Where they work" error={fieldErrors['membership.institutionId']}>
            {(p) => (
              <Select
                {...p}
                required
                value={place}
                onChange={(e) => {
                  setPlace(e.target.value);
                  setRole('');
                }}
              >
                <option value="" disabled>
                  Select a facility or provider
                </option>
                {places.map((pl) => (
                  <option key={pl.value} value={pl.value}>
                    {pl.label}
                    {pl.type ? ` — ${INSTITUTION_TYPE_LABELS[pl.type]}` : ''}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field
            label="Role"
            hint={
              role && ROLE_DEFINITIONS[role].requiresMfa
                ? 'This role requires two-step verification.'
                : undefined
            }
            error={fieldErrors['membership.role']}
          >
            {(p) => (
              <Select
                {...p}
                required
                disabled={!selectedPlace}
                value={role}
                onChange={(e) => setRole(e.target.value as Role)}
              >
                <option value="" disabled>
                  {selectedPlace ? 'Select a role' : 'Choose where they work first'}
                </option>
                {roles.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_DEFINITIONS[r].label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field
            label="Temporary password"
            hint={`At least ${PASSWORD_MIN_LENGTH} characters. Share it privately; it works only until they choose their own.`}
            error={fieldErrors.temporaryPassword}
          >
            {(p) => (
              <div className="flex gap-2">
                <Input
                  {...p}
                  required
                  minLength={PASSWORD_MIN_LENGTH}
                  className="font-mono"
                  value={temporaryPassword}
                  onChange={(e) => setTemporaryPassword(e.target.value)}
                />
                <Button
                  variant="secondary"
                  onClick={() => setTemporaryPassword(generateTemporaryPassword())}
                >
                  Generate
                </Button>
              </div>
            )}
          </Field>
          <div className="md:col-span-2">
            <Button type="submit" disabled={create.isPending || !role}>
              {create.isPending ? 'Adding…' : 'Add user'}
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}
