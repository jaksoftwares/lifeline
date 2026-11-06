'use client';

import { type UserSummary } from '@lifeline/schemas';
import { Alert, Button, Card, EmptyState, Loading, Select, StatusChip } from '@lifeline/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { UserPlus, Users, X } from 'lucide-react';
import { useState } from 'react';
import { PageHeader } from '@/components/app-shell';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { useInstitutions } from '@/lib/queries';
import { useSession } from '@/lib/session';
import { AddUserPanel } from './add-user-panel';

export default function UsersPage() {
  const { network, scopeFor, user: me } = useSession();
  const scope = scopeFor('users:manage');
  const institutions = useInstitutions(network.id);
  const [institutionId, setInstitutionId] = useState('');
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const filterOptions = (institutions.data ?? []).filter(
    (i) => scope === 'ALL' || scope.includes(i.id),
  );

  const users = useQuery({
    queryKey: ['users', network.id, institutionId],
    queryFn: () =>
      api<UserSummary[]>('/users', { query: { networkId: network.id, institutionId } }),
  });

  const action = useMutation({
    mutationFn: (call: { path: string; method: 'POST' | 'DELETE'; done: string }) =>
      api(call.path, { method: call.method }).then(() => call.done),
    onSuccess: (done) => {
      setNotice(done);
      void queryClient.invalidateQueries({ queryKey: ['users', network.id] });
    },
  });

  if (scope !== 'ALL' && scope.length === 0) {
    return <Alert tone="warning" title="You don’t manage users in this network." />;
  }

  return (
    <>
      <PageHeader
        title="Users and roles"
        description="Manage accounts and roles in your facilities."
        actions={
          !adding && (
            <Button onClick={() => setAdding(true)}>
              <UserPlus className="size-4" aria-hidden /> Add user
            </Button>
          )
        }
      />

      {adding && (
        <AddUserPanel
          onClose={() => setAdding(false)}
          onCreated={(message) => {
            setAdding(false);
            setNotice(message);
            void queryClient.invalidateQueries({ queryKey: ['users', network.id] });
          }}
        />
      )}

      {notice && <Alert tone="success" title={notice} className="mb-4" />}
      {action.isError && <Alert tone="critical" title={action.error.message} className="mb-4" />}

      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-3">
          <label htmlFor="institution-filter" className="text-[13px] font-medium text-slate">
            Show
          </label>
          <Select
            id="institution-filter"
            className="h-9 w-auto min-w-56"
            value={institutionId}
            onChange={(e) => setInstitutionId(e.target.value)}
          >
            <option value="">
              {scope === 'ALL' ? 'Everyone in the network' : 'Everyone I manage'}
            </option>
            {filterOptions.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </Select>
        </div>

        {users.isPending && <Loading label="Loading users…" />}
        {users.isError && (
          <div className="p-5">
            <Alert tone="critical" title="We couldn’t load users">
              {users.error.message}
            </Alert>
          </div>
        )}
        {users.data?.length === 0 && <EmptyState icon={Users} title="No users here yet." />}
        {users.data && users.data.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-surface-subtle text-[13px] text-slate">
                <tr>
                  <th scope="col" className="px-5 py-3 font-semibold">
                    Name
                  </th>
                  <th scope="col" className="px-5 py-3 font-semibold">
                    Roles
                  </th>
                  <th scope="col" className="px-5 py-3 font-semibold">
                    Status
                  </th>
                  <th scope="col" className="px-5 py-3 font-semibold">
                    Last sign-in
                  </th>
                  <th scope="col" className="px-5 py-3 font-semibold">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border align-top">
                {users.data.map((u) => (
                  <tr key={u.id}>
                    <td className="px-5 py-3">
                      <p className="font-medium text-ink">{u.fullName}</p>
                      <p className="text-slate">{u.email}</p>
                      {u.phone && <p className="tabular text-slate">{u.phone}</p>}
                    </td>
                    <td className="px-5 py-3">
                      <ul className="space-y-1.5">
                        {u.memberships.map((m) => (
                          <li key={m.id} className="flex items-start gap-1.5">
                            <span>
                              <span className="text-ink">{m.roleLabel}</span>
                              <span className="block text-xs text-slate">
                                {m.institution?.name ?? 'Whole network'}
                              </span>
                            </span>
                            {u.id !== me.id && (
                              <button
                                type="button"
                                className="rounded-sm p-0.5 text-muted hover:bg-critical/10 hover:text-critical"
                                aria-label={`Remove ${m.roleLabel} role from ${u.fullName}`}
                                onClick={() => {
                                  if (
                                    confirm(`Remove the ${m.roleLabel} role from ${u.fullName}?`)
                                  ) {
                                    action.mutate({
                                      path: `/memberships/${m.id}`,
                                      method: 'DELETE',
                                      done: 'Role removed.',
                                    });
                                  }
                                }}
                              >
                                <X className="size-3.5" aria-hidden />
                              </button>
                            )}
                          </li>
                        ))}
                      </ul>
                    </td>
                    <td className="space-y-1.5 px-5 py-3">
                      <StatusChip tone={u.status === 'ACTIVE' ? 'success' : 'neutral'}>
                        {u.status === 'ACTIVE' ? 'Active' : 'Deactivated'}
                      </StatusChip>
                      {u.mfaEnabled && (
                        <div>
                          <StatusChip tone="info">Two-step on</StatusChip>
                        </div>
                      )}
                    </td>
                    <td className="tabular px-5 py-3 text-slate">
                      {formatDateTime(u.lastLoginAt)}
                    </td>
                    <td className="px-5 py-3">
                      {u.id !== me.id && (
                        <div className="flex flex-wrap justify-end gap-2">
                          {u.mfaEnabled && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                if (
                                  confirm(
                                    `Reset two-step verification for ${u.fullName}? They will set it up again at next sign-in.`,
                                  )
                                ) {
                                  action.mutate({
                                    path: `/users/${u.id}/mfa/reset`,
                                    method: 'POST',
                                    done: `Two-step verification reset for ${u.fullName}.`,
                                  });
                                }
                              }}
                            >
                              Reset two-step
                            </Button>
                          )}
                          {u.status === 'ACTIVE' ? (
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => {
                                if (
                                  confirm(
                                    `Deactivate ${u.fullName}? They will be signed out everywhere.`,
                                  )
                                ) {
                                  action.mutate({
                                    path: `/users/${u.id}/deactivate`,
                                    method: 'POST',
                                    done: `${u.fullName} has been deactivated.`,
                                  });
                                }
                              }}
                            >
                              Deactivate
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() =>
                                action.mutate({
                                  path: `/users/${u.id}/reactivate`,
                                  method: 'POST',
                                  done: `${u.fullName} has been reactivated.`,
                                })
                              }
                            >
                              Reactivate
                            </Button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
