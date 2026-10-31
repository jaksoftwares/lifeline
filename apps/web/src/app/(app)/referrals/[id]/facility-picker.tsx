'use client';

import { MAX_RECEIVING_FACILITIES } from '@lifeline/domain';
import { type ReferralDetail } from '@lifeline/schemas';
import { Alert, Button, cn, Loading } from '@lifeline/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Car } from 'lucide-react';
import { useState } from 'react';
import { CapacityStatus, latestUpdate } from '@/components/capacity';
import { api, ApiError } from '@/lib/api';
import { formatAgo, formatMinutes } from '@/lib/format';
import { useFacilitySearch } from '@/lib/queries';

/**
 * Suggests facilities offering the services the patient needs, nearest first, with their current bed
 * reports. The referrer decides; nothing is chosen automatically.
 */
export function FacilityPicker({
  referral,
  mode,
}: {
  referral: ReferralDetail;
  mode: 'submit' | 'add';
}) {
  const queryClient = useQueryClient();
  const alreadySent = new Set(referral.requests.map((r) => r.institution.id));
  const openCount = referral.requests.filter(
    (r) => r.status === 'PENDING' || r.status === 'INFO_REQUESTED',
  ).length;
  const slots = MAX_RECEIVING_FACILITIES - openCount;
  const [selected, setSelected] = useState<string[]>([]);

  const results = useFacilitySearch(referral.networkId, {
    serviceIds: referral.requiredServices.map((s) => s.id),
    resourceIds: [],
    originId: referral.referringInstitution.id,
  });
  const candidates = (results.data ?? []).filter((r) => !alreadySent.has(r.facility.id));

  const send = useMutation({
    mutationFn: () =>
      api(
        mode === 'submit'
          ? `/referrals/${referral.id}/submit`
          : `/referrals/${referral.id}/requests`,
        {
          method: 'POST',
          body: { institutionIds: selected },
        },
      ),
    onSuccess: () => {
      setSelected([]);
      void queryClient.invalidateQueries({ queryKey: ['referral', referral.id] });
      void queryClient.invalidateQueries({ queryKey: ['referrals'] });
    },
  });
  const fieldErrors = send.error instanceof ApiError ? send.error.fieldErrors : {};

  const toggle = (id: string) =>
    setSelected((s) =>
      s.includes(id) ? s.filter((x) => x !== id) : s.length < slots ? [...s, id] : s,
    );

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate">
        {referral.requiredServices.length > 0
          ? `Facilities offering ${referral.requiredServices.map((s) => s.name.toLowerCase()).join(', ')}, nearest first.`
          : 'All facilities in the network, nearest first. Add the services needed to narrow this list.'}{' '}
        Choose up to {slots}. Each facility sees only its own request.
      </p>
      {send.isError && (
        <Alert tone="critical" title={send.error.message}>
          {Object.values(fieldErrors).join(' ')}
        </Alert>
      )}
      {results.isPending && <Loading label="Finding suitable facilities…" />}
      {results.data && candidates.length === 0 && (
        <Alert
          tone="warning"
          title="No other facility in the network offers all of these services."
        >
          Contact network operations for help placing this patient.
        </Alert>
      )}
      <ul className="space-y-2">
        {candidates.map((c) => {
          const checked = selected.includes(c.facility.id);
          const beds = c.capacity.filter((e) => e.resource.kind === 'BED');
          const latest = latestUpdate(c.capacity);
          return (
            <li key={c.facility.id}>
              <label
                className={cn(
                  'flex cursor-pointer gap-3 rounded-md border p-3',
                  checked
                    ? 'border-teal-deep bg-teal-soft'
                    : 'border-border hover:border-teal-deep',
                )}
              >
                <input
                  type="checkbox"
                  className="mt-1 size-4 accent-teal-deep"
                  checked={checked}
                  disabled={!checked && selected.length >= slots}
                  onChange={() => toggle(c.facility.id)}
                />
                <span className="min-w-0 flex-1 space-y-1.5">
                  <span className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-medium text-ink">
                      {c.facility.name}
                      <span className="ml-2 text-sm font-normal text-slate">
                        {c.facility.level ? `Level ${c.facility.level}` : ''}
                      </span>
                    </span>
                    {c.travelMinutes != null && (
                      <span className="inline-flex items-center gap-1 text-sm text-slate">
                        <Car aria-hidden className="size-4" />
                        <span className="tabular">
                          ≈ {formatMinutes(c.travelMinutes)} (estimate)
                        </span>
                      </span>
                    )}
                  </span>
                  {beds.length > 0 && (
                    <span className="flex flex-wrap gap-1.5">
                      {beds.map((b) => (
                        <span
                          key={b.resource.id}
                          className="inline-flex items-center gap-1 text-xs text-slate"
                        >
                          {b.resource.name}: <CapacityStatus entry={b} />
                        </span>
                      ))}
                    </span>
                  )}
                  {latest?.updatedAt && (
                    <span
                      className={cn(
                        'block text-xs',
                        latest.stale ? 'font-medium text-ink' : 'text-slate',
                      )}
                    >
                      Capacity reported {formatAgo(latest.updatedAt)}
                      {latest.stale && ' (out of date; call to confirm)'}
                    </span>
                  )}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      <Button
        size="lg"
        disabled={selected.length === 0 || send.isPending}
        onClick={() => send.mutate()}
      >
        {send.isPending
          ? 'Sending…'
          : selected.length === 0
            ? 'Choose at least one facility'
            : `Send to ${selected.length} ${selected.length === 1 ? 'facility' : 'facilities'}`}
      </Button>
    </div>
  );
}
