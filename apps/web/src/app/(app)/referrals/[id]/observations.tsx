'use client';

import { CONSCIOUSNESS_LABELS, VITAL_LABELS } from '@lifeline/domain';
import { type AssessmentView, type ReferralDetail } from '@lifeline/schemas';
import { Alert, Button, Card, CardBody, CardHeader, cn } from '@lifeline/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ScoreChip } from '@/components/referral-chips';
import {
  EMPTY_VITALS,
  hasAnyVital,
  toVitalsInput,
  type VitalsDraft,
  VitalsFields,
} from '@/components/vitals-form';
import { api, ApiError } from '@/lib/api';
import { formatDateTime } from '@/lib/format';

const ROWS: { key: keyof AssessmentView & keyof typeof VITAL_LABELS; unit: string }[] = [
  { key: 'respiratoryRate', unit: '/min' },
  { key: 'oxygenSaturation', unit: '%' },
  { key: 'onSupplementalOxygen', unit: '' },
  { key: 'heartRate', unit: '/min' },
  { key: 'systolicBp', unit: 'mmHg' },
  { key: 'temperature', unit: '°C' },
  { key: 'consciousness', unit: '' },
];

function display(a: AssessmentView, key: (typeof ROWS)[number]['key']): string {
  const value = a[key];
  if (value === null || value === undefined) return '—';
  if (key === 'onSupplementalOxygen') return value ? 'Yes' : 'No (room air)';
  if (key === 'consciousness')
    return CONSCIOUSNESS_LABELS[value as keyof typeof CONSCIOUSNESS_LABELS];
  if (key === 'systolicBp' && a.diastolicBp != null) return `${value}/${a.diastolicBp}`;
  return String(value);
}

export function Observations({ referral }: { referral: ReferralDetail }) {
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [vitals, setVitals] = useState<VitalsDraft>(EMPTY_VITALS);
  const [latest, ...earlier] = referral.assessments;
  const canAdd = referral.viewer.isReferrer && referral.status !== 'CANCELLED';

  const save = useMutation({
    mutationFn: () =>
      api(`/referrals/${referral.id}/assessments`, { method: 'POST', body: toVitalsInput(vitals) }),
    onSuccess: () => {
      setVitals(EMPTY_VITALS);
      setAdding(false);
      void queryClient.invalidateQueries({ queryKey: ['referral', referral.id] });
    },
  });
  const errors = save.error instanceof ApiError ? save.error.fieldErrors : {};

  return (
    <Card>
      <CardHeader
        title="Observations"
        description={
          referral.scoring.score === 'NONE'
            ? undefined
            : `${referral.scoring.score} supports clinical judgement; the urgency above is the clinician’s assessment.`
        }
        actions={
          canAdd &&
          !adding && (
            <Button size="sm" variant="secondary" onClick={() => setAdding(true)}>
              Record observations
            </Button>
          )
        }
      />
      <CardBody className="space-y-4">
        {adding && (
          <form
            className="space-y-4 rounded-md border border-border p-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (hasAnyVital(vitals)) save.mutate();
            }}
          >
            {save.isError && !Object.keys(errors).length && (
              <Alert tone="critical" title={save.error.message} />
            )}
            <VitalsFields
              value={vitals}
              onChange={setVitals}
              score={referral.scoring.score}
              notApplicableReason={referral.scoring.notApplicableReason}
              errors={errors}
            />
            <div className="flex gap-2">
              <Button type="submit" disabled={!hasAnyVital(vitals) || save.isPending}>
                {save.isPending ? 'Saving…' : 'Save observations'}
              </Button>
              <Button variant="ghost" onClick={() => setAdding(false)}>
                Cancel
              </Button>
            </div>
          </form>
        )}

        {!latest ? (
          <p className="text-sm text-slate">No observations recorded.</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="tabular text-sm text-slate">
                Taken {formatDateTime(latest.observedAt)} by {latest.recordedBy.fullName}
              </p>
              {latest.score && latest.score.total !== null && <ScoreChip score={latest.score} />}
            </div>
            {latest.scoreNote && <p className="text-sm text-slate">{latest.scoreNote}</p>}
            <dl className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {ROWS.map(({ key, unit }) => {
                const points = latest.score?.points[key] ?? 0;
                return (
                  <div
                    key={key}
                    className={cn(
                      'rounded-sm border px-3 py-2',
                      points >= 3
                        ? 'border-critical/50 bg-critical/5'
                        : points >= 1
                          ? 'border-warning/50 bg-warning/5'
                          : 'border-border',
                    )}
                  >
                    <dt className="text-xs text-slate">{VITAL_LABELS[key]}</dt>
                    <dd className="tabular font-semibold text-ink">
                      {display(latest, key)}
                      {latest[key] != null && unit && (
                        <span className="ml-1 text-xs font-normal text-slate">{unit}</span>
                      )}
                    </dd>
                  </div>
                );
              })}
            </dl>
            {latest.notes && <p className="text-sm text-ink">“{latest.notes}”</p>}

            {earlier.length > 0 && (
              <details className="text-sm">
                <summary className="cursor-pointer text-teal-deep">
                  Earlier observations ({earlier.length})
                </summary>
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full text-left">
                    <thead className="text-xs text-slate">
                      <tr>
                        <th scope="col" className="py-1 pr-3 font-semibold">
                          Time
                        </th>
                        <th scope="col" className="py-1 pr-3 font-semibold">
                          RR
                        </th>
                        <th scope="col" className="py-1 pr-3 font-semibold">
                          SpO₂
                        </th>
                        <th scope="col" className="py-1 pr-3 font-semibold">
                          HR
                        </th>
                        <th scope="col" className="py-1 pr-3 font-semibold">
                          BP
                        </th>
                        <th scope="col" className="py-1 pr-3 font-semibold">
                          Temp
                        </th>
                        <th scope="col" className="py-1 pr-3 font-semibold">
                          Score
                        </th>
                      </tr>
                    </thead>
                    <tbody className="tabular divide-y divide-border">
                      {earlier.map((a) => (
                        <tr key={a.id}>
                          <td className="py-1 pr-3 whitespace-nowrap text-slate">
                            {formatDateTime(a.observedAt)}
                          </td>
                          <td className="py-1 pr-3">{display(a, 'respiratoryRate')}</td>
                          <td className="py-1 pr-3">{display(a, 'oxygenSaturation')}</td>
                          <td className="py-1 pr-3">{display(a, 'heartRate')}</td>
                          <td className="py-1 pr-3">{display(a, 'systolicBp')}</td>
                          <td className="py-1 pr-3">{display(a, 'temperature')}</td>
                          <td className="py-1 pr-3">{a.score?.total ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            )}
          </>
        )}
      </CardBody>
    </Card>
  );
}
