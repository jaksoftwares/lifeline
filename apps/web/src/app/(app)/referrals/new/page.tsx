'use client';

import {
  AGE_UNITS,
  type AgeUnit,
  ageInYears,
  PREGNANCY_LABELS,
  PREGNANCY_STATUSES,
  type PregnancyStatus,
  scoreNotApplicableReason,
  SEX_LABELS,
  SEXES,
  type Sex,
  URGENCIES,
  URGENCY_DESCRIPTIONS,
  URGENCY_LABELS,
  type Urgency,
} from '@lifeline/domain';
import { type CreateReferralInput } from '@lifeline/schemas';
import {
  Alert,
  Button,
  Card,
  CardBody,
  CardHeader,
  cn,
  Field,
  Input,
  Select,
  Textarea,
} from '@lifeline/ui';
import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { PageHeader } from '@/components/app-shell';
import {
  EMPTY_VITALS,
  hasAnyVital,
  toVitalsInput,
  type VitalsDraft,
  VitalsFields,
} from '@/components/vitals-form';
import { api, ApiError } from '@/lib/api';
import { useCatalogue } from '@/lib/queries';
import { useSession } from '@/lib/session';

const AGE_UNIT_LABELS: Record<AgeUnit, string> = { YEARS: 'years', MONTHS: 'months', DAYS: 'days' };

