import { describe, expect, it } from 'vitest';
import { canTransition, meetsCapability, rankVehicles, type VehicleCandidate } from './transport';

const now = new Date('2026-11-01T10:00:00Z');
const minutesAgo = (m: number) => new Date(now.getTime() - m * 60_000);
const pickup = { latitude: -1.005, longitude: 36.903 };

function vehicle(overrides: Partial<VehicleCandidate> & { id: string }): VehicleCandidate {
  return {
    capability: 'ALS',
    equipment: ['OXYGEN', 'CARDIAC_MONITOR', 'DEFIBRILLATOR'],
    status: 'AVAILABLE',
    statusUpdatedAt: minutesAgo(30),
    base: { latitude: -1.05, longitude: 36.9 },
    lastPosition: null,
    busy: false,
    offeredElsewhere: false,
    ...overrides,
  };
}

const rank = (
  candidates: VehicleCandidate[],
  need: Partial<Parameters<typeof rankVehicles>[1]> = {},
) =>
  rankVehicles(
    candidates,
    { capability: 'BLS', equipment: [], pickup, ...need },
    { now, staleAfterMinutes: 720 },
  );

describe('meetsCapability', () => {
  it('lets a vehicle serve its own level and any lower one', () => {
    expect(meetsCapability('ALS', 'BLS')).toBe(true);
    expect(meetsCapability('ALS', 'ALS')).toBe(true);
    expect(meetsCapability('BLS', 'ALS')).toBe(false);
    expect(meetsCapability('CRITICAL_CARE', 'PATIENT_TRANSPORT')).toBe(true);
  });
});

describe('transfer status machine', () => {
  it('follows the journey in order', () => {
    expect(canTransition('AWAITING_TRANSPORT', 'AMBULANCE_ASSIGNED')).toBe(true);
    expect(canTransition('AMBULANCE_ASSIGNED', 'DISPATCHED')).toBe(true);
    expect(canTransition('DISPATCHED', 'AT_PICKUP')).toBe(true);
    expect(canTransition('IN_TRANSIT', 'ARRIVED')).toBe(true);
    expect(canTransition('HANDED_OVER', 'COMPLETED')).toBe(true);
  });

  it('does not skip steps or reopen finished transfers', () => {
    expect(canTransition('AWAITING_TRANSPORT', 'DISPATCHED')).toBe(false);
    expect(canTransition('COMPLETED', 'AWAITING_TRANSPORT')).toBe(false);
    expect(canTransition('CANCELLED', 'AMBULANCE_ASSIGNED')).toBe(false);
  });

  it('can go back to awaiting transport before collection, but not after', () => {
    expect(canTransition('AMBULANCE_ASSIGNED', 'AWAITING_TRANSPORT')).toBe(true);
    expect(canTransition('DISPATCHED', 'AWAITING_TRANSPORT')).toBe(true);
    expect(canTransition('IN_TRANSIT', 'AWAITING_TRANSPORT')).toBe(false);
    expect(canTransition('IN_TRANSIT', 'CANCELLED')).toBe(false);
  });
});

describe('rankVehicles', () => {
  it('ranks suitable vehicles by estimated time to pickup', () => {
    const near = vehicle({ id: 'near', base: { latitude: -1.01, longitude: 36.9 } });
    const far = vehicle({ id: 'far', base: { latitude: -1.3, longitude: 36.8 } });
    const { suggestions, excluded } = rank([far, near]);
    expect(suggestions.map((s) => s.vehicleId)).toEqual(['near', 'far']);
    expect(suggestions[0]!.etaMinutes).toBeLessThan(suggestions[1]!.etaMinutes!);
    expect(suggestions[0]!.from).toBe('BASE');
    expect(excluded).toEqual([]);
  });

  it('explains every suggestion', () => {
    const { suggestions } = rank([vehicle({ id: 'a' })], { equipment: ['OXYGEN'] });
    expect(suggestions[0]!.reasons).toEqual([
      'Advanced life support, meets the need',
      'Carries oxygen',
      expect.stringMatching(/^About \d+ min to pickup from its base \(estimate\)$/),
      'Availability confirmed 30 min ago',
    ]);
    expect(suggestions[0]!.cautions).toEqual(['Higher level than needed']);
  });

  it('excludes vehicles that can’t do the job, and says why', () => {
    const { suggestions, excluded } = rank(
      [
        vehicle({ id: 'bls', capability: 'BLS' }),
        vehicle({ id: 'no-vent' }),
        vehicle({ id: 'busy', busy: true, equipment: ['VENTILATOR'] }),
        vehicle({ id: 'down', status: 'OUT_OF_SERVICE', equipment: ['VENTILATOR'] }),
        vehicle({ id: 'stale', statusUpdatedAt: minutesAgo(14 * 60), equipment: ['VENTILATOR'] }),
        vehicle({ id: 'never', statusUpdatedAt: null, equipment: ['VENTILATOR'] }),
      ],
      { capability: 'ALS', equipment: ['VENTILATOR'] },
    );
    expect(suggestions).toEqual([]);
    expect(Object.fromEntries(excluded.map((e) => [e.vehicleId, e.reasons]))).toEqual({
      bls: ['Basic life support only', 'No transport ventilator'],
      'no-vent': ['No transport ventilator'],
      busy: ['On another transfer'],
      down: ['Out of service'],
      stale: ['Availability last confirmed 14 h ago'],
      never: ['Availability never confirmed by the provider'],
    });
  });

  it('uses a recent reported position over the base', () => {
    const atPickup = vehicle({
      id: 'moving',
      base: { latitude: -1.3, longitude: 36.8 },
      lastPosition: { ...pickup, at: minutesAgo(5) },
    });
    const old = vehicle({
      id: 'old-fix',
      base: { latitude: -1.3, longitude: 36.8 },
      lastPosition: { ...pickup, at: minutesAgo(90) },
    });
    const { suggestions } = rank([old, atPickup]);
    expect(suggestions.map((s) => [s.vehicleId, s.from])).toEqual([
      ['moving', 'LAST_POSITION'],
      ['old-fix', 'BASE'],
    ]);
  });

  it('prefers the vehicle at the needed level when equally close, and puts vehicles offered elsewhere last', () => {
    const base = { latitude: -1.02, longitude: 36.9 };
    const { suggestions } = rank(
      [
        vehicle({ id: 'icu', capability: 'CRITICAL_CARE', base }),
        vehicle({ id: 'offered', capability: 'BLS', base: pickup, offeredElsewhere: true }),
        vehicle({ id: 'bls', capability: 'BLS', base }),
      ],
      { capability: 'BLS' },
    );
    expect(suggestions.map((s) => s.vehicleId)).toEqual(['bls', 'icu', 'offered']);
    expect(suggestions[2]!.cautions).toContain('Already offered for another transfer');
  });

  it('still suggests a vehicle with no known location, last', () => {
    const { suggestions } = rank([vehicle({ id: 'nowhere', base: null }), vehicle({ id: 'a' })]);
    expect(suggestions.map((s) => s.vehicleId)).toEqual(['a', 'nowhere']);
    expect(suggestions[1]!.cautions).toContain(
      'Location unknown; time to pickup can’t be estimated',
    );
  });
});
