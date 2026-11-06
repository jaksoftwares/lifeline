'use client';

import { ROLE_DEFINITIONS } from '@lifeline/domain';
import { Alert, Card, CardBody, CardHeader, StatusChip } from '@lifeline/ui';
import { useQuery } from '@tanstack/react-query';
import { Ambulance, Bell, Building2, FileHeart, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { type NotificationView } from '@lifeline/schemas';
import { PageHeader } from '@/components/app-shell';
import { api } from '@/lib/api';
import { useInstitutions, useReferrals, useTransfers, useVehicles } from '@/lib/queries';
import { useSession } from '@/lib/session';

export default function OverviewPage() {
  const { user, network, can, scopeFor } = useSession();
  const roles = user.memberships.filter((m) => m.network.id === network.id);
  const firstName = user.fullName.replace(/^Dr\.?\s+/, '').split(' ')[0];
  const referralScope = scopeFor('referral:view');
  const canSeeInstitutionReferrals = referralScope !== 'ALL' && can('referral:view');
  const outgoingEnabled = canSeeInstitutionReferrals && can('referral:create');
  const incomingEnabled = canSeeInstitutionReferrals && can('referral:respond');
  const networkReferralsEnabled = referralScope === 'ALL' && can('referral:view');
  const outgoing = useReferrals(network.id, 'outgoing', true, outgoingEnabled);
  const incoming = useReferrals(network.id, 'incoming', true, incomingEnabled);
  const networkReferrals = useReferrals(network.id, 'network', true, networkReferralsEnabled);
  const referralRows = uniqueById(
    outgoingEnabled ? outgoing.data : undefined,
    incomingEnabled ? incoming.data : undefined,
    networkReferralsEnabled ? networkReferrals.data : undefined,
  );
  const referralsCapped =
    (outgoingEnabled && outgoing.data?.length === 100) ||
    (incomingEnabled && incoming.data?.length === 100) ||
    (networkReferralsEnabled && networkReferrals.data?.length === 100);

  const transferScope = scopeFor('transfers:monitor');
  const transportScope = scopeFor('transport:request');
  const dispatchScope = scopeFor('dispatch:assign');
  const fleetScope = scopeFor('fleet:view');
  const facilityTransfersEnabled =
    (referralScope !== 'ALL' && referralScope.length > 0) ||
    (transportScope !== 'ALL' && transportScope.length > 0);
  const providerTransfersEnabled =
    (dispatchScope !== 'ALL' && dispatchScope.length > 0) ||
    (fleetScope !== 'ALL' && fleetScope.length > 0);
  const networkTransfersEnabled = transferScope === 'ALL' && can('transfers:monitor');
  const facilityTransfers = useTransfers(network.id, 'facility', true, facilityTransfersEnabled);
  const providerTransfers = useTransfers(network.id, 'provider', true, providerTransfersEnabled);
  const networkTransfers = useTransfers(network.id, 'network', true, networkTransfersEnabled);
  const transferRows = uniqueById(
    facilityTransfersEnabled ? facilityTransfers.data : undefined,
    providerTransfersEnabled ? providerTransfers.data : undefined,
    networkTransfersEnabled ? networkTransfers.data : undefined,
  );
  const transfersCapped =
    (facilityTransfersEnabled && facilityTransfers.data?.length === 100) ||
    (providerTransfersEnabled && providerTransfers.data?.length === 100) ||
    (networkTransfersEnabled && networkTransfers.data?.length === 100);

  const vehicles = useVehicles(network.id, undefined, can('fleet:view') || can('dispatch:assign'));
  const notifications = useQuery({
    queryKey: ['notifications', network.id, 'unread'],
    queryFn: () =>
      api<NotificationView[]>('/notifications', {
        query: { networkId: network.id, unreadOnly: 'true' },
      }),
    refetchInterval: 30_000,
  });
  const institutions = useInstitutions(network.id);
  const adminView = can('users:manage') || can('network:configure') || can('reports:view');

  return (
    <>
      <PageHeader
        title={`Welcome, ${firstName}`}
        description="Current referrals, transfers and alerts."
      />

      <section aria-labelledby="overview-heading" className="mb-6">
        <h2 id="overview-heading" className="mb-3 text-lg font-semibold text-ink">
          Network at a glance
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {(outgoingEnabled || incomingEnabled || networkReferralsEnabled) && (
            <SummaryCard
              href="/referrals"
              title="Open referrals"
              icon={FileHeart}
              isPending={
                (outgoingEnabled && outgoing.isPending) ||
                (incomingEnabled && incoming.isPending) ||
                (networkReferralsEnabled && networkReferrals.isPending)
              }
              error={
                (outgoingEnabled ? outgoing.error?.message : undefined) ||
                (incomingEnabled ? incoming.error?.message : undefined) ||
                (networkReferralsEnabled ? networkReferrals.error?.message : undefined)
              }
              value={referralsCapped ? '100+' : referralRows.length}
              detail={
                networkReferralsEnabled
                  ? referralsCapped
                    ? 'At least 100 submitted across the network'
                    : 'Submitted across the network'
                  : [
                      outgoingEnabled
                        ? `${formatListCount(outgoing.data?.length ?? 0)} sent`
                        : null,
                      incomingEnabled
                        ? `${formatListCount(incoming.data?.length ?? 0)} to review`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')
              }
              attention={referralRows.filter((referral) => referral.nextAction).length}
            />
          )}
          {(facilityTransfersEnabled || providerTransfersEnabled || networkTransfersEnabled) && (
            <SummaryCard
              href="/transfers"
              title="Open transfers"
              icon={Ambulance}
              isPending={
                (facilityTransfersEnabled && facilityTransfers.isPending) ||
                (providerTransfersEnabled && providerTransfers.isPending) ||
                (networkTransfersEnabled && networkTransfers.isPending)
              }
              error={
                (facilityTransfersEnabled ? facilityTransfers.error?.message : undefined) ||
                (providerTransfersEnabled ? providerTransfers.error?.message : undefined) ||
                (networkTransfersEnabled ? networkTransfers.error?.message : undefined)
              }
              value={transfersCapped ? '100+' : transferRows.length}
              detail={
                networkTransfersEnabled
                  ? transfersCapped
                    ? 'At least 100 across the network'
                    : 'Across the network'
                  : [
                      facilityTransfersEnabled
                        ? `${formatListCount(facilityTransfers.data?.length ?? 0)} facility`
                        : null,
                      providerTransfersEnabled
                        ? `${formatListCount(providerTransfers.data?.length ?? 0)} provider`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')
              }
              attention={transferRows.filter((transfer) => transfer.attention).length}
            />
          )}
          {(can('fleet:view') || can('dispatch:assign')) && (
            <SummaryCard
              href="/fleet"
              title="Ambulances available"
              icon={Ambulance}
              isPending={vehicles.isPending}
              error={vehicles.error?.message}
              value={
                vehicles.data?.filter(
                  (vehicle) =>
                    vehicle.status === 'AVAILABLE' &&
                    vehicle.recordStatus === 'ACTIVE' &&
                    !vehicle.stale &&
                    !vehicle.onTransfer &&
                    (fleetScope === 'ALL' ||
                      dispatchScope === 'ALL' ||
                      fleetScope.includes(vehicle.provider.id) ||
                      dispatchScope.includes(vehicle.provider.id)),
                ).length ?? 0
              }
              detail={`Of ${vehicles.data?.filter((vehicle) => vehicle.recordStatus === 'ACTIVE').length ?? 0} active vehicles`}
            />
          )}
          <SummaryCard
            href="/notifications"
            title="Unread notifications"
            icon={Bell}
            isPending={notifications.isPending}
            error={notifications.error?.message}
            value={
              (notifications.data?.length ?? 0) === 100 ? '100+' : (notifications.data?.length ?? 0)
            }
            detail={
              notifications.data?.length === 100
                ? 'At least 100 unread updates'
                : 'Updates for your active roles'
            }
          />
          {adminView && (
            <SummaryCard
              href={can('reports:view') ? '/reports' : '/admin/users'}
              title="Network institutions"
              icon={Building2}
              isPending={institutions.isPending}
              error={institutions.error?.message}
              value={
                institutions.data?.filter((institution) => institution.status === 'ACTIVE')
                  .length ?? 0
              }
              detail={`${institutions.data?.filter((institution) => institution.status === 'INACTIVE').length ?? 0} inactive`}
            />
          )}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Your roles" />
          <CardBody>
            <ul className="divide-y divide-border">
              {roles.map((m) => (
                <li
                  key={m.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-3 first:pt-0 last:pb-0"
                >
                  <div>
                    <p className="font-medium text-ink">{m.roleLabel}</p>
                    <p className="text-sm text-slate">{m.institution?.name ?? 'Whole network'}</p>
                  </div>
                  {ROLE_DEFINITIONS[m.role].requiresMfa && (
                    <StatusChip tone="info">Two-step verification required</StatusChip>
                  )}
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Quick links" />
          <CardBody className="space-y-2 text-sm">
            {can('referral:view') && (
              <Link
                className="block text-teal-deep underline-offset-2 hover:underline"
                href="/referrals"
              >
                Open referrals
              </Link>
            )}
            <Link
              className="block text-teal-deep underline-offset-2 hover:underline"
              href="/network"
            >
              Find a receiving facility
            </Link>
            {can('capacity:update') && (
              <Link
                className="block text-teal-deep underline-offset-2 hover:underline"
                href="/capacity"
              >
                Report your facility’s capacity
              </Link>
            )}
            {(can('transport:request') || can('dispatch:assign')) && (
              <Link
                className="block text-teal-deep underline-offset-2 hover:underline"
                href="/transfers"
              >
                Transfers and ambulances
              </Link>
            )}
            {can('dispatch:assign') && (
              <Link
                className="block text-teal-deep underline-offset-2 hover:underline"
                href="/fleet"
              >
                Confirm vehicle availability
              </Link>
            )}
            {can('users:manage') && (
              <Link
                className="block text-teal-deep underline-offset-2 hover:underline"
                href="/admin/users"
              >
                Manage users and roles
              </Link>
            )}
            {can('reports:view') && (
              <Link
                className="block text-teal-deep underline-offset-2 hover:underline"
                href="/reports"
              >
                Review success metrics and export reports
              </Link>
            )}
            {can('network:configure') && (
              <Link
                className="block text-teal-deep underline-offset-2 hover:underline"
                href="/admin/network"
              >
                Configure network settings
              </Link>
            )}
            {can('audit:view') && (
              <Link
                className="block text-teal-deep underline-offset-2 hover:underline"
                href="/admin/audit"
              >
                Review the audit log
              </Link>
            )}
            <Link
              className="block text-teal-deep underline-offset-2 hover:underline"
              href="/account"
            >
              Change your password
            </Link>
          </CardBody>
        </Card>
      </div>
    </>
  );
}

function SummaryCard({
  href,
  title,
  icon: Icon,
  isPending,
  error,
  value,
  detail,
  attention = 0,
}: {
  href: string;
  title: string;
  icon: LucideIcon;
  isPending: boolean;
  error?: string;
  value: number | string;
  detail: string;
  attention?: number;
}) {
  return (
    <Card>
      <CardHeader title={title} actions={<Icon className="size-5 text-teal-deep" aria-hidden />} />
      <CardBody>
        {isPending ? (
          <p className="text-sm text-slate">Loading current totals…</p>
        ) : error ? (
          <Alert tone="critical" title="Could not load this summary">
            {error}
          </Alert>
        ) : (
          <>
            <p className="text-3xl font-semibold tabular-nums text-ink">{value}</p>
            <p className="mt-1 text-sm text-slate">{detail}</p>
            {attention > 0 && (
              <StatusChip tone="warning">
                {attention} {attention === 1 ? 'item needs' : 'items need'} attention
              </StatusChip>
            )}
            <Link
              href={href}
              className="mt-3 inline-block text-sm font-medium text-teal-deep underline-offset-2 hover:underline"
            >
              View details
            </Link>
          </>
        )}
      </CardBody>
    </Card>
  );
}

function uniqueById<T extends { id: string }>(...groups: (T[] | undefined)[]): T[] {
  return [
    ...new Map(groups.flatMap((group) => group ?? []).map((item) => [item.id, item])).values(),
  ];
}

function formatListCount(count: number): string {
  return count === 100 ? '100+' : String(count);
}
