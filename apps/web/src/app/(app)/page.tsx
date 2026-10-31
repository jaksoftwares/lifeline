'use client';

import { ROLE_DEFINITIONS } from '@lifeline/domain';
import { Card, CardBody, CardHeader, StatusChip } from '@lifeline/ui';
import Link from 'next/link';
import { PageHeader } from '@/components/app-shell';
import { useSession } from '@/lib/session';

const UPCOMING = [
  {
    phase: 1,
    name: 'Facility network and capacity',
    detail: 'Services, departments and timestamped capacity updates.',
  },
  {
    phase: 2,
    name: 'Referrals',
    detail: 'Digital referrals, clinical observations and receiving-facility responses.',
  },
  {
    phase: 3,
    name: 'Ambulances and dispatch',
    detail: 'Fleet, crews, capability levels and confirmed assignments.',
  },
  {
    phase: 4,
    name: 'Crew mobile app',
    detail: 'Trip status updates and location sharing, including offline.',
  },
];

export default function OverviewPage() {
  const { user, network, can } = useSession();
  const roles = user.memberships.filter((m) => m.network.id === network.id);
  const firstName = user.fullName.replace(/^Dr\.?\s+/, '').split(' ')[0];

  return (
    <>
      <PageHeader
        title={`Welcome, ${firstName}`}
        description={`You are signed in to ${network.name}.`}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Your roles" description="What you can do in this network." />
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
                    <StatusChip tone="info">Two-step verification</StatusChip>
                  )}
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Quick links" />
          <CardBody className="space-y-2 text-sm">
            <Link
              className="block text-teal-deep underline-offset-2 hover:underline"
              href="/network"
            >
              View the facility network
            </Link>
            {can('users:manage') && (
              <Link
                className="block text-teal-deep underline-offset-2 hover:underline"
                href="/admin/users"
              >
                Manage users and roles
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

        <Card className="lg:col-span-3">
          <CardHeader
            title="Coming next"
            description="Lifeline is being delivered in phases. These modules will appear in the menu as they become available."
          />
          <CardBody>
            <ul className="grid gap-4 sm:grid-cols-2">
              {UPCOMING.map((item) => (
                <li
                  key={item.phase}
                  className="rounded-md border border-border bg-surface-subtle p-4"
                >
                  <StatusChip tone="neutral">Phase {item.phase}</StatusChip>
                  <p className="mt-2 font-medium text-ink">{item.name}</p>
                  <p className="text-sm text-slate">{item.detail}</p>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