export default function NewReferralPage() {
  const router = useRouter();
  const { user, network, scopeFor } = useSession();
  const catalogue = useCatalogue(network.id);
  const scope = scopeFor('referral:create');
  const facilities = user.memberships
    .filter((m) => m.network.id === network.id && m.institution?.type === 'FACILITY')
    .map((m) => m.institution!)
    .filter((inst, i, all) => all.findIndex((x) => x.id === inst.id) === i)
    .filter((inst) => scope === 'ALL' || scope.includes(inst.id));

  const [facilityId, setFacilityId] = useState(facilities[0]?.id ?? '');
  const [fullName, setFullName] = useState('');
  const [sex, setSex] = useState<Sex | ''>('');
  const [ageMode, setAgeMode] = useState<'dob' | 'estimate'>('dob');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [estimatedAge, setEstimatedAge] = useState('');
  const [estimatedAgeUnit, setEstimatedAgeUnit] = useState<AgeUnit>('YEARS');
  const [nationalId, setNationalId] = useState('');
  const [shaNumber, setShaNumber] = useState('');
  const [hospitalNumber, setHospitalNumber] = useState('');
  const [nextOfKinName, setNextOfKinName] = useState('');
  const [nextOfKinPhone, setNextOfKinPhone] = useState('');
  const [pregnancyStatus, setPregnancyStatus] = useState<PregnancyStatus | ''>('');
  const [gestationWeeks, setGestationWeeks] = useState('');
  const [reason, setReason] = useState('');
  const [clinicalSummary, setClinicalSummary] = useState('');
  const [provisionalDiagnosis, setProvisionalDiagnosis] = useState('');
  const [treatmentGiven, setTreatmentGiven] = useState('');
  const [allergies, setAllergies] = useState('');
  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const [urgency, setUrgency] = useState<Urgency | ''>('');
  const [vitals, setVitals] = useState<VitalsDraft>(EMPTY_VITALS);

  const showPregnancy = sex !== 'MALE';
  const effectivePregnancy: PregnancyStatus | null =
    sex === 'MALE' ? 'NOT_APPLICABLE' : pregnancyStatus || null;
  const ageYears = ageInYears({
    dateOfBirth: ageMode === 'dob' && dateOfBirth ? dateOfBirth : null,
    estimatedAge: ageMode === 'estimate' && estimatedAge ? Number(estimatedAge) : null,
    estimatedAgeUnit: ageMode === 'estimate' ? estimatedAgeUnit : null,
  });
  const score = catalogue.data?.earlyWarningScore ?? 'NONE';
  const notApplicable =
    score === 'NONE'
      ? null
      : scoreNotApplicableReason({ ageYears, pregnancyStatus: effectivePregnancy });

  const create = useMutation({
    mutationFn: async () => {
      const input: CreateReferralInput = {
        referringInstitutionId: facilityId,
        patient: {
          fullName,
          sex: sex as Sex,
          dateOfBirth: ageMode === 'dob' && dateOfBirth ? dateOfBirth : null,
          estimatedAge: ageMode === 'estimate' && estimatedAge ? Number(estimatedAge) : null,
          estimatedAgeUnit: ageMode === 'estimate' && estimatedAge ? estimatedAgeUnit : null,
          nationalId,
          shaNumber,
          hospitalNumber,
          nextOfKinName,
          nextOfKinPhone: nextOfKinPhone.trim() || null,
        },
        pregnancyStatus: effectivePregnancy,
        gestationWeeks:
          pregnancyStatus === 'PREGNANT' && gestationWeeks ? Number(gestationWeeks) : null,
        reason,
        clinicalSummary,
        provisionalDiagnosis,
        treatmentGiven,
        allergies,
        urgency: urgency || null,
        requiredServiceIds: serviceIds,
      };
      const created = await api<{ id: string }>('/referrals', { method: 'POST', body: input });
      if (hasAnyVital(vitals)) {
        // The draft already exists; don't let an observation error tempt a second save that duplicates it.
        try {
          await api(`/referrals/${created.id}/assessments`, {
            method: 'POST',
            body: toVitalsInput(vitals),
          });
        } catch {
          return { ...created, observationsFailed: true };
        }
      }
      return { ...created, observationsFailed: false };
    },
    onSuccess: (created) =>
      router.push(
        `/referrals/${created.id}${created.observationsFailed ? '?observations=failed' : ''}`,
      ),
  });
  const errors = create.error instanceof ApiError ? create.error.fieldErrors : {};
  const err = (path: string) => errors[path] ?? errors[`patient.${path}`];

  if (facilities.length === 0) {
    return <Alert tone="warning" title="You can’t start referrals in this network." />;
  }

  return (
    <>
      <PageHeader
        title="New referral"
        description="Record the patient and why they need transfer. Next you’ll choose which facilities to send it to."
      />
      <form
        className="space-y-6"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        {create.isError && (
          <Alert tone="critical" title={create.error.message}>
            {Object.keys(errors).length > 0 && 'Check the highlighted fields.'}
          </Alert>
        )}

        {facilities.length > 1 && (
          <Card>
            <CardBody>
              <Field label="Referring facility">
                {(p) => (
                  <Select {...p} value={facilityId} onChange={(e) => setFacilityId(e.target.value)}>
                    {facilities.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            </CardBody>
          </Card>
        )}

        <Card>
          <CardHeader
            title="Patient"
            description="Only what the receiving facility needs to identify and prepare for the patient."
          />
          <CardBody className="grid gap-4 md:grid-cols-2">
            <Field
              label="Full name"
              optional
              hint="Leave blank if the patient is unidentified."
              error={err('fullName')}
            >
              {(p) => (
                <Input
                  {...p}
                  autoComplete="off"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                />
              )}
            </Field>
            <Field label="Sex" error={err('sex')}>
              {(p) => (
                <Select {...p} required value={sex} onChange={(e) => setSex(e.target.value as Sex)}>
                  <option value="" disabled>
                    Select
                  </option>
                  {SEXES.map((s) => (
                    <option key={s} value={s}>
                      {SEX_LABELS[s]}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <fieldset className="space-y-2 md:col-span-2">
              <legend className="text-[13px] font-medium text-ink">Age</legend>
              <div className="flex flex-wrap gap-4 text-sm">
                {(
                  [
                    ['dob', 'Date of birth known'],
                    ['estimate', 'Estimate age'],
                  ] as const
                ).map(([mode, label]) => (
                  <label key={mode} className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="age-mode"
                      className="size-4 accent-teal-deep"
                      checked={ageMode === mode}
                      onChange={() => setAgeMode(mode)}
                    />
                    {label}
                  </label>
                ))}
              </div>
              {ageMode === 'dob' ? (
                <Field label="Date of birth" error={err('dateOfBirth')} className="max-w-xs">
                  {(p) => (
                    <Input
                      {...p}
                      type="date"
                      value={dateOfBirth}
                      onChange={(e) => setDateOfBirth(e.target.value)}
                    />
                  )}
                </Field>
              ) : (
                <div className="flex max-w-xs items-end gap-2">
                  <Field label="Estimated age" error={err('estimatedAge')} className="flex-1">
                    {(p) => (
                      <Input
                        {...p}
                        type="number"
                        min={0}
                        inputMode="numeric"
                        value={estimatedAge}
                        onChange={(e) => setEstimatedAge(e.target.value)}
                      />
                    )}
                  </Field>
                  <Select
                    aria-label="Age unit"
                    className="w-28"
                    value={estimatedAgeUnit}
                    onChange={(e) => setEstimatedAgeUnit(e.target.value as AgeUnit)}
                  >
                    {AGE_UNITS.map((u) => (
                      <option key={u} value={u}>
                        {AGE_UNIT_LABELS[u]}
                      </option>
                    ))}
                  </Select>
                </div>
              )}
            </fieldset>
            <Field label="National ID number" optional error={err('nationalId')}>
              {(p) => (
                <Input
                  {...p}
                  autoComplete="off"
                  value={nationalId}
                  onChange={(e) => setNationalId(e.target.value)}
                />
              )}
            </Field>
            <Field label="SHA number" optional error={err('shaNumber')}>
              {(p) => (
                <Input
                  {...p}
                  autoComplete="off"
                  value={shaNumber}
                  onChange={(e) => setShaNumber(e.target.value)}
                />
              )}
            </Field>
            <Field label="Hospital number at your facility" optional error={err('hospitalNumber')}>
              {(p) => (
                <Input
                  {...p}
                  value={hospitalNumber}
                  onChange={(e) => setHospitalNumber(e.target.value)}
                />
              )}
            </Field>
            <div className="grid gap-4 sm:grid-cols-2 md:col-span-2">
              <Field label="Next of kin" optional error={err('nextOfKinName')}>
                {(p) => (
                  <Input
                    {...p}
                    value={nextOfKinName}
                    onChange={(e) => setNextOfKinName(e.target.value)}
                  />
                )}
              </Field>
              <Field
                label="Next of kin phone"
                optional
                hint="Format: +254XXXXXXXXX"
                error={err('nextOfKinPhone')}
              >
                {(p) => (
                  <Input
                    {...p}
                    type="tel"
                    value={nextOfKinPhone}
                    onChange={(e) => setNextOfKinPhone(e.target.value)}
                  />
                )}
              </Field>
            </div>
            {showPregnancy && (
              <div className="grid gap-4 sm:grid-cols-2 md:col-span-2">
                <Field
                  label="Pregnancy"
                  hint="Affects which early-warning chart applies."
                  error={errors.pregnancyStatus}
                >
                  {(p) => (
                    <Select
                      {...p}
                      value={pregnancyStatus}
                      onChange={(e) => setPregnancyStatus(e.target.value as PregnancyStatus)}
                    >
                      <option value="">Not recorded</option>
                      {PREGNANCY_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {PREGNANCY_LABELS[s]}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
                {pregnancyStatus === 'PREGNANT' && (
                  <Field label="Gestation (weeks)" optional error={errors.gestationWeeks}>
                    {(p) => (
                      <Input
                        {...p}
                        type="number"
                        min={1}
                        max={45}
                        value={gestationWeeks}
                        onChange={(e) => setGestationWeeks(e.target.value)}
                      />
                    )}
                  </Field>
                )}
              </div>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Clinical details" />
          <CardBody className="grid gap-4 md:grid-cols-2">
            <Field label="Reason for referral" className="md:col-span-2" error={errors.reason}>
              {(p) => (
                <Textarea
                  {...p}
                  rows={2}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              )}
            </Field>
            <Field
              label="Clinical summary"
              hint="History, examination findings and relevant results."
              className="md:col-span-2"
              error={errors.clinicalSummary}
            >
              {(p) => (
                <Textarea
                  {...p}
                  rows={5}
                  value={clinicalSummary}
                  onChange={(e) => setClinicalSummary(e.target.value)}
                />
              )}
            </Field>
            <Field label="Provisional diagnosis" optional error={errors.provisionalDiagnosis}>
              {(p) => (
                <Input
                  {...p}
                  value={provisionalDiagnosis}
                  onChange={(e) => setProvisionalDiagnosis(e.target.value)}
                />
              )}
            </Field>
            <Field label="Allergies" optional error={errors.allergies}>
              {(p) => (
                <Input {...p} value={allergies} onChange={(e) => setAllergies(e.target.value)} />
              )}
            </Field>
            <Field
              label="Treatment given so far"
              optional
              className="md:col-span-2"
              error={errors.treatmentGiven}
            >
              {(p) => (
                <Textarea
                  {...p}
                  rows={2}
                  value={treatmentGiven}
                  onChange={(e) => setTreatmentGiven(e.target.value)}
                />
              )}
            </Field>
            <fieldset className="md:col-span-2">
              <legend className="text-[13px] font-medium text-ink">
                Services the patient needs
              </legend>
              <p className="mb-2 text-xs text-slate">
                Used to suggest suitable receiving facilities.
              </p>
              <div className="flex flex-wrap gap-1.5">
                {catalogue.data?.services.map((s) => {
                  const pressed = serviceIds.includes(s.id);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      aria-pressed={pressed}
                      onClick={() =>
                        setServiceIds(
                          pressed ? serviceIds.filter((x) => x !== s.id) : [...serviceIds, s.id],
                        )
                      }
                      className={cn(
                        'rounded-pill border px-2.5 py-1 text-xs font-medium',
                        pressed
                          ? 'border-teal-deep bg-teal-soft text-teal-deep'
                          : 'border-border-strong bg-surface text-slate hover:border-teal-deep hover:text-ink',
                      )}
                    >
                      {s.name}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Observations"
            description="Optional now; you can add more at any time. Recorded at the time you save."
          />
          <CardBody>
            <VitalsFields
              value={vitals}
              onChange={setVitals}
              score={score}
              notApplicableReason={notApplicable}
              errors={errors}
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Urgency"
            description="Your clinical judgement. Required before the referral is sent."
          />
          <CardBody>
            <fieldset>
              <legend className="sr-only">Urgency</legend>
              <div className="grid gap-3 md:grid-cols-3">
                {URGENCIES.map((u) => (
                  <label
                    key={u}
                    className={cn(
                      'flex cursor-pointer gap-3 rounded-md border p-4',
                      urgency === u
                        ? 'border-teal-deep bg-teal-soft'
                        : 'border-border hover:border-teal-deep',
                    )}
                  >
                    <input
                      type="radio"
                      name="urgency"
                      className="mt-0.5 size-4 accent-teal-deep"
                      checked={urgency === u}
                      onChange={() => setUrgency(u)}
                    />
                    <span>
                      <span className="block font-medium text-ink">{URGENCY_LABELS[u]}</span>
                      <span className="block text-sm text-slate">{URGENCY_DESCRIPTIONS[u]}</span>
                    </span>
                  </label>
                ))}
              </div>
              {errors.urgency && (
                <p className="mt-2 text-xs font-medium text-critical">{errors.urgency}</p>
              )}
            </fieldset>
          </CardBody>
        </Card>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" size="lg" disabled={create.isPending || !sex}>
            {create.isPending ? 'Saving…' : 'Save and choose facilities'}
          </Button>
          <p className="text-sm text-slate">The referral is saved as a draft until you send it.</p>
        </div>
      </form>
    </>
  );
}
