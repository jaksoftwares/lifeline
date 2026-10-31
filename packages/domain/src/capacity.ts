export const RESOURCE_KINDS = ['BED', 'EQUIPMENT', 'SPECIALIST'] as const;
export type ResourceKind = (typeof RESOURCE_KINDS)[number];

export const RESOURCE_KIND_LABELS: Record<ResourceKind, string> = {
  BED: 'Beds',
  EQUIPMENT: 'Equipment',
  SPECIALIST: 'Specialists on call',
};

export const AVAILABILITY_STATUSES = ['AVAILABLE', 'LIMITED', 'UNAVAILABLE'] as const;
export type AvailabilityStatus = (typeof AVAILABILITY_STATUSES)[number];

export const AVAILABILITY_LABELS: Record<AvailabilityStatus, string> = {
  AVAILABLE: 'Available',
  LIMITED: 'Limited',
  UNAVAILABLE: 'Unavailable',
};

/** Capacity older than this is shown as stale unless the network sets its own threshold. */
export const DEFAULT_CAPACITY_STALE_AFTER_MINUTES = 4 * 60;

export function isStale(
  updatedAt: Date | string,
  staleAfterMinutes: number,
  now: Date = new Date(),
): boolean {
  return now.getTime() - new Date(updatedAt).getTime() > staleAfterMinutes * 60_000;
}

export interface CapacityReport {
  status: AvailabilityStatus;
  available?: number | null;
  total?: number | null;
}

/**
 * Returns a problem description, or null when the report is consistent. Beds need a free count so
 * that "available" always means at least one bed; equipment and specialists are reported by status.
 */
export function capacityReportProblem(kind: ResourceKind, report: CapacityReport): string | null {
  const { status, available, total } = report;
  if (kind !== 'BED') {
    return available != null || total != null ? 'Counts apply to beds only.' : null;
  }
  if (available == null) return 'Enter how many beds are free.';
  if (total != null && available > total) return 'Free beds can’t exceed the total.';
  if (available === 0 && status !== 'UNAVAILABLE')
    return 'With no free beds, mark this as unavailable.';
  if (available > 0 && status === 'UNAVAILABLE')
    return 'With free beds, mark this as available or limited.';
  return null;
}
