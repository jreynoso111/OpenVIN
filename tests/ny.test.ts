import { describe, expect, test } from 'vitest';
import { REGISTRATION_FIELDS, mapRegistrationRow, mapInspectionRow, parseInspections, parseRegistrations } from '../src/lib/api/ny';

// Trimmed from a real data.ny.gov vezn-fmmk row; only vehicle fields kept.
const NY_ROW = {
  vin: '4T1BF3EK8BU189748',
  model_year: '2011',
  make_code: 'TOYOT',
  model_name: 'CAMRY',
  inspection_date: '2025-03-13T12:17:50.000',
  inspection_type: 'INITIAL INSPECTION',
  odometer_reading: '267968',
  initial_emission_result: 'PASS',
  safety_inspection_result: 'PASS',
};

describe('mapInspectionRow', () => {
  test('maps miles, ISO date, source, and a result note', () => {
    const reading = mapInspectionRow(NY_ROW);
    expect(reading).toMatchObject({
      date: '2025-03-13',
      miles: 267968,
      source: 'NY State inspection',
      note: 'INITIAL INSPECTION · Safety: PASS · Emissions: PASS',
    });
  });

  test('keeps the rest of the inspection record, dropping "none" values', () => {
    const reading = mapInspectionRow({
      ...NY_ROW,
      inspection_expiration: '2026-03-31T00:00:00.000',
      no_registration_reason: 'VEHICLE WITH OUT OF STATE REGISTRATION OR TITLE',
      fuel_type: 'DIESEL',
      hybrid: 'FALSE',
      vehicle_weight_class: '18,001+',
      nyma: 'IN NYMA',
      on_board_diagnostic_check: 'NOT APPLICABLE',
      inspection_test_type: 'HEAVY DUTY OPACITY',
      wheel_removed_1: 'LEFT REARMOST BRAKE DRUM OR HUB AND DRUM ASSEMBLY',
      wheel_removed_2: 'RIGHT REARMOST BRAKE DRUM OR HUB AND DRUM ASSEMBLY',
      warning_message: 'NONE',
      advisory_message: 'NONE',
      emissions_waiver_issued: 'NO',
      ten_day_extension_issued: 'YES',
    });
    expect(reading?.ny).toMatchObject({
      type: 'INITIAL INSPECTION',
      validThrough: '2026-03-31',
      safety: 'PASS',
      emissions: 'PASS',
      obd: null,
      warning: null,
      advisory: null,
      emissionsWaiver: false,
      tenDayExtension: true,
      noRegistrationReason: 'VEHICLE WITH OUT OF STATE REGISTRATION OR TITLE',
      metroArea: 'IN NYMA',
      testType: 'HEAVY DUTY OPACITY',
      componentsRemoved: [
        'LEFT REARMOST BRAKE DRUM OR HUB AND DRUM ASSEMBLY',
        'RIGHT REARMOST BRAKE DRUM OR HUB AND DRUM ASSEMBLY',
      ],
      vehicle: { year: '2011', make: 'TOYOT', model: 'CAMRY', fuel: 'DIESEL', hybrid: false, weightClass: '18,001+' },
    });
  });

  test('skips rows with null or zero odometer', () => {
    expect(mapInspectionRow({ ...NY_ROW, odometer_reading: '0' })).toBeNull();
    expect(mapInspectionRow({ ...NY_ROW, odometer_reading: null })).toBeNull();
    expect(mapInspectionRow({ ...NY_ROW, odometer_reading: undefined })).toBeNull();
  });

  test('skips rows without an inspection date', () => {
    expect(mapInspectionRow({ ...NY_ROW, inspection_date: undefined })).toBeNull();
  });

  test('note omits missing result fields', () => {
    const reading = mapInspectionRow({
      ...NY_ROW,
      inspection_type: undefined,
      initial_emission_result: undefined,
    });
    expect(reading?.note).toBe('Safety: PASS');
  });
});

describe('parseInspections', () => {
  test('sorts ascending by date and dedupes identical (date, miles)', () => {
    const rows = [
      { ...NY_ROW, inspection_date: '2025-03-13T12:17:50.000', odometer_reading: '267968' },
      { ...NY_ROW, inspection_date: '2021-12-06T12:50:23.000', odometer_reading: '190675' },
      { ...NY_ROW, inspection_date: '2025-03-13T08:00:00.000', odometer_reading: '267968' },
      { ...NY_ROW, inspection_date: '2022-12-05T11:45:11.000', odometer_reading: '216223' },
    ];
    const readings = parseInspections(rows);
    expect(readings?.map((r) => r.miles)).toEqual([190675, 216223, 267968]);
    expect(readings?.map((r) => r.date)).toEqual(['2021-12-06', '2022-12-05', '2025-03-13']);
  });

  test('empty array parses to empty', () => {
    expect(parseInspections([])).toEqual([]);
  });

  test('non-array bodies yield null', () => {
    expect(parseInspections({ error: true })).toBeNull();
    expect(parseInspections(null)).toBeNull();
  });
});

describe('NY registration (vehicle facts only)', () => {
  test('never requests registrant, location or person-level flag fields', () => {
    const banned = ['city', 'state', 'zip', 'county', 'scofflaw_indicator', 'suspension_indicator', 'revocation_indicator'];
    for (const name of banned) expect(REGISTRATION_FIELDS).not.toContain(name);
  });

  test('maps the vehicle fields and ignores anything else the row carries', () => {
    const row = {
      vin: '4T1BF3EK8BU189748',
      record_type: 'VEH',
      registration_class: 'PAS',
      body_type: '4DSD',
      fuel_type: 'GAS',
      unladen_weight: '3263',
      color: 'GY',
      reg_valid_date: '2025-12-27T00:00:00.000',
      reg_expiration_date: '2028-01-10T00:00:00.000',
      model_year: '2011',
      make: 'TOYOT',
      city: 'SOMEWHERE',
      zip: '12345',
      suspension_indicator: 'Y',
    };
    const mapped = mapRegistrationRow(row);
    expect(mapped).toEqual({
      recordType: 'VEH',
      registrationClass: 'PAS',
      bodyType: '4DSD',
      fuel: 'GAS',
      color: 'GY',
      unladenWeight: 3263,
      maxGrossWeight: null,
      passengers: null,
      validFrom: '2025-12-27',
      expires: '2028-01-10',
      modelYear: '2011',
      make: 'TOYOT',
    });
    expect(JSON.stringify(mapped)).not.toMatch(/SOMEWHERE|12345/);
  });

  test('sorts newest expiry first and rejects a non-array body', () => {
    const rows = parseRegistrations([
      { reg_expiration_date: '2024-01-01T00:00:00.000' },
      { reg_expiration_date: '2028-01-01T00:00:00.000' },
    ]);
    expect(rows?.map((r) => r.expires)).toEqual(['2028-01-01', '2024-01-01']);
    expect(parseRegistrations({ error: true })).toBeNull();
  });
});
