import { describe, expect, test } from 'vitest';
import {
  mapComplaintRecord,
  parseComplaintsResponse,
  summarizeComplaints,
} from '../src/lib/api/complaints';

// Trimmed from a real complaintsByVehicle response (2003 Honda Accord).
// NHTSA publishes these anonymized; only fields our types use are kept.
const COMPLAINT_RECORD = {
  odiNumber: 11746949,
  crash: true,
  fire: false,
  numberOfInjuries: 1,
  numberOfDeaths: 0,
  dateOfIncident: '06/18/2026',
  dateComplaintFiled: '06/27/2026',
  vin: 'JHMCM56323C',
  components: 'AIR BAGS',
  summary: 'The front driver airbag did not deploy in a rear-end collision.',
};

describe('mapComplaintRecord', () => {
  test('maps fields and converts dates to ISO', () => {
    const record = mapComplaintRecord(COMPLAINT_RECORD);
    expect(record.odiNumber).toBe(11746949);
    expect(record.dateComplaintFiled).toBe('2026-06-27');
    expect(record.dateOfIncident).toBe('2026-06-18');
    expect(record.components).toBe('AIR BAGS');
    expect(record.crash).toBe(true);
    expect(record.fire).toBe(false);
    expect(record.numberOfInjuries).toBe(1);
    expect(record.numberOfDeaths).toBe(0);
    expect(record.vinPrefix).toBe('JHMCM56323C');
  });

  test('missing incident date and vin degrade gracefully', () => {
    const record = mapComplaintRecord({ ...COMPLAINT_RECORD, dateOfIncident: null, vin: '' });
    expect(record.dateOfIncident).toBeNull();
    expect(record.vinPrefix).toBe('');
  });

  test('vin prefix is uppercased', () => {
    const record = mapComplaintRecord({ ...COMPLAINT_RECORD, vin: 'jhmcm56323c' });
    expect(record.vinPrefix).toBe('JHMCM56323C');
  });
});

describe('parseComplaintsResponse', () => {
  test('parses the results array', () => {
    const body = { count: 1, message: 'ok', results: [COMPLAINT_RECORD] };
    expect(parseComplaintsResponse(body)).toHaveLength(1);
  });

  test.each([null, [], { results: 'x' }])('bad shape %j yields null', (body) => {
    expect(parseComplaintsResponse(body)).toBeNull();
  });
});

describe('summarizeComplaints', () => {
  const records = [
    mapComplaintRecord(COMPLAINT_RECORD),
    mapComplaintRecord({ ...COMPLAINT_RECORD, odiNumber: 2, vin: '1HGCM82633A', crash: false, fire: true }),
    mapComplaintRecord({ ...COMPLAINT_RECORD, odiNumber: 3, vin: '', crash: false, fire: false }),
  ];

  test('matches records by 11-char squish VIN, case-insensitively', () => {
    const summary = summarizeComplaints(records, 'jhmcm56323c404453');
    expect(summary.vinMatches.map((r) => r.odiNumber)).toEqual([11746949]);
  });

  test('counts totals, crashes, and fires across the whole line', () => {
    const summary = summarizeComplaints(records, 'JHMCM56323C404453');
    expect(summary.totalForVehicleLine).toBe(3);
    expect(summary.crashCount).toBe(1);
    expect(summary.fireCount).toBe(1);
  });

  test('no matches leaves vinMatches empty', () => {
    const summary = summarizeComplaints(records, '5YJ3E1EA7HF000337');
    expect(summary.vinMatches).toEqual([]);
  });
});
