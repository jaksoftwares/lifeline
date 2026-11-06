import { describe, expect, it } from 'vitest';
import { reportQuerySchema, updateNetworkSettingsSchema } from './reports';

describe('reportQuerySchema', () => {
  const valid = { networkId: 'network', from: '2026-01-01', to: '2026-01-31' };

  it('accepts inclusive date ranges up to 367 days', () => {
    expect(reportQuerySchema.safeParse(valid).success).toBe(true);
    expect(reportQuerySchema.safeParse({ ...valid, to: '2027-01-02' }).success).toBe(true);
    expect(reportQuerySchema.safeParse({ ...valid, to: '2027-01-03' }).success).toBe(false);
  });

  it('rejects reversed and invalid calendar dates', () => {
    expect(
      reportQuerySchema.safeParse({ ...valid, from: '2026-02-01', to: '2026-01-31' }).success,
    ).toBe(false);
    expect(reportQuerySchema.safeParse({ ...valid, from: '2026-02-30' }).success).toBe(false);
  });
});

describe('updateNetworkSettingsSchema', () => {
  it('bounds operational freshness settings and validates the score', () => {
    expect(
      updateNetworkSettingsSchema.safeParse({
        networkId: 'network',
        capacityStaleAfterMinutes: 240,
        vehicleStatusStaleAfterMinutes: 720,
        earlyWarningScore: 'NEWS2',
      }).success,
    ).toBe(true);
    expect(
      updateNetworkSettingsSchema.safeParse({
        networkId: 'network',
        capacityStaleAfterMinutes: 0,
        vehicleStatusStaleAfterMinutes: 720,
        earlyWarningScore: 'UNKNOWN',
      }).success,
    ).toBe(false);
  });
});
