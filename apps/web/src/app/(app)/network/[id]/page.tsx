'use client';

import { AVAILABILITY_LABELS, INSTITUTION_TYPE_LABELS, OWNERSHIP_LABELS } from '@lifeline/domain';
import { type FacilityDetail } from '@lifeline/schemas';
import { Alert, Card, CardBody, CardHeader, Loading, StatusChip } from '@lifeline/ui';
import { ArrowLeft, MapPin, Phone } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { CapacityStatus, Freshness } from '@/components/capacity';
import { PageHeader } from '@/components/app-shell';
import { formatDateTime } from '@/lib/format';
import { useFacility } from '@/lib/queries';
import { useSession } from '@/lib/session';
import { FacilitySettings } from './facility-settings';

export default function FacilityPage() {
  const { id } = useParams<{ id: string }>();
  const facility = useFacility(id);
  const { scopeFor } = useSession();

  if (facility.isPending) return <Loading label="Loading facility…" />;
  if (facility.isError) {
    return (
      <Alert tone="critical" title="We couldn’t load this facility">
        {facility.error.message}
      </Alert>
    );
  }

  const detail = facility.data;
  const { facility: profile } = detail;
  const inScope = (scope: 'ALL' | string[]) => scope === 'ALL' || scope.includes(profile.id);
  const canReport = profile.type === 'FACILITY' && inScope(scopeFor('capacity:update'));
  const canManage =
    inScope(scopeFor('institutions:manage')) ||
    (profile.type === 'FACILITY'
      ? inScope(scopeFor('facility:manage'))
      : inScope(scopeFor('fleet:manage')));

  const subtitle = [
    INSTITUTION_TYPE_LABELS[profile.type],
    profile.level ? `Level ${profile.level}` : null,
    profile.ownership ? OWNERSHIP_LABELS[profile.ownership] : null,
    profile.county,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <>
      <Link
        href="/network"
        className="mb-3 inline-flex items-center gap-1 text-sm text-teal-deep hover:underline"
      >
        <ArrowLeft aria-hidden className="size-4" /> Facility network
      </Link>
      <PageHeader
        title={profile.name}
        description={subtitle}
        actions={
          canReport && (
            <Link
              href="/capacity"
              className="inline-flex h-10 items-center rounded-sm bg-teal-deep px-4 text-sm font-medium text-white hover:bg-navy"
            >
              Update capacity
            </Link>
          )
        }
      />
      {profile.status === 'INACTIVE' && (
        <Alert tone="warning" title="This institution is inactive" className="mb-6">
          It does not appear in facility searches.
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {profile.type === 'FACILITY' && <CapacityCard detail={detail} />}
          {profile.type === 'FACILITY' && <RecentReports detail={detail} />}
        </div>
        <div className="space-y-6">
          <Card>
            <CardHeader title="Contact" />
            <CardBody className="space-y-3 text-sm">
              {profile.phone ? (
                <a
                  href={`tel:${profile.phone}`}
                  className="inline-flex items-center gap-2 font-medium text-teal-deep hover:underline"
                >
                  <Phone aria-hidden className="size-4" />
                  <span className="tabular">{profile.phone}</span>
                </a>
              ) : (
                <p className="text-slate">No phone number recorded.</p>
              )}
              {profile.address && (
                <p className="flex gap-2 text-ink">
                  <MapPin aria-hidden className="mt-0.5 size-4 shrink-0 text-slate" />
                  {profile.address}
                </p>
              )}
              {detail.departments.length > 0 && (
                <div>
                  <p className="mb-1 text-[13px] font-medium text-slate">Departments</p>
                  <ul className="divide-y divide-border">
                    {detail.departments.map((d) => (
                      <li key={d.id} className="flex flex-wrap justify-between gap-2 py-1.5">
                        <span className="text-ink">{d.name}</span>
                        {d.phone && (
                          <a
                            href={`tel:${d.phone}`}
                            className="tabular text-teal-deep hover:underline"
                          >
                            {d.phone}
                          </a>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardBody>
          </Card>
          {profile.type === 'FACILITY' && (
            <Card>
              <CardHeader title="Services" />
              <CardBody>
                {detail.services.length === 0 ? (
                  <p className="text-sm text-slate">No services recorded yet.</p>
                ) : (
                  <ul className="flex flex-wrap gap-1.5">
                    {detail.services.map((s) => (
                      <li
                        key={s.id}
                        className="rounded-pill bg-surface-blue px-2.5 py-1 text-xs font-medium text-ink"
                      >
                        {s.name}
                      </li>
                    ))}
                  </ul>
                )}
              </CardBody>
            </Card>
          )}
        </div>
      </div>

      {canManage && <FacilitySettings detail={detail} />}
    </>
  );
}

function CapacityCard({ detail }: { detail: FacilityDetail }) {
  return (
    <Card>
      <CardHeader
        title="Current capacity"
        description={`As reported by the facility. Reports older than ${detail.capacityStaleAfterMinutes / 60} hours are marked out of date.`}
      />
      {detail.capacity.length === 0 ? (
        <CardBody>
          <p className="text-sm text-slate">This facility does not report capacity yet.</p>
        </CardBody>
      ) : (
        <ul className="divide-y divide-border">
          {detail.capacity.map((entry) => (
            <li
              key={entry.resource.id}
              className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-5 py-3"
            >
              <div>
                <p className="font-medium text-ink">{entry.resource.name}</p>
                <Freshness entry={entry} />
                {entry.note && <p className="text-xs text-slate">“{entry.note}”</p>}
              </div>
              <CapacityStatus entry={entry} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function RecentReports({ detail }: { detail: FacilityDetail }) {
  if (detail.recentUpdates.length === 0) return null;
  return (
    <Card>
      <CardHeader
        title="Recent reports"
        description="Every capacity report is kept and cannot be changed."
      />
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border bg-surface-subtle text-[13px] text-slate">
            <tr>
              <th scope="col" className="px-5 py-2.5 font-semibold">
                Time
              </th>
              <th scope="col" className="px-5 py-2.5 font-semibold">
                Item
              </th>
              <th scope="col" className="px-5 py-2.5 font-semibold">
                Reported
              </th>
              <th scope="col" className="px-5 py-2.5 font-semibold">
                By
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {detail.recentUpdates.map((u) => (
              <tr key={u.id}>
                <td className="tabular px-5 py-2.5 whitespace-nowrap text-slate">
                  {formatDateTime(u.recordedAt)}
                </td>
                <td className="px-5 py-2.5 text-ink">{u.resource.name}</td>
                <td className="px-5 py-2.5">
                  <StatusChip tone="neutral">
                    <span className="tabular">
                      {AVAILABILITY_LABELS[u.status]}
                      {u.available != null
                        ? ` · ${u.available}${u.total != null ? ` of ${u.total}` : ''} free`
                        : ''}
                    </span>
                  </StatusChip>
                </td>
                <td className="px-5 py-2.5 text-slate">{u.recordedBy?.fullName ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
