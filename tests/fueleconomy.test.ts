import { describe, expect, test } from 'vitest';
import type { VehicleIdentity } from '../src/lib/types';
import {
  mapFuelEconomyVehicle,
  parseMenuItems,
  parseOptionText,
  pickModelName,
  pickOption,
} from '../src/lib/api/fueleconomy';

// Trimmed from real fueleconomy.gov responses (2003 Honda Accord).
const OPTIONS_BODY = {
  menuItem: [
    { text: 'Auto 5-spd, 4 cyl, 2.4 L', value: '18655' },
    { text: 'Auto 5-spd, 6 cyl, 3.0 L', value: '18657' },
    { text: 'Man 5-spd, 4 cyl, 2.4 L', value: '18656' },
    { text: 'Man 6-spd, 6 cyl, 3.0 L', value: '18658' },
  ],
};

const VEHICLE_BODY = {
  city08: '19',
  comb08: '22',
  highway08: '27',
  co2TailpipeGpm: '403.95454545454544',
  cylinders: '6',
  displ: '3.0',
  fuelType: 'Regular',
  fuelType1: 'Regular Gasoline',
  id: '18657',
  make: 'Honda',
  model: 'Accord',
  trany: 'Automatic 5-spd',
  year: '2003',
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
      cylinders: 6,
      displacementL: 2.998832712,
      horsepower: 240,
      fuelType: 'Gasoline',
      configuration: 'V-Shaped',
    },
    driveType: null,
    transmission: 'Automatic 5-spd',
    plant: { city: null, state: null, country: null },
    gvwr: null,
    decodeWarning: null,
    ...overrides,
  };
}

describe('parseMenuItems', () => {
  test('parses an array of items', () => {
    expect(parseMenuItems(OPTIONS_BODY)).toHaveLength(4);
  });

  test('wraps the single-item object form in an array', () => {
    const body = { menuItem: { text: 'Man 6-spd, 4 cyl, 2.0 L', value: '18314' } };
    expect(parseMenuItems(body)).toEqual([{ text: 'Man 6-spd, 4 cyl, 2.0 L', value: '18314' }]);
  });

  test('null body (no matches) yields empty', () => {
    expect(parseMenuItems(null)).toEqual([]);
    expect(parseMenuItems({ menuItem: null })).toEqual([]);
  });
});

describe('parseOptionText', () => {
  test('extracts displacement, cylinders, and transmission', () => {
    expect(parseOptionText('Auto 5-spd, 6 cyl, 3.0 L')).toEqual({
      displacementL: 3.0,
      cylinders: 6,
      isAutomatic: true,
    });
    expect(parseOptionText('Man 6-spd, 4 cyl, 2.0 L').isAutomatic).toBe(false);
  });

  test('missing pieces are null', () => {
    expect(parseOptionText('Unknown option')).toEqual({
      displacementL: null,
      cylinders: null,
      isAutomatic: null,
    });
  });
});

describe('pickOption', () => {
  const options = parseMenuItems(OPTIONS_BODY);

  test('matches on displacement (±0.1 L), cylinders, and transmission', () => {
    // vPIC 2.9988 L, 6 cyl, Automatic → "Auto 5-spd, 6 cyl, 3.0 L"
    expect(pickOption(options, identityWith({}))?.value).toBe('18657');
  });

  test('manual transmission flips the pick', () => {
    const picked = pickOption(options, identityWith({ transmission: 'Manual 6-spd' }));
    expect(picked?.value).toBe('18658');
  });

  test('no engine signal falls back to the first option', () => {
    const picked = pickOption(
      options,
      identityWith({
        transmission: null,
        engine: {
          cylinders: null,
          displacementL: null,
          horsepower: null,
          fuelType: null,
          configuration: null,
        },
      }),
    );
    expect(picked?.value).toBe('18655');
  });

  test('empty option list yields null', () => {
    expect(pickOption([], identityWith({}))).toBeNull();
  });
});

describe('pickModelName', () => {
  const models = [
    { text: 'Accord', value: 'Accord' },
    { text: 'Civic 4Dr', value: 'Civic 4Dr' },
    { text: 'CR-V 4WD', value: 'CR-V 4WD' },
  ];

  test('exact match wins, case-insensitively', () => {
    expect(pickModelName(models, 'accord')).toBe('Accord');
  });

  test('falls back to startsWith for EPA suffixed names', () => {
    expect(pickModelName(models, 'Civic')).toBe('Civic 4Dr');
  });

  test('contains works in both directions', () => {
    expect(pickModelName(models, 'CR-V 4WD Touring')).toBe('CR-V 4WD');
  });

  test('no match yields null', () => {
    expect(pickModelName(models, 'Odyssey')).toBeNull();
    expect(pickModelName(models, '')).toBeNull();
  });
});

describe('mapFuelEconomyVehicle', () => {
  test('maps mpg, CO2, and fuel type', () => {
    const economy = mapFuelEconomyVehicle(VEHICLE_BODY, '2003 HONDA Accord', 'approximate');
    expect(economy).toEqual({
      city: 19,
      highway: 27,
      combined: 22,
      co2GramsPerMile: 404,
      fuelType: 'Regular Gasoline',
      matchedName: '2003 HONDA Accord',
      matchQuality: 'approximate',
    });
  });

  test('non-positive CO2 becomes null', () => {
    const economy = mapFuelEconomyVehicle(
      { ...VEHICLE_BODY, co2TailpipeGpm: '0.0' },
      'x',
      'exact',
    );
    expect(economy.co2GramsPerMile).toBeNull();
    expect(economy.matchQuality).toBe('exact');
  });
});
