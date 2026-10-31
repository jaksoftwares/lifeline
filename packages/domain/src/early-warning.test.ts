import { describe, expect, it } from 'vitest';
import { calculateScore, scoreNotApplicableReason, type Vitals } from './early-warning';
import { ageInYears, canRespondToRequest, formatAge } from './referrals';

const normal: Vitals = {
  respiratoryRate: 16,
  oxygenSaturation: 98,
  onSupplementalOxygen: false,
  systolicBp: 120,
  diastolicBp: 80,
  heartRate: 72,
  temperature: 36.8,
  consciousness: 'ALERT',
};

describe('NEWS2', () => {
  it('scores normal observations as 0, low', () => {
    expect(calculateScore('NEWS2', normal)).toMatchObject({ total: 0, band: 'LOW', missing: [] });
  });

  it('applies the published band edges', () => {
    const at = (v: Partial<Vitals>) => calculateScore('NEWS2', { ...normal, ...v }).points;
    expect(at({ respiratoryRate: 8 }).respiratoryRate).toBe(3);
    expect(at({ respiratoryRate: 9 }).respiratoryRate).toBe(1);
    expect(at({ respiratoryRate: 21 }).respiratoryRate).toBe(2);
    expect(at({ respiratoryRate: 25 }).respiratoryRate).toBe(3);
    expect(at({ oxygenSaturation: 91 }).oxygenSaturation).toBe(3);
    expect(at({ oxygenSaturation: 95 }).oxygenSaturation).toBe(1);
    expect(at({ systolicBp: 90 }).systolicBp).toBe(3);
    expect(at({ systolicBp: 220 }).systolicBp).toBe(3);
    expect(at({ heartRate: 91 }).heartRate).toBe(1);
    expect(at({ heartRate: 131 }).heartRate).toBe(3);
    expect(at({ temperature: 35.0 }).temperature).toBe(3);
    expect(at({ temperature: 35.1 }).temperature).toBe(1);
    expect(at({ temperature: 39.1 }).temperature).toBe(2);
    expect(at({ consciousness: 'CONFUSION' }).consciousness).toBe(3);
    expect(at({ onSupplementalOxygen: true }).onSupplementalOxygen).toBe(2);
  });

  it('rates any single 3 as low–medium and 7+ as high', () => {
    expect(calculateScore('NEWS2', { ...normal, consciousness: 'VOICE' }).band).toBe('LOW_MEDIUM');
    const sick = calculateScore('NEWS2', {
      ...normal,
      respiratoryRate: 26,
      oxygenSaturation: 90,
      heartRate: 125,
      systolicBp: 95,
    });
    expect(sick).toMatchObject({ total: 3 + 3 + 2 + 2, band: 'HIGH' });
  });

  it('gives no total when an observation is missing', () => {
    const result = calculateScore('NEWS2', { ...normal, oxygenSaturation: null });
    expect(result).toMatchObject({ total: null, band: null, missing: ['oxygenSaturation'] });
  });
});

describe('MEWS', () => {
  it('ignores oxygen and uses its own bands', () => {
    const result = calculateScore('MEWS', {
      ...normal,
      oxygenSaturation: null,
      onSupplementalOxygen: null,
    });
    expect(result).toMatchObject({ total: 1, band: 'LOW', missing: [] }); // RR 16 scores 1 in MEWS
  });

  it('rates 5 or more as high', () => {
    const result = calculateScore('MEWS', {
      ...normal,
      systolicBp: 75,
      heartRate: 120,
      respiratoryRate: 12,
    });
    expect(result).toMatchObject({ total: 4, band: 'MEDIUM' });
    expect(calculateScore('MEWS', { ...normal, systolicBp: 65, heartRate: 120 }).band).toBe('HIGH');
  });
});

describe('applicability', () => {
  it('excludes pregnancy, postpartum, children and unknown age', () => {
    expect(scoreNotApplicableReason({ ageYears: 28, pregnancyStatus: 'PREGNANT' })).toMatch(
      /pregnancy/,
    );
    expect(scoreNotApplicableReason({ ageYears: 28, pregnancyStatus: 'POSTPARTUM' })).toMatch(
      /postpartum/,
    );
    expect(scoreNotApplicableReason({ ageYears: 9, pregnancyStatus: 'NOT_APPLICABLE' })).toMatch(
      /under-16s/,
    );
    expect(scoreNotApplicableReason({ ageYears: null, pregnancyStatus: null })).toMatch(/age/);
    expect(
      scoreNotApplicableReason({ ageYears: 54, pregnancyStatus: 'NOT_APPLICABLE' }),
    ).toBeNull();
  });
});

describe('referral helpers', () => {
  it('lets facilities respond only to open requests on submitted referrals', () => {
    expect(canRespondToRequest('SUBMITTED', 'PENDING')).toBe(true);
    expect(canRespondToRequest('SUBMITTED', 'INFO_REQUESTED')).toBe(true);
    expect(canRespondToRequest('ACCEPTED', 'PENDING')).toBe(false);
    expect(canRespondToRequest('SUBMITTED', 'WITHDRAWN')).toBe(false);
  });

  it('works out age from a date of birth or an estimate', () => {
    const now = new Date('2026-11-01T00:00:00Z');
    expect(Math.floor(ageInYears({ dateOfBirth: '1990-11-02' }, now)!)).toBe(35);
    expect(ageInYears({ estimatedAge: 6, estimatedAgeUnit: 'MONTHS' }, now)).toBe(0.5);
    expect(ageInYears({}, now)).toBeNull();
    expect(formatAge(0.5)).toBe('6 mo');
    expect(formatAge(34.9)).toBe('34 y');
    expect(formatAge(10 / 365.25)).toBe('10 d');
  });
});
