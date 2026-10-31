import { describe, expect, it } from 'vitest';
import { capacityReportProblem, isStale } from './capacity';
import { DEFAULT_RESOURCES, DEFAULT_SERVICES, KENYAN_COUNTIES } from './catalogue';
import { estimateDriveMinutes, haversineKm } from './geo';

describe('capacityReportProblem', () => {
  it('requires a free count for beds', () => {
    expect(capacityReportProblem('BED', { status: 'AVAILABLE' })).toMatch(/how many beds/);
  });

  it('keeps status consistent with the free count', () => {
    expect(capacityReportProblem('BED', { status: 'AVAILABLE', available: 0 })).toMatch(
      /unavailable/,
    );
    expect(capacityReportProblem('BED', { status: 'UNAVAILABLE', available: 2 })).toMatch(
      /available or limited/,
    );
    expect(
      capacityReportProblem('BED', { status: 'UNAVAILABLE', available: 0, total: 6 }),
    ).toBeNull();
    expect(capacityReportProblem('BED', { status: 'LIMITED', available: 1, total: 6 })).toBeNull();
  });

  it('rejects more free beds than the total', () => {
    expect(capacityReportProblem('BED', { status: 'AVAILABLE', available: 7, total: 6 })).toMatch(
      /exceed/,
    );
  });

  it('reports equipment and specialists by status only', () => {
    expect(capacityReportProblem('EQUIPMENT', { status: 'LIMITED' })).toBeNull();
    expect(capacityReportProblem('SPECIALIST', { status: 'AVAILABLE', available: 1 })).toMatch(
      /beds only/,
    );
  });
});

describe('isStale', () => {
  const now = new Date('2026-11-01T12:00:00Z');
  it('marks updates older than the threshold as stale', () => {
    expect(isStale('2026-11-01T07:59:00Z', 240, now)).toBe(true);
    expect(isStale('2026-11-01T08:01:00Z', 240, now)).toBe(false);
  });
});

describe('geo', () => {
  it('measures Nairobi to Machakos at roughly 50 km in a straight line', () => {
    const km = haversineKm(
      { latitude: -1.2921, longitude: 36.8219 },
      { latitude: -1.5177, longitude: 37.2634 },
    );
    expect(km).toBeGreaterThan(50);
    expect(km).toBeLessThan(58);
  });

  it('estimates drive time from straight-line distance', () => {
    expect(estimateDriveMinutes(20)).toBe(42);
    expect(estimateDriveMinutes(0)).toBe(1);
  });
});

describe('catalogue', () => {
  it('has unique codes', () => {
    expect(new Set(DEFAULT_SERVICES.map((s) => s.code)).size).toBe(DEFAULT_SERVICES.length);
    expect(new Set(DEFAULT_RESOURCES.map((r) => r.code)).size).toBe(DEFAULT_RESOURCES.length);
  });

  it('lists all 47 counties', () => {
    expect(KENYAN_COUNTIES).toHaveLength(47);
  });
});
