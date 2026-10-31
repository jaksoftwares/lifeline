'use client';

import { type CapacityEntry } from '@lifeline/schemas';
import { Alert, Card, CardBody, CardHeader, Loading, Select } from '@lifeline/ui';
import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { latestUpdate } from '@/components/capacity';
import { CapacityForm } from '@/components/capacity-form';
import { PageHeader } from '@/components/app-shell';
import { formatAgo } from '@/lib/format';
import { useFacility } from '@/lib/queries';
import { useSession } from '@/lib/session';

export default function CapacityPage() {
  const { user, network, scopeFor } = useSession();
  const scope = scopeFor('capacity:update');
  const facilities = user.memberships
    .filter((m) => m.network.id === network.id && m.institution?.type === 'FACILITY')
    .map((m) => m.institution!)
    .filter((inst, i, all) => all.findIndex((x) => x.id === inst.id) === i)
    .filter((inst) => scope === 'ALL' || scope.includes(inst.id));
  const [selected, setSelected] = useState<string | undefined>(undefined);
  const facilityId = selected ?? facilities[0]?.id;

  return (
    <>
      <PageHeader
        title="Capacity"
        description="Report what your facility can receive right now. Referring teams see these figures, with the time and your name."
      />
      {!facilityId ? (
        <Alert tone="warning" title="You don’t report capacity for any facility in this network." />
      ) : (
        <>
          {facilities.length > 1 && (
            <div className="mb-4 max-w-sm space-y-1.5">
              <label htmlFor="capacity-facility" className="block text-[13px] font-medium text-ink">
                Facility
              </label>
              <Select
                id="capacity-facility"
                value={facilityId}
                onChange={(e) => setSelected(e.target.value)}
              >
                {facilities.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </Select>
            </div>
          )}
          <FacilityCapacity key={facilityId} facilityId={facilityId} />
        </>
      )}
    </>
  );
}

function FacilityCapacity({ facilityId }: { facilityId: string }) {
  const facility = useFacility(facilityId);
  const queryClient = useQueryClient();

  if (facility.isPending) return <Loading label="Loading capacity…" />;
  if (facility.isError)
    return (
      <Alert tone="critical" title="We couldn’t load capacity">
        {facility.error.message}
      </Alert>
    );

  const { capacity, facility: profile, capacityStaleAfterMinutes } = facility.data;
  const latest = latestUpdate(capacity);
  const staleCount = capacity.filter((c) => c.stale || !c.status).length;

  return (
    <Card>
      <CardHeader
        title={profile.name}
        description={
          latest?.updatedAt
            ? `Last reported ${formatAgo(latest.updatedAt)}. Figures older than ${capacityStaleAfterMinutes / 60} hours are shown to others as out of date.`
            : 'Nothing reported yet.'
        }
        actions={
          <Link href={`/network/${profile.id}`} className="text-sm text-teal-deep hover:underline">
            View as others see it
          </Link>
        }
      />
      <CardBody>
        {staleCount > 0 && (
          <Alert
            tone="warning"
            title={`${staleCount} ${staleCount === 1 ? 'item needs' : 'items need'} updating`}
            className="mb-4"
          >
            Referring facilities see these as out of date or not reported.
          </Alert>
        )}
        <CapacityForm
          institutionId={profile.id}
          capacity={capacity}
          onSaved={(updated: CapacityEntry[]) => {
            queryClient.setQueryData(['facility', facilityId], {
              ...facility.data,
              capacity: updated,
            });
            void queryClient.invalidateQueries({ queryKey: ['facility', facilityId] });
            void queryClient.invalidateQueries({ queryKey: ['facility-search'] });
          }}
        />
      </CardBody>
    </Card>
  );
}
