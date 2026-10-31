import { describe, expect, it } from 'vitest';
import {
  capacityUpdateSchema,
  createInstitutionSchema,
  facilitySearchQuerySchema,
  updateFacilityProfileSchema,
} from './facilities';

const facility = {
  type: 'FACILITY',
  name: 'Demo Health Centre',
  code: 'dhc-1',
  level: 4,
  county: 'Nyeri',
};

describe('createInstitutionSchema', () => {
  it('uppercases codes and requires a level for facilities', () => {
    expect(createInstitutionSchema.parse(facility).code).toBe('DHC-1');
    expect(createInstitutionSchema.safeParse({ ...facility, level: null }).success).toBe(false);
  });

  it('rejects levels for ambulance providers', () => {
    const result = createInstitutionSchema.safeParse({ ...facility, type: 'AMBULANCE_PROVIDER' });
    expect(result.success).toBe(false);
  });

  it('rejects unknown counties', () => {
    expect(createInstitutionSchema.safeParse({ ...facility, county: 'Atlantis' }).success).toBe(
      false,
    );
  });
});

describe('updateFacilityProfileSchema', () => {
  it('rejects coordinates outside Kenya, such as swapped latitude and longitude', () => {
    expect(
      updateFacilityProfileSchema.safeParse({ latitude: 36.8, longitude: -1.29 }).success,
    ).toBe(false);
    expect(
      updateFacilityProfileSchema.safeParse({ latitude: -1.29, longitude: 36.8 }).success,
    ).toBe(true);
  });

  it('needs both coordinates or neither', () => {
    expect(updateFacilityProfileSchema.safeParse({ latitude: -1.29 }).success).toBe(false);
  });

  it('treats blank optional text as cleared', () => {
    expect(updateFacilityProfileSchema.parse({ address: '  ', phone: '' })).toMatchObject({
      address: null,
      phone: null,
    });
  });
});

describe('capacityUpdateSchema', () => {
  it('rejects negative counts and empty batches', () => {
    expect(capacityUpdateSchema.safeParse({ reports: [] }).success).toBe(false);
    expect(
      capacityUpdateSchema.safeParse({
        reports: [{ resourceId: 'r', status: 'AVAILABLE', available: -1 }],
      }).success,
    ).toBe(false);
  });
});

describe('facilitySearchQuerySchema', () => {
  it('splits comma-separated ids', () => {
    expect(facilitySearchQuerySchema.parse({ serviceIds: 'a,b', originId: 'o' })).toEqual({
      serviceIds: ['a', 'b'],
      resourceIds: [],
      originId: 'o',
    });
  });
});
