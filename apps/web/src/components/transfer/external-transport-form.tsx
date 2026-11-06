'use client';

import {
  EXTERNAL_TRANSPORT_LABELS,
  EXTERNAL_TRANSPORT_SERVICES,
  type ExternalTransportService,
} from '@lifeline/domain';
import { type TransferDetail } from '@lifeline/schemas';
import { Alert, Button, Field, Input, Select } from '@lifeline/ui';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useTransferInvalidation } from './use-transfer-invalidation';

/** Transport arranged by phone outside Lifeline, recorded so everyone sees how the patient travels. */
export function ExternalTransportForm({
  transfer,
  onCancel,
}: {
  transfer: TransferDetail;
  onCancel: () => void;
}) {
  const invalidate = useTransferInvalidation(transfer);
  const [service, setService] = useState<ExternalTransportService>('NATIONAL_922');
  const [providerName, setProviderName] = useState('');
  const [vehicleRegistration, setVehicleRegistration] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [note, setNote] = useState('');

  const save = useMutation({
    mutationFn: () =>
      api(`/transfers/${transfer.id}/external`, {
        method: 'POST',
        body: { service, providerName, vehicleRegistration, contactPhone, note },
      }),
    onSuccess: invalidate,
  });
  const errors = save.error instanceof ApiError ? save.error.fieldErrors : {};

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      {save.isError && !Object.keys(errors).length && (
        <Alert tone="critical" title={save.error.message} />
      )}
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Arranged through">
          {(p) => (
            <Select
              {...p}
              value={service}
              onChange={(e) => setService(e.target.value as ExternalTransportService)}
            >
              {EXTERNAL_TRANSPORT_SERVICES.map((s) => (
                <option key={s} value={s}>
                  {EXTERNAL_TRANSPORT_LABELS[s]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Provider" optional={service !== 'OTHER'} error={errors.providerName}>
          {(p) => (
            <Input
              {...p}
              required={service === 'OTHER'}
              placeholder="e.g. Kiambu County ambulance"
              value={providerName}
              onChange={(e) => setProviderName(e.target.value)}
            />
          )}
        </Field>
        <Field label="Vehicle registration" optional error={errors.vehicleRegistration}>
          {(p) => (
            <Input
              {...p}
              value={vehicleRegistration}
              onChange={(e) => setVehicleRegistration(e.target.value)}
            />
          )}
        </Field>
        <Field
          label="Contact number"
          optional
          hint="Format +254XXXXXXXXX"
          error={errors.contactPhone}
        >
          {(p) => (
            <Input
              {...p}
              type="tel"
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
            />
          )}
        </Field>
        <Field label="Note" optional className="md:col-span-2" error={errors.note}>
          {(p) => <Input {...p} value={note} onChange={(e) => setNote(e.target.value)} />}
        </Field>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={save.isPending}>
          Record transport
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Back to suggestions
        </Button>
      </div>
    </form>
  );
}
