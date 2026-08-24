import { describe, expect, test } from 'vitest';
import type { VehicleIdentity } from '../src/lib/types';
import {
  extractSafetyDetail,
  mapSafetyDetail,
  parseVariants,
  pickBestVariant,
} from '../src/lib/api/safety';

// Trimmed from real SafetyRatings responses (2003 Honda Accord).
const VARIANTS_BODY = {
  Count: 4,
  Message: 'Results returned successfully',
  Results: [
    { VehicleDescription: '2003 Honda Accord 2-DR. w/SAB', VehicleId: 4739 },
    { VehicleDescription: '2003 Honda Accord 4-DR. w/SAB', VehicleId: 4738 },
    { VehicleDescription: '2003 Honda Accord 4-DR.', VehicleId: 4737 },
    { VehicleDescription: '2003 Honda Accord 2-DR.', VehicleId: 4736 },
  ],
};

const DETAIL_RECORD = {
  OverallRating: 'Not Rated',
  OverallFrontCrashRating: 'Not Rated',
  OverallSideCrashRating: 'Not Rated',
  RolloverRating: 'Not Rated',
  ComplaintsCount: 2013,
  RecallsCount: 24,
  InvestigationCount: 5,
  ModelYear: 2003,
  Make: 'HONDA',
  Model: 'ACCORD',
  VehicleDescription: '2003 Honda Accord 4-DR. w/SAB',
  VehicleId: 4738,
};

function identityWith(overrides: Partial<VehicleIdentity>): VehicleIdentity {
  return {
    vin: '1HGCM82633A004352',
    modelYear: 2003,
    make: 'HONDA',
    model: 'Accord',
    trim: null,
    series: null,
    bodyClass: null,
    vehicleType: null,
    engine: {
      cylinders: null,
      displacementL: null,
      horsepower: null,
      fuelType: null,
      configuration: null,
    },
    driveType: null,
    transmission: null,
    plant: { city: null, state: null, country: null },
    gvwr: null,
    decodeWarning: null,
    ...overrides,
  };
}

describe('parseVariants', () => {
  test('parses the variant list', () => {
    const variants = parseVariants(VARIANTS_BODY);
    expect(variants).toHaveLength(4);
    expect(variants?.[0]).toEqual({
      vehicleDescription: '2003 Honda Accord 2-DR. w/SAB',
      vehicleId: 4739,
    });
  });

  test('skips malformed entries', () => {
    const variants = parseVariants({ Results: [{ VehicleId: 1 }, VARIANTS_BODY.Results[0]] });
    expect(variants).toHaveLength(1);
  });

  test.each([null, {}, { Results: 'x' }])('bad shape %j yields null', (body) => {
    expect(parseVariants(body)).toBeNull();
  });
});

describe('pickBestVariant', () => {
  const variants = parseVariants(VARIANTS_BODY) ?? [];

  test('coupe body class prefers a 2-DR variant', () => {
    const picked = pickBestVariant(variants, identityWith({ bodyClass: 'Coupe' }));
    expect(picked?.vehicleDescription).toContain('2-DR');
  });

  test('sedan body class prefers a 4-DR variant', () => {
    const picked = pickBestVariant(variants, identityWith({ bodyClass: 'Sedan/Saloon' }));
    expect(picked?.vehicleDescription).toContain('4-DR');
  });

  test('AWD drive type prefers an AWD/4WD variant', () => {
    const suvVariants = [
      { vehicleDescription: '2020 Test SUV FWD', vehicleId: 1 },
      { vehicleDescription: '2020 Test SUV AWD', vehicleId: 2 },
    ];
    const picked = pickBestVariant(suvVariants, identityWith({ driveType: 'All-Wheel Drive' }));
    expect(picked?.vehicleId).toBe(2);
  });

  test('no hints falls back to the first variant', () => {
    expect(pickBestVariant(variants, identityWith({}))?.vehicleId).toBe(4739);
  });

  test('empty list yields null', () => {
    expect(pickBestVariant([], identityWith({}))).toBeNull();
  });
});

describe('mapSafetyDetail / extractSafetyDetail', () => {
  test('maps the detail record', () => {
    const rating = mapSafetyDetail(DETAIL_RECORD);
    expect(rating.vehicleDescription).toBe('2003 Honda Accord 4-DR. w/SAB');
    expect(rating.overallRating).toBe('Not Rated');
    expect(rating.complaintsCount).toBe(2013);
    expect(rating.recallsCount).toBe(24);
    expect(rating.investigationCount).toBe(5);
    expect(rating.vehiclePicture).toBeNull();
  });

  test('picture URL is surfaced when present', () => {
    const rating = mapSafetyDetail({
      ...DETAIL_RECORD,
      VehiclePicture: 'https://static.nhtsa.gov/images/example.jpg',
    });
    expect(rating.vehiclePicture).toBe('https://static.nhtsa.gov/images/example.jpg');
  });

  test('extractSafetyDetail returns Results[0], null on bad shapes', () => {
    expect(extractSafetyDetail({ Count: 1, Results: [DETAIL_RECORD] })?.['VehicleId']).toBe(4738);
    expect(extractSafetyDetail({ Results: [] })).toBeNull();
    expect(extractSafetyDetail(null)).toBeNull();
  });
});
