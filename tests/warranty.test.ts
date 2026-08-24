import { describe, expect, test } from 'vitest';
import type { VehicleIdentity } from '../src/lib/types';
import { estimateWarranty } from '../src/lib/warranty';

function identityFor(make: string, modelYear: number | null): VehicleIdentity {
  return {
    vin: '1HGCM82633A004352',
    modelYear,
    make,
    model: 'Test',
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
  };
}

// Fixed "now" so tests are deterministic: 2024-09-01.
const NOW = new Date(2024, 8, 1);

describe('estimateWarranty', () => {
  test('assumes in-service Sep 1 of the year before the model year', () => {
    const result = estimateWarranty(identityFor('TOYOTA', 2023), null, NOW);
    expect(result.status).toBe('hit');
    expect(result.data?.assumedInServiceDate).toBe('2022-09-01');
    expect(result.data?.assumptionNote).toMatch(/September 1/);
  });

  test('Toyota 2023 at 24 elapsed months: basic has 12 months left', () => {
    const result = estimateWarranty(identityFor('TOYOTA', 2023), 30_000, NOW);
    const basic = result.data?.rows.find((row) => row.coverage.startsWith('Basic'));
    expect(basic?.termMonths).toBe(36);
    expect(basic?.termMiles).toBe(36_000);
    expect(basic?.estRemainingMonths).toBe(12);
    expect(basic?.estRemainingMiles).toBe(6_000);
  });

  test('mileage remaining is null when no odometer reading is provided', () => {
    const result = estimateWarranty(identityFor('TOYOTA', 2023), null, NOW);
    const basic = result.data?.rows.find((row) => row.coverage.startsWith('Basic'));
    expect(basic?.estRemainingMonths).toBe(12);
    expect(basic?.estRemainingMiles).toBeNull();
    expect(result.data?.assumptionNote).toMatch(/No odometer reading/);
  });

  test('expired-by-time coverage clamps to null with an expiry note', () => {
    const result = estimateWarranty(identityFor('HONDA', 2003), 50_000, NOW);
    const basic = result.data?.rows.find((row) => row.coverage.startsWith('Basic'));
    expect(basic?.estRemainingMonths).toBeNull();
    expect(basic?.estRemainingMiles).toBeNull();
    expect(basic?.note).toMatch(/expired/i);
  });

  test('expired-by-mileage coverage is null even when time remains', () => {
    const result = estimateWarranty(identityFor('TOYOTA', 2024), 40_000, NOW);
    const basic = result.data?.rows.find((row) => row.coverage.startsWith('Basic'));
    expect(basic?.estRemainingMonths).toBeNull();
    expect(basic?.estRemainingMiles).toBeNull();
    expect(basic?.note).toMatch(/mileage/i);
  });

  test('Hyundai powertrain is 120/100k with the original-owner note', () => {
    const result = estimateWarranty(identityFor('HYUNDAI', 2023), null, NOW);
    const powertrain = result.data?.rows.find((row) => row.coverage === 'Powertrain');
    expect(powertrain?.termMonths).toBe(120);
    expect(powertrain?.termMiles).toBe(100_000);
    expect(powertrain?.note).toMatch(/original owner/i);
  });

  test('unlimited-mileage corrosion never reports miles remaining', () => {
    const result = estimateWarranty(identityFor('TOYOTA', 2023), 10_000, NOW);
    const corrosion = result.data?.rows.find((row) => row.coverage.startsWith('Corrosion'));
    expect(corrosion?.estRemainingMonths).toBe(36);
    expect(corrosion?.estRemainingMiles).toBeNull();
    expect(Number.isFinite(corrosion?.termMiles)).toBe(false);
  });

  test('make lookup is case-insensitive (vPIC uppercase makes)', () => {
    expect(estimateWarranty(identityFor('MERCEDES-BENZ', 2023), null, NOW).status).toBe('hit');
    expect(estimateWarranty(identityFor('Kia', 2023), null, NOW).status).toBe('hit');
  });

  test('unknown brand returns a miss with a note', () => {
    const result = estimateWarranty(identityFor('FERRARI', 2023), null, NOW);
    expect(result.status).toBe('miss');
    expect(result.note).toMatch(/FERRARI/);
    expect(result.data).toBeUndefined();
  });

  test('missing model year returns a miss with a note', () => {
    const result = estimateWarranty(identityFor('TOYOTA', null), null, NOW);
    expect(result.status).toBe('miss');
    expect(result.note).toMatch(/model year/i);
  });

  test('future model year clamps elapsed months to zero (full term remains)', () => {
    const result = estimateWarranty(identityFor('TOYOTA', 2026), null, NOW);
    const basic = result.data?.rows.find((row) => row.coverage.startsWith('Basic'));
    expect(basic?.estRemainingMonths).toBe(36);
  });
});
