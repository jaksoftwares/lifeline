import { describe, expect, it } from 'vitest';
import {
  createReferralSchema,
  patientInputSchema,
  respondToRequestSchema,
  submitReferralSchema,
  vitalsInputSchema,
} from './referrals';

describe('patientInputSchema', () => {
  it('allows an unidentified patient', () => {
    expect(patientInputSchema.parse({ sex: 'UNKNOWN', fullName: '' }).fullName).toBeNull();
  });

  it('needs a unit with an estimated age', () => {
    expect(patientInputSchema.safeParse({ sex: 'MALE', estimatedAge: 40 }).success).toBe(false);
    expect(
      patientInputSchema.safeParse({ sex: 'MALE', estimatedAge: 40, estimatedAgeUnit: 'YEARS' })
        .success,
    ).toBe(true);
  });

  it('rejects a date of birth in the future or with an impossible calendar value', () => {
    expect(patientInputSchema.safeParse({ sex: 'FEMALE', dateOfBirth: '2999-01-01' }).success).toBe(
      false,
    );
    expect(patientInputSchema.safeParse({ sex: 'FEMALE', dateOfBirth: '2024-02-30' }).success).toBe(
      false,
    );
  });
});

describe('vitalsInputSchema', () => {
  it('rejects implausible values that are almost certainly typing errors', () => {
    expect(vitalsInputSchema.safeParse({ oxygenSaturation: 980 }).success).toBe(false);
    expect(vitalsInputSchema.safeParse({ temperature: 3.7 }).success).toBe(false);
    expect(vitalsInputSchema.safeParse({ temperature: 37.4, heartRate: 88 }).success).toBe(true);
  });
});

describe('submitReferralSchema', () => {
  it('limits the number of facilities and rejects duplicates', () => {
    expect(submitReferralSchema.safeParse({ institutionIds: [] }).success).toBe(false);
    expect(submitReferralSchema.safeParse({ institutionIds: ['a', 'a'] }).success).toBe(false);
    expect(
      submitReferralSchema.safeParse({ institutionIds: ['a', 'b', 'c', 'd', 'e', 'f'] }).success,
    ).toBe(false);
  });
});

describe('respondToRequestSchema', () => {
  it('requires an explanation when declining for another reason', () => {
    expect(
      respondToRequestSchema.safeParse({ decision: 'DECLINE', declineReason: 'OTHER' }).success,
    ).toBe(false);
    expect(
      respondToRequestSchema.safeParse({ decision: 'DECLINE', declineReason: 'NO_BED' }).success,
    ).toBe(true);
  });

  it('requires the question when asking for information', () => {
    expect(
      respondToRequestSchema.safeParse({ decision: 'REQUEST_INFO', question: '' }).success,
    ).toBe(false);
  });
});

describe('createReferralSchema', () => {
  it('accepts a minimal draft', () => {
    const result = createReferralSchema.safeParse({
      referringInstitutionId: 'f',
      patient: { sex: 'FEMALE' },
    });
    expect(result.success).toBe(true);
  });
});
