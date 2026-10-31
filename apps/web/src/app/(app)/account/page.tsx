'use client';

import { PASSWORD_MIN_LENGTH } from '@lifeline/domain';
import { Alert, Button, Card, CardBody, CardHeader, Field, Input, StatusChip } from '@lifeline/ui';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { PageHeader } from '@/components/app-shell';
import { api, ApiError } from '@/lib/api';
import { useSession } from '@/lib/session';

export default function AccountPage() {
  const { user } = useSession();
  return (
    <>
      <PageHeader title="My account" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Profile"
            description="Contact your administrator to change these details."
          />
          <CardBody>
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-[13px] font-medium text-slate">Name</dt>
                <dd className="text-ink">{user.fullName}</dd>
              </div>
              <div>
                <dt className="text-[13px] font-medium text-slate">Email</dt>
                <dd className="text-ink">{user.email}</dd>
              </div>
              <div>
                <dt className="text-[13px] font-medium text-slate">Two-step verification</dt>
                <dd className="mt-1">
                  <StatusChip tone={user.mfaEnabled ? 'success' : 'neutral'}>
                    {user.mfaEnabled ? 'Set up' : 'Not required for your roles'}
                  </StatusChip>
                </dd>
              </div>
              <div>
                <dt className="text-[13px] font-medium text-slate">Roles</dt>
                <dd>
                  <ul className="mt-1 space-y-1">
                    {user.memberships.map((m) => (
                      <li key={m.id} className="text-ink">
                        {m.roleLabel}{' '}
                        <span className="text-slate">
                          · {m.institution?.name ?? m.network.name}
                        </span>
                      </li>
                    ))}
                  </ul>
                </dd>
              </div>
            </dl>
          </CardBody>
        </Card>
        <ChangePasswordCard />
      </div>
    </>
  );
}

function ChangePasswordCard() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const mismatch = confirm.length > 0 && confirm !== newPassword;

  const change = useMutation({
    mutationFn: () =>
      api('/auth/password/change', { method: 'POST', body: { currentPassword, newPassword } }),
    onSuccess: () => {
      setCurrentPassword('');
      setNewPassword('');
      setConfirm('');
    },
  });
  const fieldErrors = change.error instanceof ApiError ? change.error.fieldErrors : {};

  return (
    <Card>
      <CardHeader
        title="Change password"
        description="You’ll stay signed in here. Other devices will be signed out."
      />
      <CardBody>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!mismatch) change.mutate();
          }}
        >
          {change.isSuccess && <Alert tone="success" title="Password changed" />}
          {change.isError && !Object.keys(fieldErrors).length && (
            <Alert tone="critical" title={change.error.message} />
          )}
          <Field label="Current password" error={fieldErrors.currentPassword}>
            {(p) => (
              <Input
                {...p}
                type="password"
                autoComplete="current-password"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
              />
            )}
          </Field>
          <Field
            label="New password"
            hint={`At least ${PASSWORD_MIN_LENGTH} characters.`}
            error={fieldErrors.newPassword}
          >
            {(p) => (
              <Input
                {...p}
                type="password"
                autoComplete="new-password"
                required
                minLength={PASSWORD_MIN_LENGTH}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            )}
          </Field>
          <Field
            label="Confirm new password"
            error={mismatch ? 'The passwords don’t match.' : undefined}
          >
            {(p) => (
              <Input
                {...p}
                type="password"
                autoComplete="new-password"
                required
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            )}
          </Field>
          <Button type="submit" disabled={change.isPending || mismatch}>
            {change.isPending ? 'Saving…' : 'Change password'}
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}
