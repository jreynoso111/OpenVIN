/**
 * NHTSA ODI complaints by year/make/model (Tier 0, CORS: reflects Origin).
 * Records carry an 11-char truncated VIN. A prefix match cannot identify the
 * exact 17-character vehicle. Complaint data is published anonymized.
 */

import type { ComplaintRecord, ComplaintsSummary, SectionResult, VehicleIdentity } from '../types';
import { squishVin } from '../vin';
import { asArray, asRecord, fetchJson, intOrNull, stringOrNull, usDateToIso } from './http';

const COMPLAINTS_URL = 'https://api.nhtsa.gov/complaints/complaintsByVehicle';

const SOURCE = {
  name: 'NHTSA Complaints (ODI)',
  url: 'https://www.nhtsa.gov/report-a-safety-problem',
} as const;

/** Map one raw NHTSA complaint record to the shared ComplaintRecord shape. */
export function mapComplaintRecord(record: Record<string, unknown>): ComplaintRecord {
  const incident = stringOrNull(record['dateOfIncident']);
  return {
    odiNumber: intOrNull(record['odiNumber']) ?? 0,
    dateComplaintFiled: usDateToIso(stringOrNull(record['dateComplaintFiled']) ?? ''),
    dateOfIncident: incident === null ? null : usDateToIso(incident),
    components: stringOrNull(record['components']) ?? '',
    summary: stringOrNull(record['summary']) ?? '',
    crash: record['crash'] === true,
    fire: record['fire'] === true,
    numberOfInjuries: intOrNull(record['numberOfInjuries']) ?? 0,
    numberOfDeaths: intOrNull(record['numberOfDeaths']) ?? 0,
    vinPrefix: (stringOrNull(record['vin']) ?? '').toUpperCase(),
  };
}

/** Parse a full complaints response into records, else null on bad shape. */
export function parseComplaintsResponse(body: unknown): ComplaintRecord[] | null {
  const root = asRecord(body);
  if (!root) return null;
  const results = asArray(root['results']) ?? asArray(root['Results']);
  if (!results) return null;
  return results
    .map(asRecord)
    .filter((record): record is Record<string, unknown> => record !== null)
    .map(mapComplaintRecord);
}

/** Aggregate parsed records into the summary the UI renders. */
export function summarizeComplaints(records: readonly ComplaintRecord[], vin: string): ComplaintsSummary {
  const prefix = squishVin(vin.toUpperCase());
  return {
    vinMatches: records.filter((record) => record.vinPrefix === prefix),
    totalForVehicleLine: records.length,
    crashCount: records.filter((record) => record.crash).length,
    fireCount: records.filter((record) => record.fire).length,
  };
}

export async function getComplaints(
  identity: VehicleIdentity,
  vin: string,
): Promise<SectionResult<ComplaintsSummary>> {
  const { make, model, modelYear } = identity;
  const fetchedAt = new Date().toISOString();
  const source = { ...SOURCE, fetchedAt };

  if (make === '' || model === '' || modelYear === null) {
    return {
      status: 'unavailable',
      source,
      note: 'Complaint lookup needs the decoded make, model, and model year — the VIN decode did not provide them.',
    };
  }

  const url =
    `${COMPLAINTS_URL}?make=${encodeURIComponent(make)}` +
    `&model=${encodeURIComponent(model)}&modelYear=${modelYear}`;
  const fetched = await fetchJson(url, { acceptNhtsaEmptyResults400: true });
  if (!fetched.ok) {
    return { status: 'unavailable', source, note: `Complaint lookup failed. ${fetched.note}` };
  }

  const records = parseComplaintsResponse(fetched.data);
  if (records === null) {
    return {
      status: 'unavailable',
      source,
      note: 'The NHTSA complaint service returned an unexpected response shape.',
    };
  }

  const summary = summarizeComplaints(records, vin);
  const matchNote =
    summary.vinMatches.length > 0
      ? `${summary.vinMatches.length} NHTSA complaint record(s) share the first 11 characters of this VIN; this does not identify the exact 17-character vehicle.`
      : 'No NHTSA complaint records share this VIN’s first 11 characters; totals cover the whole year, make and model line.';
  return { status: 'hit', data: summary, source, note: matchNote };
}
