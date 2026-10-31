'use client';

import {
  ASSIGNMENT_STATUS_LABELS,
  type AssignmentStatus,
  CAPABILITY_LABELS,
  type CapabilityLevel,
  TRANSFER_STATUS_LABELS,
  type TransferStatus,
  VEHICLE_STATUS_LABELS,
  type VehicleStatus,
} from '@lifeline/domain';
import { StatusChip, type StatusTone } from '@lifeline/ui';

const TRANSFER_TONE: Record<TransferStatus, StatusTone> = {
  AWAITING_TRANSPORT: 'warning',
  AMBULANCE_ASSIGNED: 'info',
  DISPATCHED: 'info',
  AT_PICKUP: 'info',
  PATIENT_COLLECTED: 'info',
  IN_TRANSIT: 'info',
  ARRIVED: 'success',
  HANDED_OVER: 'success',
  COMPLETED: 'success',
  INTERRUPTED: 'critical',
  CANCELLED: 'neutral',
};

const ASSIGNMENT_TONE: Record<AssignmentStatus, StatusTone> = {
  PROPOSED: 'warning',
  CONFIRMED: 'success',
  DECLINED: 'neutral',
  WITHDRAWN: 'neutral',
  RELEASED: 'neutral',
  COMPLETED: 'success',
};

const VEHICLE_TONE: Record<VehicleStatus, StatusTone> = {
  AVAILABLE: 'success',
  OUT_OF_SERVICE: 'critical',
  OFF_DUTY: 'neutral',
};

export function TransferStatusChip({ status }: { status: TransferStatus }) {
  return <StatusChip tone={TRANSFER_TONE[status]}>{TRANSFER_STATUS_LABELS[status]}</StatusChip>;
}

export function AssignmentStatusChip({ status }: { status: AssignmentStatus }) {
  return <StatusChip tone={ASSIGNMENT_TONE[status]}>{ASSIGNMENT_STATUS_LABELS[status]}</StatusChip>;
}

/** A vehicle on a trip shows as such, whatever its provider-set status says. */
export function VehicleStatusChip({
  status,
  onTransfer,
  stale,
}: {
  status: VehicleStatus;
  onTransfer?: boolean;
  stale?: boolean;
}) {
  if (onTransfer) return <StatusChip tone="info">On a transfer</StatusChip>;
  if (status === 'AVAILABLE' && stale) return <StatusChip tone="warning">Not confirmed</StatusChip>;
  return <StatusChip tone={VEHICLE_TONE[status]}>{VEHICLE_STATUS_LABELS[status]}</StatusChip>;
}

export function CapabilityTag({ level }: { level: CapabilityLevel }) {
  return (
    <span className="inline-flex items-center rounded-pill bg-surface-blue px-2.5 py-0.5 text-xs font-medium text-ink">
      {CAPABILITY_LABELS[level]}
    </span>
  );
}
