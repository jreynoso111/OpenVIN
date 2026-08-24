import { describe, expect, test } from 'vitest';
import { extractVpicRecord, mapVpicRecord, toDecodeWarning } from '../src/lib/api/vpic';

// Trimmed from a real vPIC DecodeVinValues response for 1HGCM82633A004352.
const VPIC_RECORD = {
  BodyClass: 'Coupe',
  DisplacementL: '2.998832712',
  Doors: '2',
  DriveType: '',
  EngineConfiguration: 'V-Shaped',
  EngineCylinders: '6',
  EngineHP: '240',
  ErrorCode: '0',
  ErrorText: '0 - VIN decoded clean. Check Digit (9th position) is correct',
  FuelTypePrimary: 'Gasoline',
  GVWR: 'Class 1C: 4,001 - 5,000 lb (1,814 - 2,268 kg)',
  Make: 'HONDA',
  Model: 'Accord',
  ModelYear: '2003',
  PlantCity: 'MARYSVILLE',
  PlantCountry: 'UNITED STATES (USA)',
  PlantState: 'OHIO',
  Series: '',
  TransmissionSpeeds: '5',
  TransmissionStyle: 'Automatic',
  Trim: 'EX-V6',
  VIN: '1HGCM82633A004352',
  VehicleType: 'PASSENGER CAR',
};

describe('mapVpicRecord', () => {
  const identity = mapVpicRecord(VPIC_RECORD, '1HGCM82633A004352');

  test('maps identity fields', () => {
    expect(identity.vin).toBe('1HGCM82633A004352');
    expect(identity.modelYear).toBe(2003);
    expect(identity.make).toBe('HONDA');
    expect(identity.model).toBe('Accord');
    expect(identity.trim).toBe('EX-V6');
    expect(identity.bodyClass).toBe('Coupe');
    expect(identity.vehicleType).toBe('PASSENGER CAR');
  });

  test('parses engine numbers safely', () => {
    expect(identity.engine.cylinders).toBe(6);
    expect(identity.engine.displacementL).toBeCloseTo(2.9988, 3);
    expect(identity.engine.horsepower).toBe(240);
    expect(identity.engine.fuelType).toBe('Gasoline');
    expect(identity.engine.configuration).toBe('V-Shaped');
  });

  test('empty strings become null', () => {
    expect(identity.series).toBeNull();
    expect(identity.driveType).toBeNull();
  });

  test('combines transmission style and speeds', () => {
    expect(identity.transmission).toBe('Automatic 5-spd');
  });

  test('maps the assembly plant', () => {
    expect(identity.plant).toEqual({
      city: 'MARYSVILLE',
      state: 'OHIO',
      country: 'UNITED STATES (USA)',
    });
  });

  test('clean decode yields no warning', () => {
    expect(identity.decodeWarning).toBeNull();
  });

  test('missing fields degrade to null / empty string', () => {
    const sparse = mapVpicRecord({ Make: 'HONDA' }, 'X');
    expect(sparse.modelYear).toBeNull();
    expect(sparse.model).toBe('');
    expect(sparse.engine.cylinders).toBeNull();
    expect(sparse.transmission).toBeNull();
  });
});

describe('toDecodeWarning', () => {
  test('clean decode (code 0) is null', () => {
    expect(toDecodeWarning('0', '0 - VIN decoded clean. Check Digit (9th position) is correct')).toBeNull();
  });

  test('real error text is surfaced', () => {
    const text = '8 - No detailed data available currently';
    expect(toDecodeWarning('8', text)).toBe(text);
  });

  test('missing fields are null', () => {
    expect(toDecodeWarning(undefined, undefined)).toBeNull();
  });
});

describe('extractVpicRecord', () => {
  test('extracts Results[0]', () => {
    const body = { Count: 1, Results: [VPIC_RECORD] };
    expect(extractVpicRecord(body)?.['Make']).toBe('HONDA');
  });

  test.each([null, 'nope', {}, { Results: [] }, { Results: 'x' }])(
    'bad shape %j yields null',
    (body) => {
      expect(extractVpicRecord(body)).toBeNull();
    },
  );
});
