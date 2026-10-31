'use client';

import { formatAge, PREGNANCY_LABELS, SEX_LABELS } from '@lifeline/domain';
import { type ReferralDetail } from '@lifeline/schemas';
import { Alert, Button, Card, CardBody, CardHeader, Input, Loading } from '@lifeline/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { type ReactNode, useState } from 'react';
import { PageHeader } from '@/components/app-shell';
import { ReferralStatusChip, UrgencyChip } from '@/components/referral-chips';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { useReferral } from '@/lib/queries';
import { Attachments } from './attachments';
import { FacilityPicker } from './facility-picker';
import { History } from './history';
import { Observations } from './observations';
import { RequestThread } from './request-thread';
import { RespondPanel } from './respond-panel';

export default function ReferralPage() {
  const { id } = useParams<{ id: string }>();
  const params = useSearchParams();
  const referral = useReferral(id);

  if (referral.isPending) return <Loading label="Loading referral information…" />;
  if (referral.isError) {
    return (
      <Alert tone="critical" title="We couldn’t load this referral">
        {referral.error.message} Try again or contact your administrator if the issue continues.
      </Alert>
    );
  }
  const r = referral.data;
  const p = r.patient;

  return (
    <>
      <Link
        href="/referrals"
        className="mb-3 inline-flex items-center gap-1 text-sm text-teal-deep hover:underline"
      >
        <ArrowLeft aria-hidden className="size-4" /> Referrals
      </Link>
      <PageHeader
        title={p.fullName ?? 'Unidentified patient'}
        description={`${r.reference} · ${SEX_LABELS[p.sex]}, ${formatAge(p.ageYears)} · from ${r.referringInstitution.name}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <UrgencyChip urgency={r.urgency} />
            <ReferralStatusChip status={r.status} />
          </div>
        }
      />

      <div className="space-y-6">
        {params.get('observations') === 'failed' && (
          <Alert tone="warning" title="The referral was saved, but the observations were not">
            Check the values and record them again below.
          </Alert>
        )}
        <NextStep referral={r} />

        <div className="grid gap-6 xl:grid-cols-3">
          <div className="space-y-6 xl:col-span-2">
            <ClinicalDetails referral={r} />
            <Observations referral={r} />
            {r.requests.length > 0 && (
              <section aria-labelledby="facilities-heading" className="space-y-3">
                <h2 id="facilities-heading" className="font-display text-lg font-bold">
                  {r.viewer.isReferrer || r.requests.length > 1
                    ? 'Receiving facilities'
                    : 'Your facility’s request'}
                </h2>
                {r.requests.map((q) => (
                  <RequestThread
                    key={q.id}
                    referralId={r.id}
                    request={q}
                    canMessage={r.viewer.messageableRequestIds.includes(q.id)}
                    isReferrer={r.viewer.isReferrer}
                    referringInstitutionId={r.referringInstitution.id}
                  />
                ))}
              </section>
            )}
          </div>
          <div className="space-y-6">
            <PatientCard referral={r} />
            <Attachments
              referral={r}
              canUpload={
                r.status !== 'CANCELLED' &&
                (r.viewer.isReferrer || r.viewer.messageableRequestIds.length > 0)
              }
            />
            <History events={r.events} />
          </div>
        </div>

        {r.viewer.isReferrer && r.status !== 'CANCELLED' && <CancelReferral referralId={r.id} />}
      </div>
    </>
  );
}

/** The one thing the viewer should do next, at the top of the page. */
function NextStep({ referral: r }: { referral: ReferralDetail }) {
  const respondable = r.requests.find(
    (q) =>
      r.viewer.respondableRequestIds.includes(q.id) &&
      (q.status === 'PENDING' || q.status === 'INFO_REQUESTED'),
  );
  const accepted = r.requests.find((q) => q.status === 'ACCEPTED');
  const anyOpen = r.requests.some((q) => q.status === 'PENDING' || q.status === 'INFO_REQUESTED');
  const [adding, setAdding] = useState(false);

  if (r.status === 'CANCELLED') {
    return (
      <Alert
        tone="neutral"
        title={`Cancelled ${r.cancelledAt ? formatDateTime(r.cancelledAt) : ''}`}
      >
        {r.cancelReason}
      </Alert>
    );
  }
  if (r.status === 'DRAFT' && r.viewer.isReferrer) {
    return (
      <ActionCard
        title="Send this referral"
        description="Choose which facilities to ask. The first to accept receives the patient."
      >
        <FacilityPicker referral={r} mode="submit" />
      </ActionCard>
    );
  }
  if (r.status === 'SUBMITTED' && respondable) {
    return (
      <ActionCard
        title="Respond to this referral"
        description="Your answer is sent to the referring facility straight away."
      >
        <RespondPanel referralId={r.id} request={respondable} />
      </ActionCard>
    );
  }
  if (r.status === 'ACCEPTED' && accepted) {
    return (
      <Alert tone="success" title={`Accepted by ${accepted.institution.name}`}>
        {accepted.receivingDepartment && `${accepted.receivingDepartment.name}. `}
        {accepted.readyAt && `Ready from ${formatDateTime(accepted.readyAt)}. `}
        Transport arrangements are added in the next release.
      </Alert>
    );
  }
  if (r.status === 'SUBMITTED' && r.viewer.isReferrer) {
    if (!anyOpen) {
      return (
        <ActionCard
          title="No facility has accepted yet"
          description="Every facility asked has declined or been withdrawn. Choose others to ask."
        >
          <FacilityPicker referral={r} mode="add" />
        </ActionCard>
      );
    }
    return adding ? (
      <ActionCard
        title="Ask another facility"
        description="The facilities already asked keep their requests."
      >
        <FacilityPicker referral={r} mode="add" />
      </ActionCard>
    ) : (
      <Alert tone="info" title="Awaiting receiving-facility response">
        <button
          type="button"
          className="text-teal-deep hover:underline"
          onClick={() => setAdding(true)}
        >
          Ask another facility as well
        </button>
      </Alert>
    );
  }
  return null;
}

function ActionCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <Card className="border-teal-deep shadow-[inset_4px_0_0_var(--color-teal-deep)]">
      <CardHeader title={title} description={description} />
      <CardBody>{children}</CardBody>
    </Card>
  );
}

function ClinicalDetails({ referral: r }: { referral: ReferralDetail }) {
  const rows: [string, string | null][] = [
    ['Reason for referral', r.reason],
    ['Clinical summary', r.clinicalSummary],
    ['Provisional diagnosis', r.provisionalDiagnosis],
    ['Treatment given', r.treatmentGiven],
    ['Allergies', r.allergies],
  ];
  return (
    <Card>
      <CardHeader
        title="Clinical details"
        description={`Referred by ${r.createdBy.fullName}, ${r.referringInstitution.name}${r.submittedAt ? ` · sent ${formatDateTime(r.submittedAt)}` : ''}`}
      />
      <CardBody>
        <dl className="space-y-3 text-sm">
          {rows.map(([label, value]) => (
            <div key={label}>
              <dt className="text-[13px] font-medium text-slate">{label}</dt>
              <dd className="whitespace-pre-wrap text-ink">{value ?? '—'}</dd>
            </div>
          ))}
          {r.requiredServices.length > 0 && (
            <div>
              <dt className="text-[13px] font-medium text-slate">Services needed</dt>
              <dd className="mt-1 flex flex-wrap gap-1.5">
                {r.requiredServices.map((s) => (
                  <span
                    key={s.id}
                    className="rounded-pill bg-surface-blue px-2.5 py-0.5 text-xs font-medium text-ink"
                  >
                    {s.name}
                  </span>
                ))}
              </dd>
            </div>
          )}
        </dl>
      </CardBody>
    </Card>
  );
}

function PatientCard({ referral: r }: { referral: ReferralDetail }) {
  const p = r.patient;
  const rows: [string, string | null][] = [
    ['Date of birth', p.dateOfBirth],
    ['Age', formatAge(p.ageYears)],
    [
      'Pregnancy',
      r.pregnancyStatus
        ? `${PREGNANCY_LABELS[r.pregnancyStatus]}${r.gestationWeeks ? `, ${r.gestationWeeks} weeks` : ''}`
        : null,
    ],
    ['National ID', p.nationalId],
    ['SHA number', p.shaNumber],
    ['Hospital number', p.hospitalNumber],
    [
      'Next of kin',
      p.nextOfKinName
        ? `${p.nextOfKinName}${p.nextOfKinPhone ? `, ${p.nextOfKinPhone}` : ''}`
        : null,
    ],
  ];
  return (
    <Card>
      <CardHeader title="Patient" />
      <CardBody>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
          {rows
            .filter(([, v]) => v)
            .map(([label, value]) => (
              <div key={label} className="contents">
                <dt className="text-slate">{label}</dt>
                <dd className="tabular text-ink">{value}</dd>
              </div>
            ))}
        </dl>
        {r.referringInstitution.phone && (
          <p className="mt-3 text-sm">
            Referring facility:{' '}
            <a
              href={`tel:${r.referringInstitution.phone}`}
              className="tabular text-teal-deep hover:underline"
            >
              {r.referringInstitution.phone}
            </a>
          </p>
        )}
      </CardBody>
    </Card>
  );
}

function CancelReferral({ referralId }: { referralId: string }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const cancel = useMutation({
    mutationFn: () => api(`/referrals/${referralId}/cancel`, { method: 'POST', body: { reason } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['referral', referralId] });
      void queryClient.invalidateQueries({ queryKey: ['referrals'] });
    },
  });
  if (!open) {
    return (
      <button
        type="button"
        className="text-sm text-slate hover:text-ink hover:underline"
        onClick={() => setOpen(true)}
      >
        Cancel this referral
      </button>
    );
  }
  return (
    <form
      className="flex max-w-xl flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        cancel.mutate();
      }}
    >
      <label className="min-w-64 flex-1 text-[13px] font-medium text-ink">
        Why is the referral being cancelled?
        <Input
          className="mt-1"
          required
          minLength={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </label>
      <Button type="submit" variant="secondary" disabled={cancel.isPending}>
        Cancel referral
      </Button>
      <Button variant="ghost" onClick={() => setOpen(false)}>
        Keep referral
      </Button>
      {cancel.isError && <p className="w-full text-xs text-critical">{cancel.error.message}</p>}
    </form>
  );
}
