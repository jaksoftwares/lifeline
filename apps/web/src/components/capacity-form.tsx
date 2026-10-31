'use client';

import {
  AVAILABILITY_LABELS,
  AVAILABILITY_STATUSES,
  type AvailabilityStatus,
  capacityReportProblem,
  RESOURCE_KIND_LABELS,
  type ResourceKind,
} from '@lifeline/domain';
import { type CapacityEntry, type CapacityUpdateInput } from '@lifeline/schemas';
import { Alert, Button, Input, Select } from '@lifeline/ui';
import { useMutation } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { Freshness } from './capacity';

interface Row {
  resourceId: string;
  status: AvailabilityStatus | '';
  available: string;
  total: string;
  note: string;
}

const toRow = (entry: CapacityEntry): Row => ({
  resourceId: entry.resource.id,
  status: entry.status ?? '',
  available: entry.available?.toString() ?? '',
  total: entry.total?.toString() ?? '',
  note: entry.note ?? '',
});

const toNumber = (v: string) => (v.trim() === '' ? null : Number(v));

/**
 * Every item is submitted on save, so unchanged figures are confirmed as current and their
 * "last updated" time moves forward. That is how staff keep capacity from going stale.
 */
export function CapacityForm({
  institutionId,
  capacity,
  onSaved,
}: {
  institutionId: string;
  capacity: CapacityEntry[];
  onSaved: (capacity: CapacityEntry[]) => void;
}) {
  const [rows, setRows] = useState<Row[]>(() => capacity.map(toRow));
  const [touched, setTouched] = useState(false);
  const formId = useId();

  const save = useMutation({
    mutationFn: (input: CapacityUpdateInput) =>
      api<CapacityEntry[]>(`/institutions/${institutionId}/capacity`, {
        method: 'POST',
        body: input,
      }),
    onSuccess: (updated) => {
      setRows(updated.map(toRow));
      setTouched(false);
      onSaved(updated);
    },
  });
  const serverErrors = save.error instanceof ApiError ? save.error.fieldErrors : {};

  const kindOf = (resourceId: string): ResourceKind =>
    capacity.find((c) => c.resource.id === resourceId)!.resource.kind;
  const problems = rows.map((row) => {
    if (!row.status) return 'Choose a status.';
    return capacityReportProblem(kindOf(row.resourceId), {
      status: row.status,
      available: toNumber(row.available),
      total: toNumber(row.total),
    });
  });

  function update(index: number, patch: Partial<Row>) {
    setTouched(true);
    setRows((current) =>
      current.map((row, i) => {
        if (i !== index) return row;
        const next = { ...row, ...patch };
        // Keep bed status in step with the free count as people type.
        if (patch.available !== undefined && kindOf(row.resourceId) === 'BED') {
          const free = toNumber(patch.available);
          if (free === 0) next.status = 'UNAVAILABLE';
          else if (free !== null && free > 0 && (row.status === 'UNAVAILABLE' || row.status === ''))
            next.status = 'AVAILABLE';
        }
        return next;
      }),
    );
  }

  if (capacity.length === 0) {
    return (
      <p className="text-sm text-slate">
        No capacity items are set up for this facility yet. A facility administrator can choose them
        under Facility settings.
      </p>
    );
  }

  const kinds: ResourceKind[] = ['BED', 'EQUIPMENT', 'SPECIALIST'];

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setTouched(true);
        if (problems.some(Boolean)) return;
        save.mutate({
          reports: rows.map((row) => ({
            resourceId: row.resourceId,
            status: row.status as AvailabilityStatus,
            available: kindOf(row.resourceId) === 'BED' ? toNumber(row.available) : null,
            total: kindOf(row.resourceId) === 'BED' ? toNumber(row.total) : null,
            note: row.note,
          })),
        });
      }}
      className="space-y-6"
    >
      {save.isSuccess && !touched && (
        <Alert tone="success" title="Capacity saved. All items are now confirmed as current." />
      )}
      {save.isError && !Object.keys(serverErrors).length && (
        <Alert tone="critical" title={save.error.message} />
      )}

      {kinds.map((kind) => {
        const indexes = rows.map((r, i) => i).filter((i) => kindOf(rows[i]!.resourceId) === kind);
        if (indexes.length === 0) return null;
        return (
          <fieldset key={kind}>
            <legend className="mb-2 text-sm font-semibold text-navy">
              {RESOURCE_KIND_LABELS[kind]}
            </legend>
            <div className="divide-y divide-border rounded-md border border-border">
              {indexes.map((index) => {
                const row = rows[index]!;
                const entry = capacity.find((c) => c.resource.id === row.resourceId)!;
                const error = (touched && problems[index]) || serverErrors[`reports.${index}`];
                const ids = `${formId}-${index}`;
                return (
                  <div
                    key={row.resourceId}
                    className="grid gap-3 p-3 md:grid-cols-[minmax(160px,1.2fr)_140px_auto_minmax(160px,1fr)] md:items-start"
                  >
                    <div>
                      <p className="font-medium text-ink" id={`${ids}-name`}>
                        {entry.resource.name}
                      </p>
                      <Freshness entry={entry} />
                    </div>
                    <div>
                      <label htmlFor={`${ids}-status`} className="sr-only">
                        Status for {entry.resource.name}
                      </label>
                      <Select
                        id={`${ids}-status`}
                        value={row.status}
                        aria-invalid={error ? true : undefined}
                        aria-describedby={error ? `${ids}-error` : undefined}
                        onChange={(e) =>
                          update(index, { status: e.target.value as AvailabilityStatus })
                        }
                      >
                        <option value="" disabled>
                          Status
                        </option>
                        {AVAILABILITY_STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {AVAILABILITY_LABELS[s]}
                          </option>
                        ))}
                      </Select>
                    </div>
                    {kind === 'BED' ? (
                      <div className="flex items-center gap-2">
                        <label htmlFor={`${ids}-free`} className="text-xs text-slate">
                          Free
                        </label>
                        <Input
                          id={`${ids}-free`}
                          type="number"
                          inputMode="numeric"
                          min={0}
                          className="tabular w-20"
                          value={row.available}
                          onChange={(e) => update(index, { available: e.target.value })}
                        />
                        <label htmlFor={`${ids}-total`} className="text-xs text-slate">
                          of
                        </label>
                        <Input
                          id={`${ids}-total`}
                          type="number"
                          inputMode="numeric"
                          min={1}
                          className="tabular w-20"
                          value={row.total}
                          onChange={(e) => update(index, { total: e.target.value })}
                        />
                      </div>
                    ) : (
                      <div className="hidden md:block" />
                    )}
                    <div>
                      <label htmlFor={`${ids}-note`} className="sr-only">
                        Note for {entry.resource.name}
                      </label>
                      <Input
                        id={`${ids}-note`}
                        placeholder="Note (optional)"
                        maxLength={280}
                        value={row.note}
                        onChange={(e) => update(index, { note: e.target.value })}
                      />
                    </div>
                    {error && (
                      <p
                        id={`${ids}-error`}
                        className="text-xs font-medium text-critical md:col-span-4"
                      >
                        {error}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </fieldset>
        );
      })}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? 'Saving…' : touched ? 'Save capacity' : 'Confirm all as current'}
        </Button>
        <p className="text-xs text-slate">
          Saving records every item, so unchanged figures are confirmed as current.
        </p>
      </div>
    </form>
  );
}
