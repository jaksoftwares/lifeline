'use client';

import { INSTITUTION_TYPE_LABELS } from '@lifeline/domain';
import { Alert, Button, Card, EmptyState, Loading, StatusChip } from '@lifeline/ui';
import { useQueryClient } from '@tanstack/react-query';
import { Building2, Plus } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { useInstitutions } from '@/lib/queries';
import { useSession } from '@/lib/session';
import { AddInstitutionPanel } from './add-institution-panel';

export function Directory() {
  const { network, can } = useSession();
  const institutions = useInstitutions(network.id);
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const canAdd = can('institutions:manage') && institutions.data !== undefined;

  return (
    <>
      {canAdd && !adding && (
        <div className="mb-4 flex justify-end">
          <Button onClick={() => setAdding(true)}>
            <Plus aria-hidden className="size-4" /> Add institution
          </Button>
        </div>
      )}
      {adding && (
        <AddInstitutionPanel
          onClose={() => setAdding(false)}
          onCreated={(name) => {
            setAdding(false);
            setNotice(
              `${name} has been added. Open it to record services, capacity items and departments.`,
            );
            void queryClient.invalidateQueries({ queryKey: ['institutions', network.id] });
          }}
        />
      )}
      {notice && <Alert tone="success" title={notice} className="mb-4" />}

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
                    <td className="px-5 py-3 font-medium text-ink">
                      <Link href={`/network/${inst.id}`} className="hover:underline">
                        {inst.name}
                      </Link>
                    </td>
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
