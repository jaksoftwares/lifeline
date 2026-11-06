import { addPerson, removePerson } from '@/app/(app)/settings/actions';
import type { Profile, Role } from '@/lib/types';
import { ConfirmAction } from './confirm-action';
import { ActionForm } from './form';
import { Badge, Field, Input, Select } from './ui';

const ROLE_LABEL: Record<Role, string> = { admin: 'Admin', staff: 'Staff', driver: 'Driver' };

/** List of people with a remove button for admins. */
export function PeopleList({
  people,
  currentUserId,
  canManage,
}: {
  people: Profile[];
  currentUserId: string;
  canManage: boolean;
}) {
  if (!people.length) return <p className="py-4 text-sm text-slate-500">No one added yet.</p>;
  return (
    <ul className="divide-y divide-slate-100">
      {people.map((p) => (
        <li key={p.id} className="flex items-start justify-between gap-3 py-3">
          <div className="min-w-0">
            <p className="font-medium">
              {p.full_name}{' '}
              {p.id === currentUserId && <span className="text-slate-400">(you)</span>}
            </p>
            <p className="text-sm text-slate-500">
              {[p.phone, p.license_number && `Licence ${p.license_number}`]
                .filter(Boolean)
                .map((item, i) => (
                  <span key={i} className="whitespace-nowrap">
                    {i > 0 && ' · '}
                    {item}
                  </span>
                ))}
              {!p.phone && !p.license_number && '—'}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            {p.role !== 'driver' && (
              <Badge tone={p.role === 'admin' ? 'brand' : 'neutral'}>{ROLE_LABEL[p.role]}</Badge>
            )}
            {canManage && p.id !== currentUserId && (
              <ConfirmAction
                action={removePerson.bind(null, p.id)}
                label="Remove"
                confirm={`Remove ${p.full_name}? They will no longer be able to sign in.`}
              />
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Form for an admin to add a person with a temporary password. */
export function AddPersonForm({ roles }: { roles: Role[] }) {
  const driverOnly = roles.length === 1 && roles[0] === 'driver';
  return (
    <ActionForm action={addPerson} submit={driverOnly ? 'Add driver' : 'Add person'} resetOnSuccess>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Full name">
          <Input name="full_name" required />
        </Field>
        <Field label="Phone">
          <Input name="phone" type="tel" />
        </Field>
        <Field label="Email">
          <Input name="email" type="email" required />
        </Field>
        <Field label="Temporary password" hint="At least 8 characters">
          <Input name="password" type="text" minLength={8} required autoComplete="off" />
        </Field>
        {driverOnly ? (
          <>
            <input type="hidden" name="role" value="driver" />
            <Field label="Driving licence number">
              <Input name="license_number" required />
            </Field>
          </>
        ) : (
          <Field label="Role">
            <Select name="role" defaultValue="staff">
              {roles.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </Select>
          </Field>
        )}
      </div>
    </ActionForm>
  );
}
