'use client';

import {
  type ReferralStatus,
  REFERRAL_STATUS_LABELS,
  REQUEST_STATUS_LABELS,
  type RequestStatus,
  SCORE_BAND_LABELS,
  type ScoreBand,
  URGENCY_LABELS,
  type Urgency,
} from '@lifeline/domain';
import { type AssessmentView } from '@lifeline/schemas';
import { StatusChip, type StatusTone } from '@lifeline/ui';

const REFERRAL_TONE: Record<ReferralStatus, StatusTone> = {
  DRAFT: 'neutral',
  SUBMITTED: 'warning',
  ACCEPTED: 'success',
  CANCELLED: 'neutral',
};

const REQUEST_TONE: Record<RequestStatus, StatusTone> = {
  PENDING: 'warning',
  INFO_REQUESTED: 'info',
  ACCEPTED: 'success',
  DECLINED: 'neutral',
  WITHDRAWN: 'neutral',
};

// Red is kept for genuinely urgent states: emergency referrals and high early-warning scores.
const URGENCY_TONE: Record<Urgency, StatusTone> = {
  EMERGENCY: 'critical',
  URGENT: 'warning',
  ROUTINE: 'neutral',
};

const BAND_TONE: Record<ScoreBand, StatusTone> = {
  LOW: 'neutral',
  LOW_MEDIUM: 'warning',
  MEDIUM: 'warning',
  HIGH: 'critical',
};

export function ReferralStatusChip({ status }: { status: ReferralStatus }) {
  return <StatusChip tone={REFERRAL_TONE[status]}>{REFERRAL_STATUS_LABELS[status]}</StatusChip>;
}

export function RequestStatusChip({ status }: { status: RequestStatus }) {
  return <StatusChip tone={REQUEST_TONE[status]}>{REQUEST_STATUS_LABELS[status]}</StatusChip>;
}

export function UrgencyChip({ urgency }: { urgency: Urgency | null }) {
  if (!urgency) return <StatusChip tone="neutral">Urgency not set</StatusChip>;
  return <StatusChip tone={URGENCY_TONE[urgency]}>{URGENCY_LABELS[urgency]}</StatusChip>;
}

export function ScoreChip({ score }: { score: NonNullable<AssessmentView['score']> }) {
  if (score.total === null || !score.band)
    return <StatusChip tone="neutral">{score.type} incomplete</StatusChip>;
  return (
    <StatusChip tone={BAND_TONE[score.band]}>
      <span className="tabular">
        {score.type} {score.total} · {SCORE_BAND_LABELS[score.band]}
      </span>
    </StatusChip>
  );
}
