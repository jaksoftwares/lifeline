'use client';

import { type AuditEventView, type Page } from '@lifeline/schemas';
import { Alert, Button, Card, EmptyState, Loading, Select } from '@lifeline/ui';
import { useInfiniteQuery } from '@tanstack/react-query';
import { ClipboardList } from 'lucide-react';
import { useState } from 'react';
import { PageHeader } from '@/components/app-shell';
import { api } from '@/lib/api';
import { auditActionLabel, formatDateTime } from '@/lib/format';
import { useInstitutions } from '@/lib/queries';
import { useSession } from '@/lib/session';

function describe(event: AuditEventView): string {
  const m = event.metadata;
  const parts: string[] = [];
  if (typeof m.email === 'string') parts.push(m.email);
  if (typeof m.role === 'string') parts.push(m.role.replaceAll('_', ' ').toLowerCase());
  if (typeof m.reason === 'string') parts.push(`reason: ${m.reason.replaceAll('_', ' ')}`);
  if (m.locked === true) parts.push('account locked');
  return parts.join(' · ');
}

export default function AuditPage() {
  const { network, scopeFor } = useSession();
  const scope = scopeFor('audit:view');
  const institutions = useInstitutions(network.id);
  const [institutionId, setInstitutionId] = useState('');

  const events = useInfiniteQuery({
    queryKey: ['audit', network.id, institutionId],
    queryFn: ({ pageParam }) =>
      api<Page<AuditEventView>>('/audit-events', {
        query: { networkId: network.id, institutionId, cursor: pageParam, limit: 50 },
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

  const rows = events.data?.pages.flatMap((p) => p.items) ?? [];
  const filterOptions = (institutions.data ?? []).filter(
    (i) => scope === 'ALL' || scope.includes(i.id),
  );

  return (
    <>
      <PageHeader
        title="Audit log"
        description="Sign-ins and administrative changes. Entries cannot be edited or deleted. Times are East Africa Time."
      />
      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-3">
          <label htmlFor="audit-filter" className="text-[13px] font-medium text-slate">
            Show
          </label>
          <Select
            id="audit-filter"
            className="h-9 w-auto min-w-56"
            value={institutionId}
            onChange={(e) => setInstitutionId(e.target.value)}
          >
            <option value="">{scope === 'ALL' ? 'Whole network' : 'Everywhere I can view'}</option>
            {filterOptions.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </Select>
        </div>

        {events.isPending && <Loading label="Loading audit log…" />}
        {events.isError && (
          <div className="p-5">
            <Alert tone="critical" title="We couldn’t load the audit log">
              {events.error.message}
            </Alert>
          </div>
        )}
        {events.isSuccess && rows.length === 0 && (
          <EmptyState icon={ClipboardList} title="No activity recorded yet." />
        )}
        {rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-surface-subtle text-[13px] text-slate">
                <tr>
                  <th scope="col" className="px-5 py-3 font-semibold">
                    Time
                  </th>
                  <th scope="col" className="px-5 py-3 font-semibold">
                    Event
                  </th>
                  <th scope="col" className="px-5 py-3 font-semibold">
                    By
                  </th>
                  <th scope="col" className="px-5 py-3 font-semibold">
                    Where
                  </th>
                  <th scope="col" className="px-5 py-3 font-semibold">
                    Details
                  </th>
                  <th scope="col" className="px-5 py-3 font-semibold">
                    IP address
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((e) => (
                  <tr key={e.id}>
                    <td className="tabular px-5 py-3 whitespace-nowrap text-slate">
                      {formatDateTime(e.occurredAt)}
                    </td>
                    <td className="px-5 py-3 font-medium text-ink">{auditActionLabel(e.action)}</td>
                    <td className="px-5 py-3 text-ink">{e.actor?.fullName ?? '—'}</td>
                    <td className="px-5 py-3 text-slate">{e.institution?.name ?? '—'}</td>
                    <td className="px-5 py-3 text-slate">{describe(e) || '—'}</td>
                    <td className="tabular px-5 py-3 font-mono text-[13px] text-slate">
                      {e.ipAddress ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {events.hasNextPage && (
          <div className="border-t border-border px-5 py-3">
            <Button
              variant="secondary"
              size="sm"
              disabled={events.isFetchingNextPage}
              onClick={() => void events.fetchNextPage()}
            >
              {events.isFetchingNextPage ? 'Loading…' : 'Load older entries'}
            </Button>
          </div>
        )}
      </Card>
    </>
  );
}
