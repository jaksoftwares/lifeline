'use client';

import { INSTITUTION_TYPE_LABELS } from '@lifeline/domain';
import { Alert, Card, EmptyState, Loading, StatusChip } from '@lifeline/ui';
import { Building2 } from 'lucide-react';
import { PageHeader } from '@/components/app-shell';
import { useInstitutions } from '@/lib/queries';
import { useSession } from '@/lib/session';

export default function NetworkPage() {
  const { network } = useSession();
  const institutions = useInstitutions(network.id);

  return (
    <>
      <PageHeader
        title="Facility network"
        description="Healthcare facilities and ambulance providers participating in this network."
      />
      <Card>
        {institutions.isPending && <Loading label="Loading facility network…" />}
        {institutions.isError && (
          <div className="p-5">
            <Alert tone="critical" title="We couldn’t load the facility network">
              {institutions.error.message}
            </Alert>
          </div>
        )}
        {institutions.data?.length === 0 && (
          <EmptyState icon={Building2} title="No institutions have joined this network yet." />
        )}
        {institutions.data && institutions.data.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-surface-subtle text-[13px] text-slate">
                <tr>
                  <th scope="col" className="px-5 py-3 font-semibold">
                    Name
                  </th>
                  <th scope="col" className="px-5 py-3 font-semibold">
                    Type
                  </th>
                  <th scope="col" className="px-5 py-3 font-semibold">
                    Level
                  </th>
                  <th scope="col" className="px-5 py-3 font-semibold">
                    County
                  </th>
                  <th scope="col" className="px-5 py-3 font-semibold">
                    Code
                  </th>
                  <th scope="col" className="px-5 py-3 font-semibold">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {institutions.data.map((inst) => (
                  <tr key={inst.id}>
                    <td className="px-5 py-3 font-medium text-ink">{inst.name}</td>
                    <td className="px-5 py-3 text-slate">{INSTITUTION_TYPE_LABELS[inst.type]}</td>
                    <td className="tabular px-5 py-3 text-slate">
                      {inst.level ? `Level ${inst.level}` : '—'}
                    </td>
                    <td className="px-5 py-3 text-slate">{inst.county ?? '—'}</td>
                    <td className="tabular px-5 py-3 font-mono text-[13px] text-slate">
                      {inst.code}
                    </td>
                    <td className="px-5 py-3">
                      <StatusChip tone={inst.status === 'ACTIVE' ? 'success' : 'neutral'}>
                        {inst.status === 'ACTIVE' ? 'Active' : 'Inactive'}
                      </StatusChip>
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
