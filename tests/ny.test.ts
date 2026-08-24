import { describe, expect, test } from 'vitest';
import { mapInspectionRow, parseInspections } from '../src/lib/api/ny';

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
    expect(reading).toEqual({
      date: '2025-03-13',
      miles: 267968,
      source: 'NY State inspection',
      note: 'INITIAL INSPECTION · Safety: PASS · Emissions: PASS',
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
