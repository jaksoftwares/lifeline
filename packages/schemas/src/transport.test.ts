import { describe, expect, it } from 'vitest';
import {
  confirmAssignmentSchema,
  declineAssignmentSchema,
  externalTransportSchema,
  handoverSchema,
  transportCostSchema,
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

describe('handover and cost schemas', () => {
  it('requires every handover item to be confirmed', () => {
    const checklist = {
      patientIdentityConfirmed: true,
      clinicalSummaryReceived: true,
      latestObservationsReceived: true,
      treatmentAndAllergiesReviewed: true,
      documentsAndResultsAddressed: true,
    };
    expect(handoverSchema.safeParse(checklist).success).toBe(true);
    expect(
      handoverSchema.safeParse({ ...checklist, latestObservationsReceived: false }).success,
    ).toBe(false);
  });

  it('accepts KES amounts to two decimal places and requires an other-payer name', () => {
    expect(
      transportCostSchema.parse({ amount: '12500.50', payer: 'COUNTY_GOVERNMENT' }).amount,
    ).toBe(12500.5);
    expect(transportCostSchema.safeParse({ amount: '12.345', payer: 'INSURER' }).success).toBe(
      false,
    );
    expect(transportCostSchema.safeParse({ amount: '0', payer: 'OTHER' }).success).toBe(false);
    expect(
      transportCostSchema.safeParse({ amount: '0', payer: 'OTHER', payerName: 'Donor fund' })
        .success,
    ).toBe(true);
  });
});
