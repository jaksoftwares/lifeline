'use client';

import { type NotificationSettings, type NotificationView } from '@lifeline/schemas';
import { Alert, Button, Card, EmptyState, Loading } from '@lifeline/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, Check, Mail } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { PageHeader } from '@/components/app-shell';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { useSession } from '@/lib/session';

const CHANNEL_LABELS = {
  IN_APP: 'In-app',
  SMS: 'SMS',
  PUSH: 'Push',
  EMAIL: 'Email',
} as const;

export default function NotificationsPage() {
  const { network, can } = useSession();
  const queryClient = useQueryClient();
  const [unreadOnly, setUnreadOnly] = useState(false);
  const notifications = useQuery({
    queryKey: ['notifications', network.id, unreadOnly],
    queryFn: () =>
      api<NotificationView[]>('/notifications', {
        query: { networkId: network.id, unreadOnly: String(unreadOnly) },
      }),
    refetchInterval: 30_000,
  });
  const settings = useQuery({
    queryKey: ['notification-settings', network.id],
    queryFn: () =>
      api<NotificationSettings>('/notifications/settings', { query: { networkId: network.id } }),
    enabled: can('network:configure'),
  });
  const markRead = useMutation({
    mutationFn: (id: string) => api(`/notifications/${id}/read`, { method: 'POST' }),
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: ['notifications', network.id] }),
  });
  const markAllRead = useMutation({
    mutationFn: () =>
      api('/notifications/read-all', { method: 'POST', query: { networkId: network.id } }),
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: ['notifications', network.id] }),
  });
  const updateSettings = useMutation({
    mutationFn: (referralEscalationMinutes: number) =>
      api<NotificationSettings>('/notifications/settings', {
        method: 'PUT',
        body: { networkId: network.id, referralEscalationMinutes },
      }),
    onSuccess: (value) => {
      queryClient.setQueryData(['notification-settings', network.id], value);
    },
  });

  return (
    <>
      <PageHeader
        title="Notifications"
        description="Updates for your active roles."
        actions={
          notifications.data?.some((notification) => !notification.readAt) && (
            <Button
              variant="secondary"
              onClick={() => markAllRead.mutate()}
              disabled={markAllRead.isPending}
            >
              <Check className="size-4" aria-hidden /> Mark all read
            </Button>
          )
        }
      />

      {(markRead.isError || markAllRead.isError || updateSettings.isError) && (
        <Alert tone="critical" title="The action could not be completed" className="mb-4">
          {markRead.error?.message ?? markAllRead.error?.message ?? updateSettings.error?.message}
        </Alert>
      )}
      {updateSettings.isSuccess && (
        <Alert tone="success" title="Escalation setting saved." className="mb-4" />
      )}

      {can('network:configure') && (
        <EscalationSettings
          settings={settings.data}
          isPending={settings.isPending}
          isError={settings.isError}
          error={settings.error?.message}
          isSaving={updateSettings.isPending}
          onSave={(minutes) => updateSettings.mutate(minutes)}
        />
      )}

      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-sm text-slate">Most recent 100 notifications</p>
        <label className="flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            className="size-4 accent-teal-deep"
            checked={unreadOnly}
            onChange={(event) => setUnreadOnly(event.target.checked)}
          />
          Unread only
        </label>
      </div>

      {notifications.isPending && <Loading label="Loading notifications…" />}
      {notifications.isError && (
        <Alert tone="critical" title="We couldn’t load notifications">
          {notifications.error.message}
        </Alert>
      )}
      {notifications.data?.length === 0 && (
        <Card>
          <EmptyState
            icon={Bell}
            title={unreadOnly ? 'No unread notifications.' : 'No notifications yet.'}
          />
        </Card>
      )}
      {notifications.data && notifications.data.length > 0 && (
        <ul className="space-y-3">
          {notifications.data.map((notification) => (
            <li key={notification.id}>
              <Card className={notification.readAt ? '' : 'border-teal-deep/60'}>
                <div className="flex flex-wrap items-start justify-between gap-4 p-5">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-ink">{notification.title}</p>
                    <p className="mt-1 text-sm text-slate">{notification.message}</p>
                    <p className="mt-2 text-xs text-muted">
                      {formatDateTime(notification.createdAt)}
                    </p>
                    <ul className="mt-3 flex flex-wrap gap-2 text-xs">
                      {notification.deliveries.map((delivery) => (
                        <li
                          key={delivery.channel}
                          className="rounded-sm bg-surface-subtle px-2 py-1 text-slate"
                        >
                          {CHANNEL_LABELS[delivery.channel]}:{' '}
                          {delivery.status === 'SENT' && delivery.channel === 'EMAIL'
                            ? 'accepted by Postmark'
                            : delivery.status.toLowerCase()}
                        </li>
                      ))}
                    </ul>
                    <Link
                      href={
                        notification.entityType === 'transfer'
                          ? `/transfers/${notification.entityId}`
                          : `/referrals/${notification.entityId}`
                      }
                      className="mt-3 inline-block text-sm font-medium text-teal-deep underline"
                    >
                      Open related record
                    </Link>
                  </div>
                  {!notification.readAt && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => markRead.mutate(notification.id)}
                      disabled={markRead.isPending}
                    >
                      <Mail className="size-4" aria-hidden /> Mark read
                    </Button>
                  )}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function EscalationSettings({
  settings,
  isPending,
  isError,
  error,
  isSaving,
  onSave,
}: {
  settings: NotificationSettings | undefined;
  isPending: boolean;
  isError: boolean;
  error: string | undefined;
  isSaving: boolean;
  onSave: (minutes: number) => void;
}) {
  const [minutes, setMinutes] = useState<number | null>(null);
  const currentValue = minutes ?? settings?.referralEscalationMinutes ?? 15;

  return (
    <Card className="mb-6 p-5">
      <h2 className="font-semibold text-ink">Referral escalation</h2>
      <p className="mt-1 text-sm text-slate">
        Alert network operations when a receiving facility has not responded within this time.
        Applies to new and newly-added requests.
      </p>
      {isPending && <Loading label="Loading escalation settings…" />}
      {isError && (
        <Alert tone="critical" title="Couldn’t load escalation settings">
          {error}
        </Alert>
      )}
      {settings && (
        <form
          className="mt-4 flex flex-wrap items-end gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            onSave(currentValue);
          }}
        >
          <label className="grid gap-1 text-sm font-medium text-ink">
            Escalate after (minutes)
            <input
              type="number"
              min={1}
              max={10_080}
              required
              value={currentValue}
              onChange={(event) => setMinutes(Number(event.target.value))}
              className="h-10 w-40 rounded-sm border border-border bg-surface px-3"
            />
          </label>
          <Button type="submit" disabled={isSaving || currentValue < 1 || currentValue > 10_080}>
            Save setting
          </Button>
        </form>
      )}
    </Card>
  );
}
