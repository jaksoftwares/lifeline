'use client';

import {
  calculateScore,
  CONSCIOUSNESS_LABELS,
  CONSCIOUSNESS_LEVELS,
  type Consciousness,
  type EarlyWarningScore,
  VITAL_LABELS,
  type Vitals,
} from '@lifeline/domain';
import { type VitalsInput } from '@lifeline/schemas';
import { Alert, cn, Input, Select } from '@lifeline/ui';
import { useId } from 'react';
import { ScoreChip } from './referral-chips';

export interface VitalsDraft {
  respiratoryRate: string;
  oxygenSaturation: string;
  onSupplementalOxygen: '' | 'yes' | 'no';
  systolicBp: string;
  diastolicBp: string;
  heartRate: string;
  temperature: string;
  consciousness: Consciousness | '';
  notes: string;
}

export const EMPTY_VITALS: VitalsDraft = {
  respiratoryRate: '',
  oxygenSaturation: '',
  onSupplementalOxygen: '',
  systolicBp: '',
  diastolicBp: '',
  heartRate: '',
  temperature: '',
  consciousness: '',
  notes: '',
};

const num = (v: string) => (v.trim() === '' ? null : Number(v));

export function toVitals(draft: VitalsDraft): Vitals {
  return {
    respiratoryRate: num(draft.respiratoryRate),
    oxygenSaturation: num(draft.oxygenSaturation),
    onSupplementalOxygen:
      draft.onSupplementalOxygen === '' ? null : draft.onSupplementalOxygen === 'yes',
    systolicBp: num(draft.systolicBp),
    diastolicBp: num(draft.diastolicBp),
    heartRate: num(draft.heartRate),
    temperature: num(draft.temperature),
    consciousness: draft.consciousness || null,
  };
}

export function toVitalsInput(draft: VitalsDraft): VitalsInput {
  return { ...toVitals(draft), notes: draft.notes };
}

export function hasAnyVital(draft: VitalsDraft): boolean {
  return Object.entries(draft).some(([key, value]) => key !== 'notes' && value !== '');
}

const NUMERIC: { key: keyof VitalsDraft; unit: string; step?: string }[] = [
  { key: 'respiratoryRate', unit: 'breaths/min' },
  { key: 'oxygenSaturation', unit: '%' },
  { key: 'heartRate', unit: 'beats/min' },
  { key: 'systolicBp', unit: 'mmHg' },
  { key: 'diastolicBp', unit: 'mmHg' },
  { key: 'temperature', unit: '°C', step: '0.1' },
];

/**
 * Observation entry with a live preview of the network's early-warning score. The preview uses the
 * same calculation the API stores; it supports clinical judgement and never sets urgency.
 */
export function VitalsFields({
  value,
  onChange,
  score,
  notApplicableReason,
  errors = {},
}: {
  value: VitalsDraft;
  onChange: (next: VitalsDraft) => void;
  score: EarlyWarningScore;
  notApplicableReason?: string | null;
  errors?: Record<string, string>;
}) {
  const id = useId();
  const preview =
    score !== 'NONE' && !notApplicableReason ? calculateScore(score, toVitals(value)) : null;
  const set = (patch: Partial<VitalsDraft>) => onChange({ ...value, ...patch });

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {NUMERIC.map(({ key, unit, step }) => {
          const points = preview?.points[key as keyof typeof preview.points];
          return (
            <div key={key} className="space-y-1.5">
              <label htmlFor={`${id}-${key}`} className="block text-[13px] font-medium text-ink">
                {VITAL_LABELS[key as keyof Vitals]}{' '}
                <span className="font-normal text-slate">({unit})</span>
              </label>
              <Input
                id={`${id}-${key}`}
                type="number"
                inputMode="decimal"
                step={step ?? '1'}
                aria-invalid={errors[key] ? true : undefined}
                className={cn(
                  'tabular',
                  points != null && points >= 2 && 'border-warning bg-warning/5',
                )}
                value={value[key] as string}
                onChange={(e) => set({ [key]: e.target.value } as Partial<VitalsDraft>)}
              />
              {errors[key] && <p className="text-xs font-medium text-critical">{errors[key]}</p>}
              {points != null && points > 0 && (
                <p className="text-xs text-slate">
                  Scores {points} on {score}
                </p>
              )}
            </div>
          );
        })}
        <div className="space-y-1.5">
          <label htmlFor={`${id}-o2`} className="block text-[13px] font-medium text-ink">
            On supplemental oxygen
          </label>
          <Select
            id={`${id}-o2`}
            value={value.onSupplementalOxygen}
            onChange={(e) =>
              set({ onSupplementalOxygen: e.target.value as VitalsDraft['onSupplementalOxygen'] })
            }
          >
            <option value="">Not recorded</option>
            <option value="no">No, room air</option>
            <option value="yes">Yes</option>
          </Select>
        </div>
        <div className="space-y-1.5">
          <label htmlFor={`${id}-avpu`} className="block text-[13px] font-medium text-ink">
            Level of consciousness
          </label>
          <Select
            id={`${id}-avpu`}
            value={value.consciousness}
            onChange={(e) => set({ consciousness: e.target.value as Consciousness | '' })}
          >
            <option value="">Not recorded</option>
            {CONSCIOUSNESS_LEVELS.map((c) => (
              <option key={c} value={c}>
                {CONSCIOUSNESS_LABELS[c]}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5 sm:col-span-2 lg:col-span-1">
          <label htmlFor={`${id}-notes`} className="block text-[13px] font-medium text-ink">
            Notes <span className="font-normal text-slate">(optional)</span>
          </label>
          <Input
            id={`${id}-notes`}
            value={value.notes}
            onChange={(e) => set({ notes: e.target.value })}
          />
        </div>
      </div>

      {score !== 'NONE' && (
        <div className="rounded-md border border-border bg-surface-subtle px-4 py-3 text-sm">
          {notApplicableReason ? (
            <p className="text-slate">{notApplicableReason}</p>
          ) : preview?.total != null ? (
            <div className="flex flex-wrap items-center gap-3">
              <ScoreChip
                score={{
                  type: preview.score,
                  total: preview.total,
                  band: preview.band,
                  points: preview.points,
                }}
              />
              <span className="text-xs text-slate">
                Supports clinical judgement; it does not set the urgency.
              </span>
            </div>
          ) : (
            <p className="text-slate">
              {score} will be calculated when all of these are recorded:{' '}
              {preview?.missing.map((m) => VITAL_LABELS[m].toLowerCase()).join(', ')}.
            </p>
          )}
        </div>
      )}
      {score === 'NONE' && (
        <Alert tone="info" title="No early-warning score is used in this network">
          Observations are shared with the receiving facility as recorded.
        </Alert>
      )}
    </div>
  );
}
