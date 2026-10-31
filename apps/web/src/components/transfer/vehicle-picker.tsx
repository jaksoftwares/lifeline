'use client';

import { CAPABILITY_LABELS } from '@lifeline/domain';
import { type TransferDetail } from '@lifeline/schemas';
import { Alert, Button, cn, Field, Input, Loading } from '@lifeline/ui';
import { useMutation } from '@tanstack/react-query';
import { AlertTriangle, Check } from 'lucide-react';
import { useState } from 'react';
import { api } from '@/lib/api';
import { useTransferSuggestions } from '@/lib/queries';
import { useTransferInvalidation } from './transfer-panel';

/**
 * Ranked vehicles with the reasons for each, and the vehicles left out with why. The arranger chooses
 * one; the platform never picks.
 */
export function VehiclePicker({ transfer }: { transfer: TransferDetail }) {
  const invalidate = useTransferInvalidation(transfer);
  const result = useTransferSuggestions(transfer.id, true);
  const [vehicleId, setVehicleId] = useState('');
  const [note, setNote] = useState('');

  const offer = useMutation({
    mutationFn: () =>
      api(`/transfers/${transfer.id}/offers`, { method: 'POST', body: { vehicleId, note } }),
    onSuccess: () => {
      setVehicleId('');
      setNote('');
      invalidate();
    },
  });

  if (result.isPending) return <Loading label="Finding suitable ambulances…" />;
  if (result.isError) return <Alert tone="critical" title={result.error.message} />;
  const { suggestions, excluded, staleAfterMinutes } = result.data;
  const chosen = suggestions.find((s) => s.vehicle.id === vehicleId);

  return (
    <div className="space-y-4">
      {suggestions.length === 0 ? (
        <Alert tone="warning" title="No suitable ambulance is available on Lifeline right now">
          Call the providers below to check, record transport arranged another way, or ask network
          operations for help. They can see that this transfer is waiting.
        </Alert>
      ) : (
        <fieldset>
          <legend className="sr-only">Suggested ambulances</legend>
          <ul className="space-y-2">
            {suggestions.map((s, index) => {
              const checked = vehicleId === s.vehicle.id;
              return (
                <li key={s.vehicle.id}>
                  <label
                    className={cn(
                      'flex cursor-pointer gap-3 rounded-md border p-3',
                      checked
                        ? 'border-teal-deep bg-teal-soft'
                        : 'border-border hover:border-teal-deep',
                    )}
                  >
                    <input
                      type="radio"
                      name="vehicle"
                      className="mt-1 size-4 accent-teal-deep"
                      checked={checked}
                      onChange={() => setVehicleId(s.vehicle.id)}
                    />
                    <span className="min-w-0 flex-1 space-y-1.5">
                      <span className="flex flex-wrap items-baseline justify-between gap-2">
                        <span className="font-medium text-ink">
                          {s.vehicle.registration}
                          {s.vehicle.callSign && (
                            <span className="font-normal text-slate"> ({s.vehicle.callSign})</span>
                          )}
                          <span className="ml-2 text-sm font-normal text-slate">
                            {s.provider.name}
                          </span>
                        </span>
                        {s.etaMinutes != null && (
                          <span className="tabular text-sm font-medium text-ink">
                            ≈ {s.etaMinutes} min{index === 0 && ' · quickest'}
                          </span>
                        )}
                      </span>
                      <ul className="space-y-0.5 text-xs text-slate">
                        {s.reasons.map((r) => (
                          <li key={r} className="flex gap-1.5">
                            <Check aria-hidden className="mt-px size-3.5 shrink-0 text-success" />
                            {r}
                          </li>
                        ))}
                        {s.cautions.map((c) => (
                          <li key={c} className="flex gap-1.5 font-medium text-ink">
                            <AlertTriangle
                              aria-hidden
                              className="mt-px size-3.5 shrink-0 text-warning"
                            />
                            {c}
                          </li>
                        ))}
                      </ul>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </fieldset>
      )}

      {excluded.length > 0 && (
        <details className="rounded-md border border-border px-3 py-2 text-sm">
          <summary className="cursor-pointer text-slate">
            {excluded.length} {excluded.length === 1 ? 'vehicle' : 'vehicles'} not suggested, and
            why
          </summary>
          <ul className="mt-2 space-y-1.5">
            {excluded.map((e) => (
              <li key={e.vehicle.id}>
                <span className="font-medium text-ink">{e.vehicle.registration}</span>{' '}
                <span className="text-slate">
                  {e.provider.name} · {CAPABILITY_LABELS[e.vehicle.capability]}
                </span>
                <span className="block text-xs text-slate">{e.reasons.join('; ')}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-slate">
            Availability not confirmed by the provider in the last {staleAfterMinutes / 60} hours
            counts as out of date.
          </p>
        </details>
      )}

      {suggestions.length > 0 && (
        <>
          <Field label="Note to the provider" optional>
            {(p) => (
              <Input
                {...p}
                placeholder="e.g. Patient on the ground floor, side entrance"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            )}
          </Field>
          {offer.isError && <Alert tone="critical" title={offer.error.message} />}
          <Button size="lg" disabled={!chosen || offer.isPending} onClick={() => offer.mutate()}>
            {offer.isPending
              ? 'Sending…'
              : chosen
                ? `Offer to ${chosen.provider.name} (${chosen.vehicle.registration})`
                : 'Choose an ambulance'}
          </Button>
          <p className="text-xs text-slate">
            Times are estimates from straight-line distance until live routing is added.
          </p>
        </>
      )}
    </div>
  );
}
