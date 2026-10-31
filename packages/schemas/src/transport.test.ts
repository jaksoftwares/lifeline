import { describe, expect, it } from 'vitest';
import {
  confirmAssignmentSchema,
  declineAssignmentSchema,
  externalTransportSchema,
  transferRequestSchema,
  vehicleInputSchema,
} from './transport';

describe('vehicleInputSchema', () => {
  it('normalises the number plate', () => {
    const v = vehicleInputSchema.parse({ registration: '  kca  123a ', capability: 'BLS' });
    expect(v.registration).toBe('KCA 123A');
    expect(v.equipment).toEqual([]);
  });

  it('rejects symbols and half a location', () => {
    expect(
      vehicleInputSchema.safeParse({ registration: 'KCA-123', capability: 'BLS' }).success,
    ).toBe(false);
    expect(
      vehicleInputSchema.safeParse({
        registration: 'KCA 123A',
        capability: 'BLS',
        baseLatitude: -1.2,
      }).success,
    ).toBe(false);
  });
});

describe('transferRequestSchema', () => {
  it('accepts known equipment only and drops duplicates', () => {
    expect(
      transferRequestSchema.parse({
        requiredCapability: 'ALS',
        requiredEquipment: ['OXYGEN', 'OXYGEN'],
      }).requiredEquipment,
    ).toEqual(['OXYGEN']);
    expect(
      transferRequestSchema.safeParse({ requiredCapability: 'ALS', requiredEquipment: ['JETPACK'] })
        .success,
    ).toBe(false);
  });
});

describe('dispatch schemas', () => {
  it('needs at least one crew member to confirm', () => {
    expect(confirmAssignmentSchema.safeParse({ vehicleId: 'v', crewMemberIds: [] }).success).toBe(
      false,
    );
  });

  it('needs an explanation for "other" reasons', () => {
    expect(declineAssignmentSchema.safeParse({ reason: 'OTHER' }).success).toBe(false);
    expect(declineAssignmentSchema.safeParse({ reason: 'NO_CREW' }).success).toBe(true);
    expect(externalTransportSchema.safeParse({ service: 'OTHER' }).success).toBe(false);
    expect(externalTransportSchema.safeParse({ service: 'NATIONAL_922' }).success).toBe(true);
  });
});
