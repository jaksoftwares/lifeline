'use client';

import { AVAILABILITY_LABELS, type AvailabilityStatus } from '@lifeline/domain';
import { type CapacityEntry } from '@lifeline/schemas';
import { cn, StatusChip, type StatusTone } from '@lifeline/ui';
import { Clock } from 'lucide-react';
import { formatAgo, formatWhen } from '@/lib/format';

// Unavailable capacity is a normal operational state, not an emergency, so it is not shown in red.
const STATUS_TONE: Record<AvailabilityStatus, StatusTone> = {
  AVAILABLE: 'success',
  LIMITED: 'warning',
  UNAVAILABLE: 'neutral',
};

export function capacityLabel(
  entry: Pick<CapacityEntry, 'status' | 'available' | 'total'>,
): string {
  if (!entry.status) return 'Not reported';
  const status = AVAILABILITY_LABELS[entry.status];
  if (entry.available == null) return status;
  return entry.total != null
    ? `${status} · ${entry.available} of ${entry.total} free`
    : `${status} · ${entry.available} free`;
}

export function CapacityStatus({ entry, className }: { entry: CapacityEntry; className?: string }) {
  return (
    <StatusChip tone={entry.status ? STATUS_TONE[entry.status] : 'neutral'} className={className}>
      <span className="tabular">{capacityLabel(entry)}</span>
    </StatusChip>
  );
}

/** "Updated 14:32 (25 min ago) by Mercy Achieng", with a visible warning when stale. */
export function Freshness({ entry, showWho = true }: { entry: CapacityEntry; showWho?: boolean }) {
  if (!entry.updatedAt) return <span className="text-xs text-muted">No report yet</span>;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-xs',
        entry.stale ? 'font-medium text-ink' : 'text-slate',
      )}
    >
      {entry.stale && <Clock aria-hidden className="size-3.5 text-warning" />}
      <span className="tabular">
        {entry.stale ? 'Not updated since ' : 'Updated '}
        {formatWhen(entry.updatedAt)} ({formatAgo(entry.updatedAt)})
      </span>
      {showWho && entry.updatedBy && (
        <span className="text-slate">· {entry.updatedBy.fullName}</span>
      )}
    </span>
  );
}

export function CapacityGrid({
  capacity,
  highlight = [],
}: {
  capacity: CapacityEntry[];
  highlight?: string[];
}) {
  if (capacity.length === 0)
    return <p className="text-sm text-slate">This facility does not report capacity yet.</p>;
  return (
    <ul className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
      {capacity.map((entry) => (
        <li
          key={entry.resource.id}
          className={cn(
            'flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-sm px-2 py-1.5',
            highlight.includes(entry.resource.id) && 'bg-teal-soft',
          )}
        >
          <span className="text-sm text-ink">{entry.resource.name}</span>
          <span className="flex flex-col items-end gap-0.5">
            <CapacityStatus entry={entry} />
            {entry.stale && <Freshness entry={entry} showWho={false} />}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** The most recent update across all entries, for a single "capacity updated at" line. */
export function latestUpdate(capacity: CapacityEntry[]): CapacityEntry | undefined {
  return capacity
    .filter((c) => c.updatedAt)
    .sort((a, b) => new Date(b.updatedAt!).getTime() - new Date(a.updatedAt!).getTime())[0];
}
