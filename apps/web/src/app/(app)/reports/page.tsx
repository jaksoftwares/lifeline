'use client';

import { type ReportMetric, type SuccessMetricsReport } from '@lifeline/schemas';
import { Alert, Card, CardBody, CardHeader, Loading } from '@lifeline/ui';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { PageHeader } from '@/components/app-shell';
import { api } from '@/lib/api';
import { useInstitutions } from '@/lib/queries';
import { useSession } from '@/lib/session';

const METRICS = [
  ['referralInitiationMinutes', 'Referral initiation', 'Average time from creation to submission'],
  [
    'facilityAcceptanceMinutes',
    'Facility acceptance',
    'Average time from submission to acceptance',
  ],
  [
    'referralRejectionRate',
    'Referral rejection rate',
    'Declined requests as a share of all requests',
  ],
  [
    'ambulanceAssignmentMinutes',
    'Ambulance assignment',
    'Average time from transport request to assignment',
  ],
  ['ambulanceResponseMinutes', 'Ambulance response', 'Average time from dispatch to pickup'],
  [
    'patientCollectionMinutes',
    'Patient collection',
    'Average time from pickup to patient collection',
  ],
  ['transferDurationMinutes', 'Transfer duration', 'Average time from collection to arrival'],
  ['handoverCompletionRate', 'Handover completion', 'Arrived transfers with a signed handover'],
  [
    'referralCompletionRate',
    'Referral completion',
    'Submitted referrals with a completed transfer',
  ],
  [
    'ambulanceUtilisation',
    'Ambulance utilisation',
    'Assigned minutes divided by available fleet minutes',
  ],
  ['transferCostTotal', 'Recorded transfer costs', 'Total recorded costs (KES)'],
  ['transferCostAverage', 'Average transfer cost', 'Average recorded cost per transfer (KES)'],
  [
    'activeInstitutions',
    'Active institutions',
    'Institutions with recorded referral or transfer activity',
  ],
  ['activeUsers', 'Active users', 'Active accounts that signed in during this period'],
] as const satisfies readonly [keyof SuccessMetricsReport['metrics'], string, string][];

export default function ReportsPage() {
  const { network, can, scopeFor } = useSession();
  const reportScope = scopeFor('reports:view');
  const institutions = useInstitutions(network.id);
  const [from, setFrom] = useState(() => daysAgo(29));
  const [to, setTo] = useState(() => daysAgo(0));
  const [institutionId, setInstitutionId] = useState('');
  useEffect(() => setInstitutionId(''), [network.id]);
  const scopedInstitutions =
    institutions.data?.filter(
      (institution) => reportScope === 'ALL' || reportScope.includes(institution.id),
    ) ?? [];
  const query = useMemo(
    () => ({ networkId: network.id, from, to, institutionId: institutionId || undefined }),
    [network.id, from, to, institutionId],
  );
  const report = useQuery({
    queryKey: ['success-metrics', query],
    queryFn: () => api<SuccessMetricsReport>('/reports/success-metrics', { query }),
    enabled: Boolean(from && to),
  });
  const exportQuery = new URLSearchParams({
    networkId: network.id,
    from,
    to,
    ...(institutionId ? { institutionId } : {}),
  });
  const csvUrl = `/api/reports/success-metrics.csv?${exportQuery}`;
  const pdfUrl = `/api/reports/success-metrics.pdf?${exportQuery}`;

  return (
    <>
      <PageHeader
        title="Success metrics"
        description={`Referral and transfer metrics for ${network.name}.`}
        actions={
          report.data && (
            <div className="flex flex-wrap gap-2">
              <a
                className="inline-flex h-10 items-center rounded-sm border border-border px-4 text-sm font-medium text-ink hover:bg-surface-subtle"
                href={csvUrl}
              >
                Export CSV
              </a>
              <a
                className="inline-flex h-10 items-center rounded-sm bg-teal-deep px-4 text-sm font-medium text-white hover:bg-navy"
                href={pdfUrl}
              >
                Download PDF
              </a>
            </div>
          )
        }
      />

      <Card className="mb-6">
        <CardBody>
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="grid gap-1 text-sm font-medium text-ink">
              From
              <input
                type="date"
                value={from}
                max={to}
                onChange={(event) => setFrom(event.target.value)}
                className="h-10 rounded-sm border border-border bg-surface px-3"
              />
            </label>
            <label className="grid gap-1 text-sm font-medium text-ink">
              To
              <input
                type="date"
                value={to}
                min={from}
                onChange={(event) => setTo(event.target.value)}
                className="h-10 rounded-sm border border-border bg-surface px-3"
              />
            </label>
            <label className="grid gap-1 text-sm font-medium text-ink">
              Institution
              <select
                value={institutionId}
                onChange={(event) => setInstitutionId(event.target.value)}
                className="h-10 rounded-sm border border-border bg-surface px-3"
              >
                <option value="">All institutions in your scope</option>
                {scopedInstitutions.map((institution) => (
                  <option key={institution.id} value={institution.id}>
                    {institution.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </CardBody>
      </Card>

      {institutions.isError && (
        <Alert tone="warning" title="Institution filters are unavailable" className="mb-4">
          {institutions.error.message}
        </Alert>
      )}
      {report.isPending && <Loading label="Calculating success metrics…" />}
      {report.isError && (
        <Alert tone="critical" title="We couldn’t load the report">
          {report.error.message}
        </Alert>
      )}
      {report.data && (
        <>
          <p className="mb-4 text-sm text-slate">
            Reporting period uses East Africa Time. Empty metrics mean no completed observations,
            not zero performance.
          </p>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {METRICS.map(([key, title, description]) => (
              <MetricCard
                key={key}
                title={title}
                description={description}
                metric={report.data.metrics[key]}
              />
            ))}
          </div>
          <div className="mt-6 flex flex-wrap gap-4 text-sm">
            {can('users:manage') && (
              <Link className="text-teal-deep underline" href="/admin/users">
                User and role administration
              </Link>
            )}
            {(can('institutions:manage') || can('facility:manage') || can('fleet:manage')) && (
              <Link className="text-teal-deep underline" href="/network">
                Institution directory and administration
              </Link>
            )}
            {can('audit:view') && (
              <Link className="text-teal-deep underline" href="/admin/audit">
                Audit viewer
              </Link>
            )}
          </div>
        </>
      )}
    </>
  );
}

function MetricCard({
  title,
  description,
  metric,
}: {
  title: string;
  description: string;
  metric: ReportMetric;
}) {
  const value = formatMetric(metric);
  return (
    <Card>
      <CardHeader title={title} description={description} />
      <CardBody>
        <p className="font-display text-2xl font-bold tabular text-navy">{value}</p>
        <p className="mt-1 text-xs text-slate">
          {metric.unit === 'count'
            ? `${metric.numerator.toLocaleString()} active of ${metric.denominator.toLocaleString()}`
            : `${metric.denominator.toLocaleString()} observation${metric.denominator === 1 ? '' : 's'}`}
        </p>
      </CardBody>
    </Card>
  );
}

function formatMetric(metric: ReportMetric): string {
  if (metric.value === null) return 'No data';
  switch (metric.unit) {
    case 'minutes':
      return `${metric.value.toLocaleString()} min`;
    case 'percent':
      return `${metric.value.toLocaleString()}%`;
    case 'currency':
      return `KES ${metric.value.toLocaleString('en-KE', { minimumFractionDigits: 2 })}`;
    case 'count':
      return metric.value.toLocaleString();
  }
}

function daysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
